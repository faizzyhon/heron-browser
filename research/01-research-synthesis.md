# Heron — Phase 1 Research Synthesis

Codename **Heron**: patient wader, long-running sessions.
Tags: **[DOC]** verified in a source this session · **[BG]** background knowledge, not re-verified · **[TRADE]** trade-off · **[RISK]** open risk.

Scope: resilient, consistent, *authorized* automation. Heron identifies itself honestly (signed agent / declared UA) and hands challenges to a human. It does not defeat Turnstile/CAPTCHA or spoof being a human.

---

## 1. Non-Chromium engine options

| Engine | Win | Linux | JS | Agent control | Footprint | Verdict |
|---|---|---|---|---|---|---|
| **Servo** (Rust) | yes | yes | SpiderMonkey | WebDriver server exists; ~80% of impl-conformance tests passing (Sep 2025), now in CI; Set Window Rect landed Jul 2026 **[DOC]**. Embedding API reworked around webview; `cargo add servo` **[DOC]** | low-ish | Best fit for a *Rust-native* core. Web compat still incomplete **[RISK]** for real-world sites |
| **Firefox/Gecko** (via WebDriver BiDi / Marionette) | yes | yes | SpiderMonkey | Mature, standard BiDi **[BG]** | high (~Chromium-like) | Best web compat among non-Chromium. Pragmatic MVP engine |
| **WebKitGTK / WPE** | no native Win | yes | JSC | WebDriver via WebKitWebDriver **[BG]** | medium | Linux-only worker. WPE good for headless. Not verified this session |
| **Protocol-only fetcher** (HTTP client + HTML parse, no JS) | yes | yes | none | trivial | tiny | Good for static pages, cheap tier. Fails SPA |
| **Ladybird** | alpha | yes | LibJS | immature **[BG]** | low | Watch, don't build on |

**Recommendation [TRADE]:** engine behind a trait (`BrowserDriver`). MVP = **Firefox over WebDriver BiDi** (works on Win+Linux, real compat). Add **Servo** driver as second backend as it matures; add **HTTP-only** driver as the cheap tier. Keeps engine swap cost low.

