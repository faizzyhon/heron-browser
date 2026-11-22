// End-to-end: MCP client (stdio) -> heron-mcp -> heron origin -> Firefox, against a local page.
import http from 'node:http';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

process.env.PORT = '8801'; process.env.HERON_MAX_SESSIONS = '1';
const { server: heron } = await import('../../heron/src/server.mjs');

const page = http.createServer((q, s) => { s.setHeader('content-type', 'text/html'); s.end('<title>MCP t</title><input placeholder=name><button onclick="document.title=document.querySelector(\'input\').value">Set</button>'); });
await new Promise((r) => page.listen(0, '127.0.0.1', r));

const client = new Client({ name: 'test', version: '0' });
await client.connect(new StdioClientTransport({
  command: process.execPath, args: ['src/index.mjs'],
  env: { ...process.env, HERON_URL: 'http://127.0.0.1:8801', HERON_API_KEY: 'dev-key' },
}));
const call = async (name, args = {}) => (await client.callTool({ name, arguments: args }));
const txt = (r) => r.content[0].text;

try {
  const tools = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(['heron_navigate', 'heron_click', 'heron_type', 'heron_screenshot', 'heron_close'].every((n) => tools.includes(n)));
  const nav = await call('heron_navigate', { url: `http://127.0.0.1:${page.address().port}/` });
  assert.match(txt(nav), /Title: MCP t/);
  const input = txt(nav).match(/\[(e\d+)\] input/)[1];
  const button = txt(nav).match(/\[(e\d+)\] button/)[1];
  await call('heron_type', { id: input, text: 'bob' });
  assert.match(txt(await call('heron_click', { id: button })), /Title: bob/);
  const shot = await call('heron_screenshot');
  assert.equal(shot.content[0].type, 'image');
  assert.equal((await call('heron_click', { id: 'zzz' })).isError, true);
  await call('heron_close');
  console.log('PASS mcp');
} finally {
  await client.close(); page.close(); heron.close(); process.exit(0);
}
