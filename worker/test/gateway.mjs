// Unit test of the gateway with a mocked KV and origin fetch (no Cloudflare account needed).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../src/index.mjs';

const key = 'hrn_live_test';
const hash = createHash('sha256').update(key).digest('hex');
const env = {
  ORIGIN_URL: 'https://origin.test', ORIGIN_SECRET: 's3cret',
  KEYS: { get: async (k) => (k === `key:${hash}` ? { tenant: 'acme', maxSessions: 3 } : null) },
};
let seen;
globalThis.fetch = async (url, init) => { seen = { url, headers: init.headers }; return new Response('{"ok":true}'); };
const call = (auth) => worker.fetch(new Request('https://gw.test/sessions?x=1', { method: 'POST', headers: auth ? { authorization: `Bearer ${auth}` } : {}, body: '{}' }), env);

assert.equal((await call()).status, 401);
assert.equal((await call('wrong')).status, 401);
const r = await call(key);
assert.equal(r.status, 200);
assert.equal(seen.url, 'https://origin.test/sessions?x=1');
assert.equal(seen.headers.get('x-heron-tenant'), 'acme');
assert.equal(seen.headers.get('x-heron-max-sessions'), '3');
assert.equal(seen.headers.get('x-origin-secret'), 's3cret');
assert.equal(seen.headers.get('authorization'), null, 'customer key must not reach origin');
console.log('PASS gateway');
