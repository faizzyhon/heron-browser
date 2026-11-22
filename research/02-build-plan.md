# Heron — From-Scratch Browser Build Plan

Source: pasted research "Building a Web Browser from Scratch" (PDF on disk was 0 bytes; text came via paste). Combined with [01-research-synthesis.md](01-research-synthesis.md).

## 0. Key decisions

| Decision | Choice | Why (from research) |
|---|---|---|
| Tier | Between *Educational Toy* and *Modular UI Renderer (Blitz)*, **headless-first** | Daily-driver web compat = multi-year (Ladybird needed >2M WPT). Agent use does not need GPU compositor or browser chrome first |
| Language | **Rust** | Memory safety on untrusted input; Servo/Blitz prove parallel style/layout; Windows+Linux cross-compile. Cost: DOM cycles vs borrow checker |
| DOM memory | Arena + integer node IDs (`NodeId`), **no `Rc` cycles**; JS wrappers hold IDs | Avoids the DOM↔JS cycle leak the research flags; skips writing a tracing GC at first |
| HTML parse | **html5ever** (embed) | WHATWG recovery is ~80 states + adoption agency; reimplementing = months, no agent value |
| CSS | `cssparser` + own cascade (L5 subset); stylo later | Own cascade teaches/controls; keep behind trait |
| Layout | Own block/inline; **taffy** for flex/grid | Research: Blitz does this. Own BFC/IFC first, taffy for the hard parts |
| Text | rustybuzz/harfrust + fontdb + swash/FreeType | Never hand-roll shaping |
| Raster | **vello_cpu** (or tiny-skia) → PNG | Screenshots only; CPU path works on VPS with no GPU |
| JS | **QuickJS (rquickjs) first**, Boa as pure-Rust option, SpiderMonkey later | Tiny, no JIT attack surface, fast startup per session. Behind `JsEngine` trait |
| Network | **reqwest/hyper + rustls** behind `ResourceLoader`; own cache, cookie jar, SOP/CORS | Research: don't write TLS/H2/QUIC. Own the *browser-level* semantics |
| Automation | **WebDriver BiDi** server (W3C), plus Heron REST/SSE API on top | Research: BiDi over CDP. Also makes Heron drop-in for Selenium/Playwright-style clients |
| Process model | Phase late: Broker / Renderer / Network / Decoder, typed IPC, seccomp/Job Objects | One process per *session* from day 1 gives multi-tenant isolation cheaply |
| Honest identity | Real UA string naming Heron; Web Bot Auth signing in network layer | Compliance stance in [01 §2](01-research-synthesis.md) |

**Fallback [RISK]:** modern SPAs will break for a long time. The `BrowserDriver` trait keeps a **Firefox/BiDi backend** so the rental API ships before Heron-core is web-complete. Heron-core is a long-term backend, not a launch blocker.

## 1. Crate layout

```
heron/
  crates/
    heron-dom/        arena DOM, node types, events, mutation, a11y tree export
    heron-html/       html5ever glue → heron-dom
    heron-css/        parse, cascade (L5 subset), computed style, @media
    heron-layout/     block, inline, taffy bridge, hit-test
    heron-text/       shaping, fallback, glyph cache
    heron-paint/      stacking contexts → display list → raster (PNG)
    heron-js/         JsEngine trait, quickjs impl, WebIDL-ish bindings, event loop
    heron-net/        ResourceLoader, cache, cookies, SOP/CORS, Web Bot Auth signer
    heron-session/    ties above into one Page; tabs; lifecycle; checkpoint/restore
    heron-bidi/       WebDriver BiDi server
    heron-driver/     BrowserDriver trait + impls (heron-core, firefox-bidi, http-only)
    heron-daemon/     REST+SSE API, auth, quotas, metering, scheduler
    heron-cli/
  tests/  wpt-runner/  test262-runner/  fuzz/
```

## 2. Phases (each ends with a runnable, tested artifact)

