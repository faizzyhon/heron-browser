// Smoke test: engine -> snapshot -> click -> screenshot, against a local page (no external network).
import http from 'node:http';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser.mjs';

const page = `<!doctype html><title>Heron test</title>
<h1>Hello</h1><input id=q placeholder="Search box"><button onclick="document.getElementById('out').textContent='clicked:'+document.getElementById('q').value">Go</button>
<p id=out></p><a href="/two">Next page</a>`;
const srv = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(req.url === '/two' ? '<title>Two</title>page two' : page); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;

const b = await Browser.launch();
try {
  await b.navigate(base);
  let snap = await b.snapshot();
  assert.equal(snap.title, 'Heron test');
  assert.equal(snap.state, 'ok');
  const input = snap.elements.find((e) => e.tag === 'input');
  const button = snap.elements.find((e) => e.tag === 'button');
  assert.ok(input && button, 'input and button found');
  await b.type(input.id, 'hello');
  await b.click(button.id);
  snap = await b.snapshot();
  assert.match(snap.text, /clicked:hello/);
  const png = await b.screenshot();
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  console.log('PASS', { elements: snap.elements.length, pngBytes: png.length });
} finally {
  await b.close();
  srv.close();
}
