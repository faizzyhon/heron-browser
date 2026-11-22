# Heron: complete setup guide

1. [Architecture](#1-architecture)
2. [Prerequisites](#2-prerequisites)
3. [Install and verify](#3-install-and-verify)
4. [Run the API locally](#4-run-the-api-locally)
5. [Connect Claude (MCP)](#5-connect-claude-mcp)
6. [Go public with Cloudflare](#6-go-public-with-cloudflare)
7. [Move to a Linux VPS (Hostinger)](#7-move-to-a-linux-vps-hostinger)
8. [API reference](#8-api-reference)
9. [Configuration reference](#9-configuration-reference)
10. [Security and compliance checklist](#10-security-and-compliance-checklist)
11. [Troubleshooting](#11-troubleshooting)
12. [Maintenance](#12-maintenance)

---

## 1. Architecture

```
Claude / agent ──MCP (stdio)──> heron-mcp ──HTTP──┐
                                                  ├──> heron origin (Node + Firefox, one profile per session)
Any HTTP client ──HTTPS──> Cloudflare Worker ─Tunnel┘
                           (API-key auth, tenants in KV)
```

| Component | Folder | Runs on |
|---|---|---|
| Origin: API, sessions, Firefox driver, page reader, metering | `heron/` | your PC or a Linux VPS |
| MCP server (tools for Claude) | `mcp/` | same machine as the Claude client |
| Gateway Worker | `worker/` | Cloudflare (free tier) |

**Cloudflare's free plan cannot run the browser.** Workers cannot launch Firefox, and Cloudflare's Browser Rendering is Chromium-based and not free. Cloudflare provides only the front door (auth, tenants) and a free Tunnel to your machine. The browsers always run on hardware you control. Rented sessions only work while that machine is online. Budget ~300 to 800 MB RAM per concurrent session.

## 2. Prerequisites
| Need | Version | Check |
|---|---|---|
| Node.js | 22 or newer (tested on 26) | `node -v` |
| Firefox | any current release | Windows default path is auto-detected; otherwise set `HERON_FIREFOX` |
| git | any | `git --version` |
| Cloudflare account + `cloudflared` | only for step 6 | free |
| Claude Code or Claude Desktop | only for step 5 | |

Linux: `sudo apt install firefox` (or the Mozilla tarball; set `HERON_FIREFOX=/path/to/firefox`). Headless needs no display server.

## 3. Install and verify
```bash
git clone https://github.com/faizzyhon/heron-browser
cd heron-browser
cd heron && npm test          # expect: PASS (smoke) and PASS api
cd ../worker && npm test      # expect: PASS gateway
cd ../mcp && npm install && npm test   # expect: PASS mcp
```
`heron/` has no dependencies to install. `npm test` there launches a real Firefox against a local page and example.com.

## 4. Run the API locally
```powershell
cd heron
$env:HERON_API_KEYS="my-secret-key"      # comma-separate several keys
npm start                                # http://127.0.0.1:8787
```
(Linux/macOS: `HERON_API_KEYS=my-secret-key npm start`.)

Try it:
```powershell
$h = @{Authorization="Bearer my-secret-key"}; $u="http://127.0.0.1:8787"
$s = Invoke-RestMethod "$u/sessions" -Method Post -Headers $h -Body '{}' -ContentType application/json
Invoke-RestMethod "$u/sessions/$($s.id)/actions" -Method Post -Headers $h -ContentType application/json -Body '{"type":"navigate","url":"https://example.com"}' | Out-Null
Invoke-RestMethod "$u/sessions/$($s.id)/read" -Headers $h        # whole page as compact text
Invoke-RestMethod "$u/sessions/$($s.id)" -Method Delete -Headers $h
```
Idle sessions are closed after the lease (default 2 min) and usage is appended to `heron/data/usage.jsonl`.

## 5. Connect Claude (MCP)
Install once: `cd mcp && npm install`. Keep the origin from step 4 running.

**Claude Code.** Open this repo folder in Claude Code; [.mcp.json](../.mcp.json) is picked up, approve it. Or add manually:
```bash
claude mcp add heron -e HERON_URL=http://127.0.0.1:8787 -e HERON_API_KEY=my-secret-key -- node /full/path/to/heron-browser/mcp/src/index.mjs
```
**Claude Desktop.** Settings, Developer, Edit Config, add:
```json
{ "mcpServers": { "heron": { "command": "node",
  "args": ["C:\\full\\path\\to\\heron-browser\\mcp\\src\\index.mjs"],
  "env": { "HERON_URL": "http://127.0.0.1:8787", "HERON_API_KEY": "my-secret-key" } } } }
```
Restart, then ask: *"Use heron to open en.wikipedia.org and summarize the Gecko article."*

**Tools:**
| Tool | Does |
|---|---|
| `heron_navigate(url)` | open an http(s) URL; returns page 1 of the page text |
| `heron_read(page, max_tokens, mode, links)` | read the whole page, paged by token budget. `mode=main` (default) drops nav/footer; `full` keeps all; `links=true` adds link targets |
| `heron_click(id)` / `heron_type(id, text, submit)` / `heron_press(key)` / `heron_scroll(dy)` | act; returns only what changed if the URL is the same |
| `heron_screenshot()` | PNG of the viewport |
| `heron_close()` | free the browser |

The claude.ai web connector (remote HTTP) is not ready: it likely needs OAuth. See [MCP.md](MCP.md).

## 6. Go public with Cloudflare
1. **Origin secret** (only the gateway may call your origin):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Start the origin with it (this switches the origin into gateway mode):
   ```powershell
   $env:HERON_ORIGIN_SECRET="<secret>"; npm start      # in heron/
   ```
2. **Tunnel** to the origin.
   - Quick test (no domain, URL changes every run): `cloudflared tunnel --url http://127.0.0.1:8787`, copy the `https://….trycloudflare.com` URL.
   - Stable (needs a domain on your free Cloudflare account): `cloudflared tunnel login`, `cloudflared tunnel create heron`, `cloudflared tunnel route dns heron heron-origin.example.com`, `cloudflared tunnel run --url http://127.0.0.1:8787 heron`.
3. **Deploy the gateway:**
   ```powershell
   cd worker; npm install
   npx wrangler login
   npx wrangler kv namespace create KEYS      # paste the printed id into wrangler.toml
   # edit wrangler.toml: ORIGIN_URL = your tunnel URL
   npx wrangler secret put ORIGIN_SECRET      # same value as step 1
   npx wrangler deploy                        # prints https://heron-gateway.<you>.workers.dev
   ```
4. **Create a customer key** (only a hash is stored):
   ```powershell
   npm run make-key -- acme 2        # tenant name, max concurrent sessions
   ```
   Run the `wrangler kv key put …` command it prints. Revoke by storing the same record with `"disabled":true`.
5. **Test:** repeat the step 4 calls using the gateway URL and the new key. Point the MCP server at it with `HERON_URL` / `HERON_API_KEY`.

Free-tier limits change; check Cloudflare's current Workers and KV limits before renting to others.

## 7. Move to a Linux VPS (Hostinger)
Use a **KVM VPS** (shared hosting cannot run browsers). A 4 GB plan fits roughly 3 to 5 concurrent sessions.
```bash
sudo apt update && sudo apt install -y firefox git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
git clone https://github.com/faizzyhon/heron-browser && cd heron-browser/heron && npm test
```
Run it as a service (`/etc/systemd/system/heron.service`):
```ini
[Service]
WorkingDirectory=/home/heron/heron-browser/heron
Environment=HERON_ORIGIN_SECRET=<secret>
Environment=HERON_MAX_SESSIONS=4
ExecStart=/usr/bin/node src/server.mjs
Restart=always
User=heron
```
Install `cloudflared` as a service (`cloudflared service install <token>` from the Cloudflare Zero Trust dashboard) so the tunnel survives reboots. Close all inbound ports except SSH; the origin binds to `127.0.0.1` only.

## 8. API reference
All calls need `Authorization: Bearer <key>`. Errors are `{"error": "..."}`.

| Method and path | Purpose |
|---|---|
| `POST /sessions` body `{width?,height?,locale?,timezone?}` | new session → `{id, lease_ms}`. `429` over the key's session limit |
| `POST /sessions/:id/actions` | run one action, returns `{ok, snapshot}` |
| `GET /sessions/:id/read?mode=main\|full&page=1&max_tokens=4000&links=1&diff=1` | page as compact text (`text/plain`) |
| `GET /sessions/:id/snapshot` | element list as JSON |
| `GET /sessions/:id/screenshot` | PNG |
| `POST /sessions/:id/heartbeat` | extend the lease (any call also does) |
| `DELETE /sessions/:id` | close |

Actions (`type`): `navigate {url}` · `click {id}` · `type {id,text,clear?}` · `press {key}` (WebDriver key code, e.g. `"\uE007"` = Enter) · `scroll {dy}` · `wait {ms}` (max 10 s).

`read` output: a header (`# title`, URL, `ok|challenge_required`, `page x/N`, `~tokens`) then lines. `⟨e12 button "Go"⟩` = clickable element with id `e12`; `text⟨e5⟩` = link; `⟨e3→/path⟩` with `links=1`. Same-URL reads with `diff=1` return `+`/`-` lines only. Ids stay valid until the page is rebuilt; if a click says "not found", read again.

Actions on one session are serialized (`409` if busy). Only `http` and `https` URLs are allowed. Navigations to the same host are spaced by `HERON_HOST_GAP_MS`.

## 9. Configuration reference
| Variable | Component | Default | Meaning |
|---|---|---|---|
| `PORT` | origin | 8787 | listen port (binds 127.0.0.1) |
| `HERON_API_KEYS` | origin | `dev-key` | comma-separated keys (plaintext; local use) |
| `HERON_MAX_SESSIONS` | origin | 2 | concurrent sessions per key |
| `HERON_LEASE_MS` | origin | 120000 | idle lease before auto-close |
| `HERON_HOST_GAP_MS` | origin | 1000 | min gap between navigations to one host |
| `HERON_FIREFOX` | origin | auto | path to firefox binary |
| `HERON_ORIGIN_SECRET` | origin | unset | enables gateway mode; requires `x-origin-secret` |
| `HERON_URL` / `HERON_API_KEY` | mcp | `http://127.0.0.1:8787` / `dev-key` | where the MCP server calls |
| `MCP_AUTH_TOKEN` / `MCP_PORT` | mcp `--http` | none / 8788 | remote HTTP mode |
| `ORIGIN_URL` (wrangler.toml), `ORIGIN_SECRET` (secret), `KEYS` (KV) | worker | | gateway config |

## 10. Security and compliance checklist
- Use long random keys in production; never commit keys, `.env`, `data/`, `.wrangler/` (git-ignored).
- The origin must only be reachable through the tunnel: no port-forwarding, firewall inbound closed.
- Add a Cloudflare WAF rate-limit rule on the gateway hostname.
- Treat page content as untrusted input (prompt injection). Keep purchases, logins and destructive actions behind user confirmation in your MCP client.
- Heron reports challenges and does not bypass them, spoof fingerprints or solve CAPTCHAs. You must follow each site's terms and robots.txt (automatic robots.txt checking is not built yet).
- Before renting to others: terms of service, abuse contact, the `disabled:true` kill switch, and hashed key storage (current origin keys are plaintext).

## 11. Troubleshooting
| Symptom | Fix |
|---|---|
| `Firefox not found; set HERON_FIREFOX` | install Firefox or set the path |
| `Firefox start timeout` | another Firefox holding the profile? close stray `firefox` processes; low RAM |
| `401 invalid api key` | key not in `HERON_API_KEYS` (or in KV via the gateway) |
| `429 concurrent session limit` | close sessions (`DELETE`) or raise `HERON_MAX_SESSIONS` |
| `404 no such session` | lease expired; MCP reopens automatically, raw API users must create a new session |
| `409 session busy` | send actions one at a time |
| Page text empty or `challenge_required` | the site shows a bot check; Heron will not bypass it. Use the site's API or an approved route |
| `element eN not found` | page changed; call `heron_read` again for fresh ids |
| `502 origin unreachable` (gateway) | origin down, tunnel down, or wrong `ORIGIN_URL` |
| Tunnel URL changed | quick tunnels rotate; update `ORIGIN_URL` and redeploy, or use a named tunnel |
| Orphan `firefox` processes | they are killed on close; after a crash run `taskkill /IM firefox.exe /F` (Windows) or `pkill firefox` |

## 12. Maintenance
Update: `git pull`, rerun the three test commands from step 3. Usage log: `heron/data/usage.jsonl` (one JSON event per line: `session_minute`, `action`, `read`, `screenshot`). Rotate or aggregate it before it grows large.
