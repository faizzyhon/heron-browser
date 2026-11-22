// Heron edge gateway (Cloudflare Worker, free plan). Auth + tenant lookup in KV, then proxy to origin via Tunnel.
// Browsers do NOT run here: Workers cannot spawn Firefox. They run at ORIGIN_URL (your PC or a VPS).

const sha256hex = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

const json = (code, body) =>
  new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req, env) {
    const key = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!key) return json(401, { error: 'missing api key' });

    // KV record: key:<sha256(api key)> -> {"tenant":"acme","maxSessions":2,"disabled":false}
    const rec = await env.KEYS.get(`key:${await sha256hex(key)}`, 'json');
    if (!rec || rec.disabled) return json(401, { error: 'invalid api key' });

    const url = new URL(req.url);
    const headers = new Headers(req.headers);
    headers.delete('authorization'); // origin never sees the customer's key
    headers.set('x-origin-secret', env.ORIGIN_SECRET);
    headers.set('x-heron-tenant', rec.tenant);
    headers.set('x-heron-max-sessions', String(rec.maxSessions ?? 1));

    try {
      return await fetch(env.ORIGIN_URL + url.pathname + url.search, {
        method: req.method, headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      });
    } catch {
      return json(502, { error: 'origin unreachable' });
    }
  },
};
