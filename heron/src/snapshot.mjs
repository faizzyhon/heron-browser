// Agent-native page model: compact, stable-ID list of actionable elements + visible text.
// Runs inside the page. Returns a JSON string (BiDi serializes strings cheaply).
export const SNAPSHOT_JS = `(() => {
  const SEL = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=tab],[role=menuitem],[onclick],[contenteditable=true]';
  const vis = (e) => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const name = (e) => (e.getAttribute('aria-label') || e.labels?.[0]?.innerText || e.placeholder
    || e.innerText || e.value || e.title || e.alt || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
  window.__heronSeq = window.__heronSeq || 0;
  const els = [];
  for (const e of document.querySelectorAll(SEL)) {
    if (!vis(e) || e.disabled) continue;
    if (!e.dataset.heronId) e.dataset.heronId = 'e' + (++window.__heronSeq);
    const o = { id: e.dataset.heronId, tag: e.tagName.toLowerCase(), name: name(e) };
    const role = e.getAttribute('role'); if (role) o.role = role;
    if (e.type && e.tagName === 'INPUT') o.type = e.type;
    if (e.href) o.href = e.href;
    if ('value' in e && e.type !== 'password' && e.value) o.value = String(e.value).slice(0, 80);
    if (e.checked) o.checked = true;
    els.push(o);
  }
  const text = (document.body?.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim();
  const hay = (document.title + ' ' + text.slice(0, 2000)).toLowerCase();
  const challenge = /just a moment|verify you are human|captcha|are you a robot|checking your browser/.test(hay)
    || !!document.querySelector('iframe[src*="challenges.cloudflare.com"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"]');
  return JSON.stringify({
    url: location.href, title: document.title,
    state: challenge ? 'challenge_required' : 'ok',
    elements: els.slice(0, 300), text: text.slice(0, 6000),
  });
})()`;

export const elementRectJs = (id) => `(() => {
  const e = document.querySelector('[data-heron-id=${JSON.stringify(String(id).replace(/[^\w-]/g, ''))}]');
  if (!e) return 'null';
  e.scrollIntoView({ block: 'center', inline: 'center' });
  const r = e.getBoundingClientRect();
  if (!r.width || !r.height) return 'null';
  return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
})()`;

// Whole-page reader: compact markdown-like lines in reading order, interactive elements inline as ⟨id kind "label"⟩.
// opts: {mode:'main'|'full', links:boolean}. Returns JSON {url,title,state,lines}.
export const readJs = (opts) => `((opts) => {
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','TEMPLATE','IFRAME','CANVAS','HEAD','LINK','META','OBJECT','VIDEO','AUDIO']);
  const CHROME = new Set(['NAV','FOOTER','ASIDE','HEADER']);
  const BLOCK = new Set(['P','DIV','SECTION','ARTICLE','MAIN','UL','OL','LI','TABLE','TR','FORM','PRE','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','DT','DD','FIGURE','FIGCAPTION','DETAILS','SUMMARY','HR','BR','FIELDSET','DL','TBODY','THEAD']);
  const INTER = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=tab],[role=menuitem],[onclick],[contenteditable=true]';
  window.__heronSeq = window.__heronSeq || 0;
  const ws = (s) => s.replace(/\\s+/g, ' ').trim();
  const idOf = (e) => (e.dataset.heronId ||= 'e' + (++window.__heronSeq));
  const hidden = (e) => { if (e.getAttribute('aria-hidden') === 'true' || e.hidden) return true; const s = getComputedStyle(e); return s.display === 'none' || s.visibility === 'hidden'; };
  const rel = (h) => { try { const u = new URL(h, location.href); return u.origin === location.origin ? u.pathname + u.search + u.hash : u.href; } catch { return h; } };
  const label = (e) => ws(e.getAttribute('aria-label') || e.labels?.[0]?.innerText || e.placeholder || e.innerText || e.value || e.title || e.alt || '').slice(0, 80);
  const lines = []; let cur = '';
  const flush = () => { const t = ws(cur).replace(/( \\|)+$/, ''); if (t) lines.push(t); cur = ''; };
  const useMain = opts.mode !== 'full';
  const root = (useMain && document.querySelector('main,[role=main]')) || document.body;
  const skipChrome = useMain;
  function walk(n) {
    if (n.nodeType === 3) { cur += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toUpperCase();
    if (skipChrome && n !== root && CHROME.has(tag) && !hidden(n)) { // drop boilerplate text/links but keep form fields (e.g. site search)
      flush();
      for (const f of n.querySelectorAll('input:not([type=hidden]),select,textarea')) if (!hidden(f) && !f.closest('[hidden],[aria-hidden=true]')) { walk(f); flush(); }
      return;
    }
    if (SKIP.has(tag) || hidden(n)) return;
    if (tag === 'IMG') { const a = ws(n.alt || ''); if (a) cur += ' [img ' + a.slice(0, 60) + '] '; return; }
    if (n.matches(INTER) && !n.disabled) {
      const id = idOf(n); let k = tag.toLowerCase();
      if (tag === 'INPUT') k += ':' + n.type; else if (n.getAttribute('role')) k = n.getAttribute('role');
      if (tag === 'A') {
        const t = label(n);
        if (!t) return; // icon/empty link: no information, no tokens
        if ((n.getAttribute('href') || '').startsWith('#') || /^\\[[^\\]]{1,4}\\]$/.test(t)) { cur += ' ' + t + ' '; return; } // anchors/citations: text only
      }
      if (tag === 'A') { cur += ' ' + label(n) + '⟨' + id + (opts.links ? '→' + rel(n.href) : '') + '⟩ '; return; }
      let extra = '';
      if (tag === 'SELECT') extra = ' opts=' + [...n.options].slice(0, 12).map((o) => ws(o.text)).join('|') + ' sel=' + ws(n.selectedOptions[0]?.text || '');
      else if ('value' in n && n.value && n.type !== 'password' && tag !== 'BUTTON') extra = ' value="' + String(n.value).slice(0, 60) + '"';
      if (n.checked) extra += ' checked';
      cur += ' ⟨' + id + ' ' + k + ' "' + label(n) + '"' + extra + '⟩ ';
      return;
    }
    const block = BLOCK.has(tag);
    if (block) flush();
    if (/^H[1-6]$/.test(tag)) cur += '#'.repeat(+tag[1]) + ' ';
    else if (tag === 'LI') cur += '- ';
    if (tag === 'PRE') { cur += n.textContent.slice(0, 1500); flush(); return; }
    for (const c of n.childNodes) walk(c);
    if (tag === 'TD' || tag === 'TH') cur += ' | ';
    if (block) flush();
  }
  if (root !== document.body) for (const f of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')) // fields outside <main> (site search)
    if (!root.contains(f) && !hidden(f) && !f.closest('[hidden],[aria-hidden=true]')) { walk(f); flush(); }
  walk(root); flush();
  const hay = (document.title + ' ' + lines.slice(0, 40).join(' ')).toLowerCase();
  const challenge = /just a moment|verify you are human|captcha|are you a robot|checking your browser/.test(hay)
    || !!document.querySelector('iframe[src*="challenges.cloudflare.com"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"]');
  return JSON.stringify({ url: location.href, title: document.title, state: challenge ? 'challenge_required' : 'ok', lines });
})(${JSON.stringify(opts)})`;
