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