| # | Phase | Deliverable | Exit test | Est. (1 dev) |
|---|---|---|---|---|
| 0 | Skeleton | workspace, CI on Win+Linux, traits (`JsEngine`, `ResourceLoader`, `BrowserDriver`) | `cargo test` green both OS | 2–3 d |
| 1 | **Offline block renderer** (robinson-style) | local HTML+CSS subset → display list → PNG | golden PNG tests on 20 hand pages | 1–2 wk |
| 2 | Real parsing | html5ever DOM; CSS cascade with specificity, inheritance, `@media`; `querySelector` | html5lib tests pass; selector tests | 1–2 wk |
| 3 | Inline + text | line boxes, shaping, bidi, fallback, wrapping, images (PNG/JPEG/WebP decode in isolated thread) | text reftests | 2–3 wk |
| 4 | Network + origin security | fetch http(s), redirects, gzip/br, cache (Cache-Control/ETag/Vary), cookies (RFC 6265), SOP, CORS preflight, HSTS | local test server suite + captured-header fixtures | 2 wk |
| 5 | **JS + event loop** | QuickJS, macrotask/microtask queue, timers, `rAF`, DOM bindings (document, Element, events w/ capture/bubble, `fetch`, `XMLHttpRequest`, `MutationObserver`) | test262 subset (engine) + WPT `dom/` subset | 4–6 wk |
| 6 | **Agent surface (MVP gate)** | BiDi: navigate, click, type, scroll, evaluate, screenshot, network events, dialogs, downloads; a11y-tree + DOM extract; REST/SSE wrapper | scripted agent completes login+form+extract on 5 real sites | 3–4 wk |
| 7 | Modern layout | flex/grid via taffy, positioning, stacking contexts, paint-order hit testing, transforms | WPT css-flexbox/grid subset | 4 wk |
| 8 | Session durability | checkpoint (cookies, storage, URL, scroll, DOM-snapshot hint) to disk/R2; lease/heartbeat; resume on other worker | kill worker mid-task → resume | 2 wk |
| 9 | Isolation | process per session; seccomp-BPF/namespaces (Linux), Job Object + restricted token + AppContainer (Win); net process split | sandbox escape unit tests; syscall deny tests | 4 wk |
| 10 | Conformance + hardening | wptrunner in CI (track pass %), ASan/UBSan on `unsafe`, cargo-fuzz on parsers + bindings, OSS-Fuzz | pass-rate dashboard; zero fuzz crashes 24 h | continuous |
| 11 | Perf & compat tail | incremental layout (dirty bits), layout-thrash avoidance, optional JIT engine swap (SpiderMonkey) | Speedometer-lite, memory/session budget | open-ended |

**MVP milestone = end of Phase 6** (~4–5 months solo). Platform (API, metering, billing) built in parallel against the Firefox backend from week 1 so revenue path doesn't wait on the engine.

## 3. Parallel track: platform (against Firefox-BiDi backend)

| Wk | Item |
|---|---|
| 1–2 | `heron-daemon`: sessions, actions, SSE, SQLite; Firefox BiDi driver |
| 3–4 | API keys (hashed), quotas, concurrent-session limits, usage events table |
| 5–6 | Docker image, Hostinger KVM deploy, Cloudflare Tunnel + Workers edge auth |
| 7–8 | Human-in-loop challenge queue, screencast takeover (WS) |
| 9+ | Stripe usage billing, ToS/abuse controls, signed-agent (Web Bot Auth) enrollment |

## 4. Risks

| Risk | Mitigation |
|---|---|
| Spec sprawl stalls pixels | Strict phase gates; Phase 1 must render before anything else |
| Real sites break (JS APIs, layout quirks) | Firefox fallback backend; track WPT % + a personal "top-50 sites" smoke suite |
| QuickJS ES coverage/perf (no JIT) | `JsEngine` trait; swap to SpiderMonkey if needed |
| DOM↔JS lifetime bugs | NodeId arena, wrappers by ID, fuzz bindings early |
| `unsafe`/FFI (QuickJS, image codecs) | isolate in own crates, sanitizers, per-session process |
| Layout thrash & slow reflow | dirty-bit invalidation from Phase 7, not retrofitted |
| Abuse of rental fleet | ToS, KYC-lite, per-domain rate limits, kill switch |
| Scope creep into chrome UI/GPU compositor | Non-goals below |

## 5. Non-goals (explicit)
Browser chrome/tabs UI, GPU compositor, HTTP/3/QUIC (use library when available), WebGL/WebGPU/media codecs/WebRTC, extensions, own TLS stack, own JIT, **bot-detection evasion/fingerprint spoofing**.

## 6. First week
1. `cargo new --workspace`, CI matrix Windows+Ubuntu.
2. Phase 1 renderer: DOM struct → style (tag, class, id selectors) → block layout → display list → tiny-skia PNG.
3. Define the three traits.
4. Stand up Firefox BiDi driver spike + one `/sessions` endpoint.
