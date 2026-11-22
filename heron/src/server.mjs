// Heron control plane: REST API, API-key auth, per-key quotas, leases, usage metering.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { Browser } from './browser.mjs';

// shortcut: keys in env, plaintext compare; move to hashed keys in DB before multi-tenant launch.
const KEYS = new Map((process.env.HERON_API_KEYS || 'dev-key').split(',').map((k) => [k.trim(), { maxSessions: Number(process.env.HERON_MAX_SESSIONS || 2) }]));
const LEASE_MS = Number(process.env.HERON_LEASE_MS || 120_000);
const HOST_GAP_MS = Number(process.env.HERON_HOST_GAP_MS || 1000); // politeness: min gap between navigations per host
const PORT = Number(process.env.PORT || 8787);
const ORIGIN_SECRET = process.env.HERON_ORIGIN_SECRET || ''; // set when behind the Cloudflare Worker

mkdirSync('data', { recursive: true });
const meter = (key, type, extra = {}) =>
  appendFileSync('data/usage.jsonl', JSON.stringify({ event_id: randomUUID(), ts: Date.now(), key, type, ...extra }) + '\n');

const sessions = new Map(); // id -> {key, browser, expires, busy, lastNav:Map}

const reaper = setInterval(async () => {
  for (const [id, s] of sessions) if (Date.now() > s.expires) await closeSession(id, 'lease_expired');
}, 5000);
reaper.unref();

async function closeSession(id, reason) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  await s.browser.close();
  meter(s.key, 'session_minute', { session: id, minutes: Math.ceil((Date.now() - s.started) / 60000), reason });
}

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = async (req) => { let d = ''; for await (const c of req) d += c; return d ? JSON.parse(d) : {}; };

async function politeNavigate(s, url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw httpErr(400, 'only http(s) allowed');
  const gap = Date.now() - (s.lastNav.get(u.host) || 0);
  if (gap < HOST_GAP_MS) await new Promise((r) => setTimeout(r, HOST_GAP_MS - gap));
  s.lastNav.set(u.host, Date.now());
  await s.browser.navigate(url);
}
const httpErr = (status, message) => Object.assign(new Error(message), { status });

async function runAction(s, a) {
  switch (a.type) {
    case 'navigate': await politeNavigate(s, a.url); break;
    case 'click': await s.browser.click(a.id); break;
    case 'type': await s.browser.type(a.id, String(a.text ?? ''), { clear: a.clear !== false }); break;
    case 'press': await s.browser.press(a.key); break;
    case 'scroll': await s.browser.scroll(a.dy ?? 600); break;
    case 'wait': await new Promise((r) => setTimeout(r, Math.min(Number(a.ms) || 500, 10_000))); break;
    default: throw httpErr(400, `unknown action ${a.type}`);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    let key, tenant;
    if (ORIGIN_SECRET) { // gateway mode: Cloudflare Worker already authenticated the caller
      if (req.headers['x-origin-secret'] !== ORIGIN_SECRET) return json(res, 401, { error: 'origin: bad gateway secret' });
      key = String(req.headers['x-heron-tenant'] || '');
      tenant = key && { maxSessions: Number(req.headers['x-heron-max-sessions']) || 1 };
    } else {
      key = (req.headers.authorization || '').replace(/^Bearer /, '');
      tenant = KEYS.get(key);
    }
    if (!tenant) return json(res, 401, { error: 'invalid api key' });
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean); // sessions/:id/:sub

    if (parts[0] !== 'sessions') return json(res, 404, { error: 'not found' });

    if (req.method === 'POST' && parts.length === 1) {
      const mine = [...sessions.values()].filter((s) => s.key === key).length;
      if (mine >= tenant.maxSessions) return json(res, 429, { error: 'concurrent session limit', limit: tenant.maxSessions });
      const opts = await readBody(req);
      const browser = await Browser.launch(opts);
      const id = 's_' + randomUUID().slice(0, 8);
      sessions.set(id, { key, browser, started: Date.now(), expires: Date.now() + LEASE_MS, lastNav: new Map() });
      return json(res, 201, { id, lease_ms: LEASE_MS });
    }

    const s = sessions.get(parts[1]);
    if (!s || s.key !== key) return json(res, 404, { error: 'no such session (closed or lease expired)' });
    if (s.busy) return json(res, 409, { error: 'session busy; actions are serialized' });
    s.expires = Date.now() + LEASE_MS; // any call is a heartbeat

    if (req.method === 'DELETE' && parts.length === 2) { await closeSession(parts[1], 'client_close'); return json(res, 200, { closed: true }); }
    const sub = parts[2];
    if (req.method === 'POST' && sub === 'heartbeat') return json(res, 200, { lease_ms: LEASE_MS });

    s.busy = true;
    try {
      if (req.method === 'POST' && sub === 'actions') {
        const a = await readBody(req);
        await runAction(s, a);
        meter(key, 'action', { session: parts[1], action: a.type });
        return json(res, 200, { ok: true, snapshot: await s.browser.snapshot() }); // result includes new page state
      }
      if (req.method === 'GET' && sub === 'snapshot') return json(res, 200, await s.browser.snapshot());
      if (req.method === 'GET' && sub === 'screenshot') {
        meter(key, 'screenshot', { session: parts[1] });
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(await s.browser.screenshot());
      }
    } finally { s.busy = false; }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`heron listening on http://127.0.0.1:${PORT} (keys: ${[...KEYS.keys()].length})`));
export { server, sessions };
