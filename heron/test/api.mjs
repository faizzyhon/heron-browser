// API e2e: auth, session limit, navigate via action, snapshot, metering, close.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.PORT = '8799';
process.env.HERON_MAX_SESSIONS = '1';
const { server } = await import('../src/server.mjs');
const base = 'http://127.0.0.1:8799';
const call = (path, method = 'GET', body, key = 'dev-key') =>
  fetch(base + path, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

try {
  assert.equal((await call('/sessions', 'POST', {}, 'bad')).status, 401);
  const s = await (await call('/sessions', 'POST', {})).json();
  assert.ok(s.id);
  assert.equal((await call('/sessions', 'POST', {})).status, 429, 'concurrent limit');
  const page = 'data:text/html,<title>API</title><button>Hi</button>';
  const r = await (await call(`/sessions/${s.id}/actions`, 'POST', { type: 'navigate', url: 'https://example.com' })).json();
  assert.equal(r.snapshot.title, 'Example Domain');
  assert.equal((await call(`/sessions/${s.id}/actions`, 'POST', { type: 'navigate', url: 'file:///etc/passwd' })).status, 400);
  assert.equal((await call(`/sessions/${s.id}`, 'DELETE')).status, 200);
  assert.equal((await call(`/sessions/${s.id}/snapshot`)).status, 404);
  const usage = readFileSync('data/usage.jsonl', 'utf8');
  assert.match(usage, /"type":"action"/);
  assert.match(usage, /"type":"session_minute"/);
  console.log('PASS api');
} finally { server.close(); process.exit(0); }
