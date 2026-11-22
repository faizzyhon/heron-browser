#!/usr/bin/env node
// Heron MCP server. stdio by default (Claude Code / Claude Desktop); --http for a remote connector endpoint.
// Env: HERON_URL (default http://127.0.0.1:8787), HERON_API_KEY, and for --http: MCP_AUTH_TOKEN, MCP_PORT.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import http from 'node:http';
import { z } from 'zod';

const HERON_URL = (process.env.HERON_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const HERON_API_KEY = process.env.HERON_API_KEY || 'dev-key';

// shortcut: one shared browser session per MCP process; per-client sessions when multi-user remote is needed.
let sessionId = null;

async function heron(path, method = 'GET', body) {
  const r = await fetch(HERON_URL + path, {
    method, headers: { authorization: `Bearer ${HERON_API_KEY}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r;
}

async function ensureSession() {
  if (sessionId) return sessionId;
  const r = await heron('/sessions', 'POST', {});
  const j = await r.json();
  if (!r.ok) throw new Error(`cannot open session: ${j.error}`);
  return (sessionId = j.id);
}

async function withSession(fn) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fn(await ensureSession());
    if (r.status === 404 && attempt === 0) { sessionId = null; continue; } // lease expired -> fresh session
    return r;
  }
}

const KEYS = { enter: '', tab: '', escape: '', backspace: '', down: '', up: '' };

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ ...text(t), isError: true });

async function read(params = {}) {
  const q = new URLSearchParams(params);
  const r = await withSession((id) => heron(`/sessions/${id}/read?${q}`));
  const t = await r.text();
  return r.ok ? text(t) : fail(`heron error ${r.status}: ${t}`);
}

// Actions return only what changed on the page (diff); a new URL returns the new page.
async function act(action) {
  const r = await withSession((id) => heron(`/sessions/${id}/actions`, 'POST', action));
  if (!r.ok) return fail(`heron error ${r.status}: ${(await r.json()).error}`);
  return read({ diff: '1' });
}

export function buildServer() {
  const server = new McpServer({ name: 'heron', version: '0.0.1' });
  const tool = (name, description, inputSchema, handler) =>
    server.registerTool(name, { description, inputSchema }, async (args) => {
      try { return await handler(args); } catch (e) { return fail(String(e.message || e)); }
    });

  tool('heron_navigate', 'Open an http(s) URL in a real Firefox browser session and return page 1 of the page text (see heron_read for more pages). Respects per-host rate limits.',
    { url: z.string().url() }, async ({ url }) => {
      const r = await withSession((id) => heron(`/sessions/${id}/actions`, 'POST', { type: 'navigate', url }));
      return r.ok ? read() : fail(`heron error ${r.status}: ${(await r.json()).error}`);
    });

  tool('heron_read', 'Read the COMPLETE current page as compact text (headings, paragraphs, lists, tables; interactive elements inline as ⟨id kind "label"⟩, usable with click/type). Paged by token budget: pass page=2,3.. when the header says page 1/N. mode=main (default) drops nav/footer/sidebars; mode=full keeps everything. links=true adds link targets.',
    { page: z.number().int().min(1).default(1), max_tokens: z.number().int().min(500).max(20000).default(4000), mode: z.enum(['main', 'full']).default('main'), links: z.boolean().default(false) },
    ({ page, max_tokens, mode, links }) => read({ page, max_tokens, mode, links: links ? '1' : '0' }));

  tool('heron_click', 'Click an element by its id. Returns only what changed on the page, or the new page if the URL changed.',
    { id: z.string() }, ({ id }) => act({ type: 'click', id }));

  tool('heron_type', 'Type text into an input by id (replaces existing text). Set submit=true to press Enter afterwards.',
    { id: z.string(), text: z.string(), submit: z.boolean().optional() },
    async ({ id, text: t, submit }) => {
      const r = await act({ type: 'type', id, text: t });
      return submit && !r.isError ? act({ type: 'press', key: KEYS.enter }) : r;
    });

  tool('heron_press', 'Press a key: enter, tab, escape, backspace, up, down.',
    { key: z.enum(['enter', 'tab', 'escape', 'backspace', 'up', 'down']) }, ({ key }) => act({ type: 'press', key: KEYS[key] }));

  tool('heron_scroll', 'Scroll the page vertically by dy pixels (positive = down).',
    { dy: z.number().int().default(600) }, ({ dy }) => act({ type: 'scroll', dy }));

  tool('heron_screenshot', 'Take a PNG screenshot of the current viewport.', {}, async () => {
    const r = await withSession((id) => heron(`/sessions/${id}/screenshot`));
    if (!r.ok) return fail(`heron error ${r.status}: ${(await r.json()).error}`);
    return { content: [{ type: 'image', data: Buffer.from(await r.arrayBuffer()).toString('base64'), mimeType: 'image/png' }] };
  });

  tool('heron_close', 'Close the browser session and free resources. Do this when finished.', {}, async () => {
    if (sessionId) { await heron(`/sessions/${sessionId}`, 'DELETE'); sessionId = null; }
    return text('closed');
  });

  return server;
}

async function main() {
  if (!process.argv.includes('--http')) {
    await buildServer().connect(new StdioServerTransport());
    return;
  }
  const token = process.env.MCP_AUTH_TOKEN;
  if (!token) { console.error('MCP_AUTH_TOKEN required for --http'); process.exit(1); }
  const port = Number(process.env.MCP_PORT || 8788);
  http.createServer(async (req, res) => {
    if (req.url?.split('?')[0] !== '/mcp') { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('unauthorized'); return; }
    let body;
    if (req.method === 'POST') { let d = ''; for await (const c of req) d += c; try { body = JSON.parse(d); } catch { res.writeHead(400).end(); return; } }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true }); // stateless
    res.on('close', () => transport.close());
    await buildServer().connect(transport);
    await transport.handleRequest(req, res, body);
  }).listen(port, '127.0.0.1', () => console.error(`heron-mcp http on http://127.0.0.1:${port}/mcp`));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('index.mjs')) main();
