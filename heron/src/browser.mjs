// Firefox (non-Chromium) driven over W3C WebDriver BiDi. Zero deps: Node's global WebSocket.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SNAPSHOT_JS, elementRectJs } from './snapshot.mjs';

const FIREFOX_PATHS = [
  process.env.HERON_FIREFOX,
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  '/usr/bin/firefox',
  '/usr/local/bin/firefox',
].filter(Boolean);

function findFirefox() {
  const p = FIREFOX_PATHS.find((x) => existsSync(x));
  if (!p) throw new Error('Firefox not found; set HERON_FIREFOX');
  return p;
}

export class Browser {
  #ws; #proc; #profile; #nextId = 1; #pending = new Map(); #ctx; #navStarts = 0; #loads = 0;

  static async launch({ width = 1280, height = 800, locale = 'en-US', timezone } = {}) {
    const b = new Browser();
    b.#profile = mkdtempSync(join(tmpdir(), 'heron-'));
    // One coherent profile per session: locale/timezone set at the engine level, UA left truthful.
    const env = { ...process.env };
    if (timezone) env.TZ = timezone;
    b.#proc = spawn(findFirefox(), [
      '--headless', '--no-remote', '--profile', b.#profile,
      '--remote-debugging-port', '0',
      `--width=${width}`, `--height=${height}`,
    ], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    const base = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Firefox start timeout')), 30000);
      let buf = '';
      b.#proc.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);
        if (m) { clearTimeout(t); resolve(m[1]); }
      });
      b.#proc.on('exit', (c) => reject(new Error(`Firefox exited early (${c})`)));
    });
    b.#ws = new WebSocket(`${base}/session`);
    await new Promise((res, rej) => { b.#ws.onopen = res; b.#ws.onerror = () => rej(new Error('BiDi connect failed')); });
    b.#ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'event') {
        if (m.method === 'browsingContext.navigationStarted') b.#navStarts++;
        if (m.method === 'browsingContext.load') b.#loads++;
        return;
      }
      const p = b.#pending.get(m.id);
      if (!p) return;
      b.#pending.delete(m.id);
      m.type === 'error' ? p.reject(new Error(`${m.error}: ${m.message}`)) : p.resolve(m.result);
    };
    await b.#send('session.new', { capabilities: { alwaysMatch: { 'moz:firefoxOptions': { prefs: { 'intl.accept_languages': locale } } } } });
    await b.#send('session.subscribe', { events: ['browsingContext.navigationStarted', 'browsingContext.load'] });
    b.#ctx = (await b.#send('browsingContext.getTree', {})).contexts[0].context;
    return b;
  }

  #send(method, params) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.#send('script.evaluate', {
      expression, target: { context: this.#ctx }, awaitPromise: true, resultOwnership: 'none',
    });
    if (r.type === 'exception') throw new Error(r.exceptionDetails.text);
    return r.result.type === 'string' ? JSON.parse(r.result.value) : r.result.value;
  }

  navigate(url) {
    return this.#send('browsingContext.navigate', { context: this.#ctx, url, wait: 'complete' });
  }

  snapshot() { return this.eval(SNAPSHOT_JS); }

  // A click/Enter may start a navigation asynchronously: wait briefly for one to begin, then for its load event.
  async settle(startWaitMs = 2000, maxMs = 20000) {
    const before = this.#navStarts, loadsBefore = this.#loads;
    const until = async (cond, ms) => { const end = Date.now() + ms; while (Date.now() < end && !cond()) await new Promise((r) => setTimeout(r, 50)); return cond(); };
    if (!(await until(() => this.#navStarts > before, startWaitMs))) return; // no navigation triggered
    await until(() => this.#loads > loadsBefore, maxMs);
  }

  async click(id) {
    const r = await this.eval(elementRectJs(id));
    if (!r) throw new Error(`element ${id} not found/visible; take a new snapshot`);
    await this.#pointer(r.x, r.y);
    await this.settle();
  }

  async type(id, text, { clear = true } = {}) {
    await this.click(id);
    if (clear) await this.eval(`(()=>{const e=document.activeElement;if(e&&'value' in e)e.value='';return '"ok"'})()`);
    const keys = [...text].flatMap((c) => [{ type: 'keyDown', value: c }, { type: 'keyUp', value: c }]);
    await this.#send('input.performActions', { context: this.#ctx, actions: [{ type: 'key', id: 'k', actions: keys }] });
  }

  async press(key) { // e.g. "\uE007" = Enter
    await this.#send('input.performActions', { context: this.#ctx, actions: [{ type: 'key', id: 'k', actions: [{ type: 'keyDown', value: key }, { type: 'keyUp', value: key }] }] });
    await this.settle();
  }

  scroll(dy) { return this.eval(`(()=>{window.scrollBy(0,${Number(dy) | 0});return '"ok"'})()`); }

  async screenshot() {
    return Buffer.from((await this.#send('browsingContext.captureScreenshot', { context: this.#ctx })).data, 'base64');
  }

  #pointer(x, y) {
    return this.#send('input.performActions', {
      context: this.#ctx,
      actions: [{ type: 'pointer', id: 'm', parameters: { pointerType: 'mouse' }, actions: [
        { type: 'pointerMove', x: Math.round(x), y: Math.round(y) },
        { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
      ] }],
    });
  }

  async close() {
    try { this.#ws?.close(); } catch {}
    if (this.#proc?.pid) {
      try {
        if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(this.#proc.pid), '/T', '/F'], { stdio: 'ignore' });
        else this.#proc.kill('SIGKILL');
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 300));
    try { rmSync(this.#profile, { recursive: true, force: true }); } catch {}
  }
}