### Long-running tasks
Never hold a request open. Pattern **[BG]**:
- Session = durable record, owned by a **lease** (TTL e.g. 120 s) renewed by **heartbeat**; agent or worker misses N beats → session `suspended`, not killed.
- Each action = idempotent `POST /actions` with client `action_id`; returns `202` + status URL, or synchronous result if < 25 s (stays under Cloudflare's proxy timeout, ~100 s default on non-Enterprise **[BG]**).
- **Checkpoints**: cookies, localStorage, URL, scroll → serialized to R2/disk every N actions. Worker death → resume on another worker.
- Streaming state/logs over **SSE**; WS only for live screencast/interactive human takeover.

---

## 2. How detection works (and what it implies for design)

**Cloudflare Bot Management [DOC]:**
- Heuristics engine: matches known-bad fingerprints; immediate score 1.
- ML engine: scores 2–99, trained across all Cloudflare traffic; produces most detections.
- Anomaly detection (optional, per-domain baseline).
- JA3/JA4 TLS fingerprints, Enterprise-only; JA4 resists extension-order randomization and includes ALPN. Signals Intelligence exposes per-JA4 heuristic ratios.
- Turnstile / JS detections: **not verified this session** — search returned no docs. **[BG]** JS detections inject a challenge script collecting browser signals; Turnstile is a managed challenge with non-interactive proof checks. Read official docs before relying on specifics.

**Signal layers [BG]:** TLS/JA3/JA4 → HTTP/2 SETTINGS & header order → header consistency (UA vs `Sec-CH-UA`, `Accept-Language`) → JS APIs (`navigator`, canvas, WebGL, audio, fonts) → timing/behavior → IP reputation/ASN.

**FP-Inconsistent (UC Davis, arXiv 2406.07647) [DOC]:** 507k requests from 20 bot services; evasive bots that tweak attributes create *spatial* (within request) and *temporal* (across requests of one device) inconsistencies. Data-driven rules cut DataDome/BotD-evading traffic 48%/45% at 96.8% true-negative on humans. Lesson: **spoofing individual attributes creates contradictions; cross-layer mismatch is the signal.**

**FP-Agent (arXiv 2605.01247, 2026) [DOC]:** 7 AI browsing agents + humans, 1000 trials each. **Behavioral** signals (typing, scroll, mouse) separated agents better than fingerprints; agents sharing a browser fingerprint (Atlas Agent, Browser Use, Claude) were confused only by fingerprint. Cloudflare flagged 1 of 7; FP-Agent flagged all 7. Agents did not actively evade. Related: arXiv 2605.14786 (UI-trace fingerprinting, up to 96% F1 over 14 models).

**Design implication [TRADE]:** Chasing "undetectable" is a losing, adversarial arms race and conflicts with the compliance boundary. Heron instead:
1. **Presents one truthful, internally consistent environment** — real engine, real TLS stack of that engine, no UA spoofing. Consistency avoids *false* flags without lying.
2. **Declares itself.** Cloudflare **Web Bot Auth [DOC]**: operator hosts key directory at `/.well-known/http-message-signatures-directory` (JWKS, content-type `application/http-message-signatures-directory+json`), signs requests per RFC 9421. Cloudflare "signed agents" extend Verified Bots to user-directed agents; Browserbase and Anchor Browser are in the first cohort. IETF draft `draft-ietf-webbotauth-httpsig-protocol`. Caveats: Cloudflare rejects `sf`, `bs`, `key` params and non-ASCII signed components; sites can opt out.
3. **Respects robots.txt, rate limits, `429`/`Retry-After`**, per-domain concurrency caps.
4. **Surfaces challenges** as `challenge_required` state → human-in-loop queue (screencast takeover) or agent callback. Never auto-solve.

---

## 3. Deployment topology

| Concern | Local (Win/Linux) | Hostinger VPS | Cloudflare |
|---|---|---|---|
| Core | `heron-daemon` single binary + engine | Docker compose: daemon + Postgres + worker pool | — |
| Edge | none | origin behind CF Tunnel (`cloudflared`), no open ports | DNS, WAF, rate limiting, TLS |
| API gateway / auth / metering | embedded | optional | **Workers**: key check (KV), quota counters (Durable Objects), usage events (Queues) |
| State | SQLite + disk | Postgres + disk | **D1** (tenant/keys/usage), **R2** (checkpoints, screenshots, downloads), KV (hot key cache) |

**[RISK] Hostinger:** shared hosting cannot run browsers; need **KVM VPS**. Browser ≈ 300–800 MB RAM/session → a 4 GB VPS ≈ 3–5 concurrent sessions. Capacity planning drives pricing. Hostinger MCP needs auth before I can query plans.

**Stateless vs stateful:** Workers/API = stateless. Browser workers = stateful, pinned per session, reachable via internal queue; session→worker mapping in DB; checkpoint to R2 enables rescheduling.

---

## 4. API + monetization (summary; full spec in Phase 2)

- Auth: `Authorization: Bearer hrn_live_<id>_<secret>`; store only hash (Argon2/SHA-256+pepper) + prefix.
- Quotas: concurrent sessions, actions/min, session-minutes/month, bandwidth.
- Metering events: `session_minute`, `action`, `screenshot`, `gb_egress`; append-only, idempotent by `event_id`; aggregated nightly → **Stripe usage-based billing** (meters) **[BG]**.
- **Monetization reality:** no platform rev-share exists. Paths: (a) hosted API, per-minute + per-action; (b) tiered subscription with included minutes; (c) self-host license; (d) human-in-loop add-on. Margin = price − (VPS share + proxy/egress + support).
- Legal: ToS must forbid abuse, scraping against site ToS, credential stuffing; KYC-lite for high tiers; abuse kill-switch. **[RISK]** renting a browser fleet attracts abuse; this is the largest business risk.

---

## 5. Gaps / next verification
- Turnstile & Cloudflare JS-detection official docs (not retrieved).
- WebKitGTK/WPE WebDriver status; Firefox BiDi feature coverage (screenshots, dialogs, downloads).
- Hostinger VPS plan specs/prices (MCP unauthorized).
- Name "Heron" trademark/package-name collisions.
- Stripe meter API specifics.

## Sources
- FP-Inconsistent: https://arxiv.org/abs/2406.07647
- FP-Agent: https://arxiv.org/abs/2605.01247 · Known By Their Actions: https://arxiv.org/abs/2605.14786
- Cloudflare Signals Intelligence: https://developers.cloudflare.com/bots/concepts/signals-intelligence/
- Cloudflare JA3/JA4: https://developers.cloudflare.com/bots/concepts/ja3-ja4-fingerprint/
- Cloudflare Web Bot Auth: https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/
- Cloudflare signed agents: https://blog.cloudflare.com/signed-agents/
- IETF draft: https://datatracker.ietf.org/doc/html/draft-meunier-webbotauth-httpsig-protocol
- Servo: https://servo.org/blog/2026/04/30/march-in-servo · https://servo.org/twisjul/blog/2026/08/31/july-in-servo/
