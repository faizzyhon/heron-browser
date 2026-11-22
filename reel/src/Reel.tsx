import React from 'react';
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import data from './words.json';

const FPS = 30;
const C = { bg1: '#0b1f27', bg2: '#13414a', cream: '#f4f1ea', teal: '#3fb8af', amber: '#f2b84b', red: '#ff6b6b', green: '#58d68d', dim: '#9fb4b8', ink: '#0f2a33' };
const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";
const SERIF = "Georgia, 'Times New Roman', serif";

const L = data.lines;
const fr = (s: number) => Math.round(s * FPS);
/** frame at which a word is spoken inside script line `li` (first match of `w`) */
const cue = (li: number, w: string) => fr(L[li].words.find((x) => x.t.toLowerCase().replace(/[^a-z]/g, '') === w)?.s ?? L[li].start);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/* ---------- primitives ---------- */
const useSpring = (delay = 0, damping = 14) => {
  const f = useCurrentFrame();
  return spring({ frame: f - delay, fps: FPS, config: { damping, mass: 0.7, stiffness: 120 } });
};

const Fade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8, dur - 8, dur], [0, 1, 1, 0], clamp);
  const s = interpolate(f, [0, 12], [1.04, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <AbsoluteFill style={{ opacity: o, transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};

const Bg: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${C.bg1}, ${C.bg2})` }}>
      <AbsoluteFill style={{ opacity: 0.18, backgroundImage: `radial-gradient(${C.teal} 2px, transparent 2px)`, backgroundSize: '64px 64px', backgroundPosition: `${(f * 0.6) % 64}px ${(f * 0.9) % 64}px` }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(63,184,175,0.18), transparent 60%)' }} />
    </AbsoluteFill>
  );
};

const HeronMark: React.FC<{ p: number; size?: number }> = ({ p, size = 420 }) => (
  <svg viewBox="0 0 128 128" width={size} height={size} style={{ overflow: 'visible' }}>
    <g fill="none" stroke={C.cream} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
      <path pathLength={1} strokeDasharray="1" strokeDashoffset={1 - Math.min(1, p * 1.25)} d="M44 84c0-16 14-24 28-22 6 1 10-2 10-9 0-8-7-10-7-18 0-6 5-10 11-10" />
      <path pathLength={1} strokeDasharray="1" strokeDashoffset={1 - Math.min(1, Math.max(0, p * 1.25 - 0.2))} d="M44 84c8 6 22 6 30-2" />
      <path pathLength={1} strokeDasharray="1" strokeDashoffset={1 - Math.min(1, Math.max(0, p * 1.4 - 0.4))} strokeWidth={4} d="M58 88v10" />
    </g>
    <path d="M86 26l18 5-18 4z" fill={C.amber} opacity={Math.min(1, Math.max(0, p * 3 - 1.6))} />
    <circle cx="88" cy="27" r="2" fill={C.ink} opacity={p > 0.7 ? 1 : 0} />
    <path d="M20 98h88" stroke={C.teal} strokeWidth={4} strokeLinecap="round" opacity={0.75 * Math.min(1, p * 2)} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - Math.min(1, p * 2)} />
  </svg>
);

const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: 'rgba(8,24,30,0.78)', border: `2px solid rgba(63,184,175,0.35)`, borderRadius: 36, boxShadow: '0 30px 80px rgba(0,0,0,0.45)', padding: 40, ...style }}>{children}</div>
);

const Title: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({ children, size = 84, color = C.cream, style }) => (
  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: size, color, lineHeight: 1.08, textAlign: 'center', ...style }}>{children}</div>
);

const RobotIcon: React.FC<{ size?: number; worry?: number }> = ({ size = 220, worry = 0 }) => (
  <svg viewBox="0 0 120 120" width={size} height={size}>
    <line x1="60" y1="8" x2="60" y2="24" stroke={C.cream} strokeWidth={5} strokeLinecap="round" />
    <circle cx="60" cy="8" r="6" fill={C.amber} />
    <rect x="18" y="24" width="84" height="66" rx="22" fill={C.cream} />
    <circle cx="42" cy="55" r={10 + worry * 3} fill={C.ink} />
    <circle cx="78" cy="55" r={10 + worry * 3} fill={C.ink} />
    <circle cx={42 + worry * 2} cy={53} r="3.5" fill="#fff" />
    <circle cx={78 + worry * 2} cy={53} r="3.5" fill="#fff" />
    <path d={worry > 0.5 ? 'M44 76 q16 -9 32 0' : 'M44 72 q16 10 32 0'} stroke={C.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
  </svg>
);

/* ---------- scenes ---------- */
// 0: hook
const S0: React.FC = () => {
  const f = useCurrentFrame();
  const sp = useSpring(2);
  const fill = interpolate(f, [30, 118], [0, 1.35], { ...clamp, easing: Easing.in(Easing.quad) });
  const over = fill > 1;
  const shake = over ? Math.sin(f * 2.2) * 6 * (fill - 1) * 4 : 0;
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 230 }}>
      <div style={{ transform: `scale(${sp}) translateX(${shake}px)` }}><RobotIcon worry={Math.min(1, fill)} /></div>
      <Card style={{ marginTop: 70, width: 860, padding: '34px 40px', transform: `translateX(${shake}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 34, color: C.dim }}>https://shop.example.com/product/4821</div>
        <div style={{ height: 22, margin: '26px 0 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 11 }}><div style={{ height: '100%', width: '62%', background: 'rgba(255,255,255,0.1)', borderRadius: 11 }} /></div>
        <div style={{ height: 22, width: '45%', background: 'rgba(255,255,255,0.08)', borderRadius: 11 }} />
      </Card>
      <div style={{ marginTop: 70, width: 860 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontWeight: 700, fontSize: 38, color: over ? C.red : C.cream, marginBottom: 14 }}>
          <span>TOKEN BUDGET</span><span>{over ? 'EXCEEDED' : `${Math.round(fill * 100)}%`}</span>
        </div>
        <div style={{ height: 54, borderRadius: 27, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(1, fill) * 100}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.amber} 60%, ${C.red})`, borderRadius: 27 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 1: the mess
const JUNK = ['<script src="analytics.js"></script>', '<div class="ad-slot" data-id="x91">', '<nav class="mega-menu"><ul><li>', 'window.dataLayer = window.dataLayer || [];', '<style>.btn{padding:12px}</style>', '<iframe src="//ads.tracker.net">', '<svg viewBox="0 0 24 24"><path d="M12 2L2 7"/>', '<footer><a href="/terms">Terms</a>', '<div class="cookie-banner">Accept all</div>', '<meta name="viewport" content="width=device-width">'];
const S1: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 30;
  const hit = cue(1, 'one') - L[1].start > 0 ? cue(1, 'one') - fr(L[1].start) : 120;
  const mag = useSpring(Math.max(hit - 6, 100), 12);
  const scroll = f * 26;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 150, left: 50, right: 50, height: 1040, overflow: 'hidden', borderRadius: 30, background: 'rgba(5,16,20,0.85)', border: '2px solid rgba(255,107,107,0.35)' }}>
        <div style={{ transform: `translateY(${-(scroll % 1400)}px)`, padding: 30 }}>
          {Array.from({ length: 90 }).map((_, i) => {
            const j = JUNK[(i * 7 + 3) % JUNK.length];
            return <div key={i} style={{ fontFamily: MONO, fontSize: 31, lineHeight: '46px', whiteSpace: 'nowrap', color: i % 5 === 0 ? C.red : i % 3 === 0 ? C.amber : '#6e8a90', opacity: 0.85, marginLeft: (i % 4) * 36 }}>{j}</div>;
          })}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 70%, rgba(5,16,20,0.95))' }} />
      </div>
      <div style={{ position: 'absolute', top: 1190, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 20, transform: `scale(${mag})` }}>
          <div style={{ width: 120, height: 120, borderRadius: 60, border: `8px solid ${C.amber}`, boxShadow: `0 0 40px ${C.amber}` }} />
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 52, color: C.ink, background: C.amber, padding: '16px 34px', borderRadius: 18 }}>Buy</div>
          <div style={{ fontFamily: SANS, fontSize: 40, color: C.cream, maxWidth: 380, textAlign: 'left' }}>the one button you needed</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 2: logo reveal
const S2: React.FC = () => {
  const f = useCurrentFrame();
  const p = interpolate(f, [4, 52], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const name = useSpring(40);
  const tag = useSpring(58);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 200 }}>
      <HeronMark p={p} size={560} />
      <div style={{ transform: `translateY(${(1 - name) * 50}px) scale(${0.9 + 0.1 * name})`, opacity: name }}>
        <Title size={190}>Heron</Title>
      </div>
      <div style={{ opacity: tag, transform: `translateY(${(1 - tag) * 30}px)`, fontFamily: SANS, fontSize: 52, color: C.teal, marginTop: 14, textAlign: 'center', fontWeight: 600 }}>
        A browser built for AI agents
      </div>
    </AbsoluteFill>
  );
};

// 3: whole page, few tokens
const COMPACT = [
  ['# Gecko (software)', C.cream],
  ['Gecko is a browser engine developed by Mozilla.', C.dim],
  ['## History', C.cream],
  ['Released 1998 as NGLayout. Used by Firefox⟨e51⟩', C.dim],
  ['Written in C++⟨e55⟩ JavaScript⟨e56⟩ Rust⟨e57⟩', C.dim],
  ['⟨e64 input:search "Search Wikipedia"⟩', C.teal],
] as const;
const S3: React.FC = () => {
  const f = useCurrentFrame();
  const bar = interpolate(f, [26, 90], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const heronBar = interpolate(f, [100, 150], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const seven = cue(3, 'seven') - fr(L[3].start);
  const pop = useSpring(Math.max(seven - 4, 60), 10);
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 170 }}>
      <Title size={70} style={{ marginBottom: 36 }}>The whole page. Clean text.</Title>
      <Card style={{ width: 920, padding: '36px 44px' }}>
        {COMPACT.map(([t, c], i) => {
          const shown = Math.floor(interpolate(f, [8 + i * 8, 22 + i * 8], [0, t.length], clamp));
          return <div key={i} style={{ fontFamily: MONO, fontSize: 35, lineHeight: '58px', color: c, whiteSpace: 'nowrap', minHeight: 58 }}>{t.slice(0, shown)}</div>;
        })}
      </Card>
      <div style={{ width: 920, marginTop: 70 }}>
        <div style={{ fontFamily: SANS, fontSize: 36, color: C.dim, marginBottom: 10 }}>Raw page</div>
        <div style={{ height: 50, borderRadius: 25, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          <div style={{ width: `${bar * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.amber}, ${C.red})` }} />
        </div>
        <div style={{ fontFamily: SANS, fontSize: 36, color: C.teal, margin: '34px 0 10px' }}>Heron: whole Wikipedia article</div>
        <div style={{ height: 50, borderRadius: 25, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          <div style={{ width: `${heronBar * 17}%`, height: '100%', background: C.teal, borderRadius: 25 }} />
        </div>
        <div style={{ marginTop: 34, transform: `scale(${pop})`, transformOrigin: 'left center', fontFamily: SERIF, fontWeight: 700, fontSize: 92, color: C.teal }}>
          ~7,000 <span style={{ fontSize: 50, color: C.cream, fontFamily: SANS, fontWeight: 600 }}>tokens · nothing cut off</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 4: IDs + click
const S4: React.FC = () => {
  const f = useCurrentFrame();
  const click = 112;
  const cx = interpolate(f, [40, click - 6], [820, 700], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cy = interpolate(f, [40, click - 6], [1500, 880], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const clicked = f >= click;
  const ripple = interpolate(f, [click, click + 22], [0, 1], clamp);
  const row = (id: string, label: string, kind: string, y: number, delay: number) => {
    const s = useSpring(delay, 12);
    return (
      <div style={{ opacity: s, transform: `translateX(${(1 - s) * -80}px)`, fontFamily: MONO, fontSize: 38, marginBottom: 30, color: C.cream, display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ color: C.dim }}>{label}</span>
        <span style={{ background: id === 'e12' ? (clicked ? C.green : C.amber) : 'rgba(63,184,175,0.25)', color: id === 'e12' ? C.ink : C.teal, borderRadius: 14, padding: '6px 18px', fontWeight: 700 }}>⟨{id} {kind}⟩</span>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 180 }}>
      <Title size={70} style={{ marginBottom: 44 }}>Every element gets an ID</Title>
      <Card style={{ width: 900, padding: '50px 50px 30px' }}>
        {row('e9', 'Search', 'input', 0, 8)}
        {row('e10', 'Reviews (214)', 'link', 0, 18)}
        {row('e12', 'Add to cart', 'button', 0, 28)}
        {row('e13', 'Checkout', 'button', 0, 38)}
      </Card>
      <div style={{ marginTop: 56, fontFamily: MONO, fontSize: 48, color: C.teal, opacity: interpolate(f, [70, 84], [0, 1], clamp) }}>
        click(<span style={{ color: C.amber, fontWeight: 700 }}>"e12"</span>) {clicked ? <span style={{ color: C.green }}>✓</span> : ''}
      </div>
      <div style={{ position: 'absolute', left: 700, top: 880, width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: 75, border: `6px solid ${C.green}`, opacity: clicked ? 1 - ripple : 0, transform: `scale(${0.4 + ripple * 1.6})` }} />
      <svg width="86" height="86" viewBox="0 0 24 24" style={{ position: 'absolute', left: cx, top: cy, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.6))' }}>
        <path d="M4 2l16 9-7 2 4 8-3 1-4-8-5 5z" fill={C.cream} stroke={C.ink} strokeWidth="1.2" />
      </svg>
    </AbsoluteFill>
  );
};

// 5: diffs
const S5: React.FC = () => {
  const f = useCurrentFrame();
  const s1 = useSpring(30), s2 = useSpring(46), s3 = useSpring(100);
  const dim = interpolate(f, [26, 40], [1, 0.35], clamp);
  const base = ['# Product 4821 · Trail Shoes', 'Price $89 · In stock', 'Add to cart⟨e12⟩   Checkout⟨e13⟩', 'Reviews (214)⟨e10⟩'];
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 200 }}>
      <Title size={70} style={{ marginBottom: 46 }}>Only what changed</Title>
      <Card style={{ width: 940, padding: '44px 44px' }}>
        {base.map((t, i) => <div key={i} style={{ fontFamily: MONO, fontSize: 34, lineHeight: '58px', color: C.dim, opacity: dim, whiteSpace: 'nowrap' }}>{t}</div>)}
        <div style={{ height: 4, background: 'rgba(63,184,175,0.3)', margin: '24px 0' }} />
        <div style={{ fontFamily: MONO, fontSize: 36, lineHeight: '64px', opacity: s1, transform: `translateX(${(1 - s1) * 120}px)`, color: C.red, background: 'rgba(255,107,107,0.12)', borderRadius: 10, padding: '0 14px' }}>- Add to cart⟨e12⟩</div>
        <div style={{ fontFamily: MONO, fontSize: 36, lineHeight: '64px', opacity: s2, transform: `translateX(${(1 - s2) * 120}px)`, color: C.green, background: 'rgba(88,214,141,0.12)', borderRadius: 10, padding: '0 14px', marginTop: 12 }}>+ Added to cart (1)⟨e14⟩</div>
      </Card>
      <div style={{ marginTop: 70, opacity: s3, transform: `scale(${0.8 + 0.2 * s3})`, fontFamily: SANS, fontWeight: 700, fontSize: 56, color: C.cream, textAlign: 'center' }}>
        2 lines back, <span style={{ color: C.teal }}>not the whole page</span>
      </div>
    </AbsoluteFill>
  );
};

// 6: features
const FeatureCard: React.FC<{ at: number; title: string; sub: string; color: string; icon: React.ReactNode }> = ({ at, title, sub, color, icon }) => {
  const s = useSpring(at, 11);
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * 90}px) scale(${0.92 + 0.08 * s})` }}>
      <Card style={{ width: 920, display: 'flex', alignItems: 'center', gap: 36, padding: '38px 44px', borderColor: color }}>
        <div style={{ width: 130, height: 130, borderRadius: 34, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{icon}</div>
        <div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 62, color: C.cream, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontFamily: SANS, fontSize: 38, color: C.dim, marginTop: 10 }}>{sub}</div>
        </div>
      </Card>
    </div>
  );
};
const S6: React.FC = () => {
  const base = fr(L[6].start);
  const at = (w: string) => Math.max(cue(6, w) - base - 6, 4);
  const ic = (d: string) => <svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 190, gap: 44 }}>
      <FeatureCard at={at('firefox')} color={C.amber} title="Firefox engine" sub="Not Chromium" icon={ic('M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18')} />
      <FeatureCard at={at('claude')} color={C.teal} title="Plugs into Claude" sub="One MCP server, eight tools" icon={ic('M8 4H4v16h4M16 4h4v16h-4M9 12h6')} />
      <FeatureCard at={at('cloudflare')} color={C.cream} title="Cloudflare gateway" sub="API keys · quotas · metering" icon={ic('M6 19a4 4 0 010-8 6 6 0 0111-2 4.5 4.5 0 01-1 10z')} />
    </AbsoluteFill>
  );
};

