# Heron setup guide

## How it fits together (read this first)

```
Agent/client ──HTTPS──> Cloudflare Worker (heron-gateway)  ──Tunnel──> heron origin (Node + Firefox)
                        free: auth, tenant lookup (KV)                 your Windows PC or Linux/Hostinger VPS
```

**Cloudflare's free plan cannot run the browser.** Workers have no way to launch Firefox. Cloudflare's own Browser Rendering product is Chromium-based and not free. So:

| Piece | Where | Cost |
|---|---|---|
| Gateway (auth, tenants) | Cloudflare Worker + KV | Free tier (100k requests/day, KV limits apply; check current limits) |
| Public URL to your machine | Cloudflare Tunnel (`cloudflared`) | Free |
| Browsers (Firefox) | Your PC now; Hostinger KVM VPS later | PC free; VPS paid |

Rented-out sessions only work while the origin machine is on and online. Plan capacity: ~300–800 MB RAM per session.

## Prerequisites
Node 22+, Firefox, git. For the edge: a free Cloudflare account, `cloudflared` ([download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).

## 1. Run locally (no Cloudflare)
```powershell
cd heron
npm test                      # smoke + API tests
$env:HERON_API_KEYS="my-secret-key"; npm start
```
Call it:
```powershell
$h = @{Authorization="Bearer my-secret-key"}
$s = Invoke-RestMethod http://127.0.0.1:8787/sessions -Method Post -Headers $h -Body '{}' -ContentType application/json
Invoke-RestMethod "http://127.0.0.1:8787/sessions/$($s.id)/actions" -Method Post -Headers $h -ContentType application/json -Body '{"type":"navigate","url":"https://example.com"}'
```
Env vars: `HERON_FIREFOX` (path), `HERON_MAX_SESSIONS`, `HERON_LEASE_MS`, `HERON_HOST_GAP_MS`, `PORT`.

## 2. Put the origin behind Cloudflare
1. Pick a long random origin secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Start origin in gateway mode (it then only accepts requests carrying that secret):
   ```powershell
   $env:HERON_ORIGIN_SECRET="<secret>"; npm start      # in heron/
   ```
3. Expose it with a tunnel:
   - Quick test (no domain, URL changes each run, no uptime guarantee): `cloudflared tunnel --url http://127.0.0.1:8787` → copy the `https://….trycloudflare.com` URL.
   - Stable: needs a domain on Cloudflare (free plan OK). `cloudflared tunnel login`, `cloudflared tunnel create heron`, `cloudflared tunnel route dns heron heron-origin.example.com`, run with `cloudflared tunnel run --url http://127.0.0.1:8787 heron`.

## 3. Deploy the gateway
```powershell
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create KEYS          # paste the printed id into wrangler.toml
# edit wrangler.toml: ORIGIN_URL = your tunnel URL
npx wrangler secret put ORIGIN_SECRET          # paste the same secret as step 2
npx wrangler deploy                            # prints https://heron-gateway.<you>.workers.dev
```

## 4. Create a customer key
```powershell
npm run make-key -- acme 2      # prints the key once + the wrangler command that stores its hash
```
Run the printed `wrangler kv key put ...` command. Revoke by writing `"disabled":true` to that record. Only hashes are stored.

Use the gateway URL + that key exactly like the local examples.

## Security checklist
- Never commit `.env`, secrets, `data/` (usage logs), or `.wrangler/`. `.gitignore` covers these.
- The origin must **only** be reachable via the tunnel: bind stays `127.0.0.1`, no router port-forward.
- Add a Cloudflare WAF rate-limit rule (free plan allows one) on the gateway hostname.
- Origin does not check robots.txt or sign requests yet (see ROADMAP in README).
- Terms of service + abuse kill-switch (`disabled:true`) before renting to anyone.

## Moving to Hostinger later
Use a **KVM VPS** (shared hosting can't run browsers). Install Node + Firefox, run `heron` under a service manager (systemd/pm2), run `cloudflared` as a service. Nothing else changes; update `ORIGIN_URL` if the tunnel hostname changes.
