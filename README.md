# Heron

Non-Chromium browser platform for AI agents: Firefox over WebDriver BiDi, an agent-native page snapshot (stable element IDs, challenge detection), and a metered multi-tenant API behind a Cloudflare gateway.

- `heron/` origin server + browser driver (Node, zero deps)
- `mcp/` MCP server (stdio + HTTP) and Claude connector, see docs/MCP.md
- `worker/` Cloudflare Worker gateway (auth, tenants, proxy)
- `docs/SETUP.md` setup guide
- `research/` research synthesis and build plan

Test: `cd heron && npm test` · `cd worker && npm test`

## Scope and principles
Heron declares itself and respects sites. It does **not** spoof fingerprints, imitate human input, or solve CAPTCHAs/Turnstile. When a site presents a challenge, the snapshot reports `state: "challenge_required"` so a human or the customer's own flow can handle it.

## ROADMAP
1. robots.txt respect + per-domain politeness (rate gap exists)
2. Web Bot Auth request signing (Cloudflare signed agents)
3. Challenge handoff queue (pause/resume session)
4. Snapshot diffs, SSE streaming, checkpoints
5. Docker image, Hostinger VPS deploy
6. Hashed key storage + Stripe usage billing
7. Optional custom Rust engine (see research/02-build-plan.md)