// 7: honest by design
const S7: React.FC = () => {
  const f = useCurrentFrame();
  const sh = useSpring(4, 10);
  const box = useSpring(34, 12);
  const tag = useSpring(70, 12);
  const stamp = useSpring(98, 9);
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 200 }}>
      <div style={{ transform: `scale(${sh})` }}>
        <svg viewBox="0 0 24 24" width={300} height={300} fill="none" stroke={C.teal} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="rgba(63,184,175,0.15)" />
          <path pathLength={1} strokeDasharray="1" strokeDashoffset={1 - interpolate(f, [18, 46], [0, 1], clamp)} d="M8.5 12l2.5 2.5L16 9.5" stroke={C.cream} strokeWidth="2" />
        </svg>
      </div>
      <Title size={82} style={{ marginTop: 10 }}>Honest by design</Title>
      <div style={{ opacity: box, transform: `translateY(${(1 - box) * 60}px)`, marginTop: 50 }}>
        <Card style={{ width: 860, textAlign: 'center', padding: '40px 40px' }}>
          <div style={{ fontFamily: SANS, fontSize: 46, color: C.cream, fontWeight: 600 }}>☐ Verify you are human</div>
          <div style={{ fontFamily: MONO, fontSize: 36, color: C.amber, marginTop: 20, opacity: tag }}>state: challenge_required</div>
        </Card>
      </div>
      <div style={{ marginTop: 56, transform: `scale(${stamp}) rotate(${-3 * stamp}deg)`, opacity: stamp, fontFamily: SANS, fontWeight: 800, fontSize: 54, color: C.green, border: `6px solid ${C.green}`, borderRadius: 20, padding: '14px 36px' }}>
        REPORTED · NEVER BYPASSED
      </div>
    </AbsoluteFill>
  );
};

// 8: where to get it
const S8: React.FC = () => {
  const f = useCurrentFrame();
  const logo = interpolate(f, [0, 30], [0, 1], clamp);
  const lic = useSpring(30, 10);
  const url = useSpring(48, 12);
  const star = useSpring(120, 8);
  const glow = 0.5 + 0.5 * Math.sin(f / 7);
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 170 }}>
      <HeronMark p={logo} size={320} />
      <Title size={140} style={{ marginTop: 6 }}>Heron</Title>
      <div style={{ transform: `scale(${lic})`, marginTop: 24, display: 'flex', gap: 22 }}>
        {['Free', 'Open source', 'MIT'].map((t) => <span key={t} style={{ fontFamily: SANS, fontWeight: 700, fontSize: 40, color: C.ink, background: C.amber, padding: '10px 28px', borderRadius: 40 }}>{t}</span>)}
      </div>
      <div style={{ opacity: url, transform: `translateY(${(1 - url) * 60}px)`, marginTop: 70 }}>
        <Card style={{ width: 920, textAlign: 'center', padding: '44px 30px', boxShadow: `0 0 ${40 + glow * 50}px rgba(63,184,175,${0.25 + glow * 0.25})` }}>
          <div style={{ fontFamily: SANS, fontSize: 38, color: C.dim, marginBottom: 14 }}>Get it on GitHub</div>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 49, color: C.teal }}>github.com/faizzyhon</div>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 56, color: C.cream, marginTop: 6 }}>/heron-browser</div>
        </Card>
      </div>
      <div style={{ opacity: star, transform: `scale(${0.8 + 0.2 * star})`, marginTop: 56, fontFamily: SANS, fontSize: 46, color: C.cream, fontWeight: 600 }}>
        ★ Star it · try it today
      </div>
    </AbsoluteFill>
  );
};

/* ---------- captions (karaoke, word-synced) ---------- */
const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const line = L.find((l) => t >= l.start - 0.05 && t < l.end + 0.15);
  if (!line) return null;
  // display fixes: spelled-out acronyms ("M C P") become one token, spoken "slash"/"dash" become symbols
  const ws = line.words.reduce<{ t: string; s: number; e: number }[]>((a, w) => {
    const t = ({ slash: '/', dash: '-' } as Record<string, string>)[w.t.toLowerCase()] ?? w.t;
    const p = a[a.length - 1];
    if (p && /^[A-Z]$/.test(t) && /^[A-Z]+$/.test(p.t) && p.t.length < 3) { p.t += t; p.e = w.e; } else a.push({ ...w, t });
    return a;
  }, []);
  const idx = ws.findIndex((w) => t >= w.s && t < w.e + 0.04);
  const cur = idx >= 0 ? idx : ws.findIndex((w) => w.s > t);
  const chunk = Math.floor(Math.max(cur, 0) / 4);
  const group = ws.slice(chunk * 4, chunk * 4 + 4);
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, top: 1500, textAlign: 'center' }}>
      {group.map((w, i) => {
        const active = t >= w.s && t < w.e + 0.08;
        return <span key={chunk * 4 + i} style={{ display: 'inline-block', margin: '0 12px', fontFamily: SANS, fontWeight: 800, fontSize: 78, lineHeight: 1.15, color: active ? C.amber : C.cream, transform: `scale(${active ? 1.12 : 1})`, textShadow: '0 4px 18px rgba(0,0,0,0.85), 0 0 3px #000', WebkitTextStroke: '2px rgba(0,0,0,0.5)' }}>{w.t}</span>;
      })}
    </div>
  );
};

/* ---------- composition ---------- */
const SCENES = [S0, S1, S2, S3, S4, S5, S6, S7, S8];

export const HeronReel: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ fontFamily: SANS }}>
      <Bg />
      {SCENES.map((S, i) => {
        const from = Math.max(0, fr(L[i].start) - 4);
        const end = i + 1 < L.length ? fr(L[i + 1].start) + 4 : durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={end - from}>
            <Fade dur={end - from}><S /></Fade>
          </Sequence>
        );
      })}
      <Captions />
      <Audio src={staticFile('mix.wav')} />
    </AbsoluteFill>
  );
};
