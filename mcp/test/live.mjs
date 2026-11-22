// Live demo via MCP: open Wikipedia, search, follow first result, report title + first text. Needs internet.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync } from 'node:fs';

process.env.PORT = '8803';
const { server: heron } = await import('../../heron/src/server.mjs');
const client = new Client({ name: 'live', version: '0' });
await client.connect(new StdioClientTransport({
  command: process.execPath, args: ['src/index.mjs'],
  env: { ...process.env, HERON_URL: 'http://127.0.0.1:8803', HERON_API_KEY: 'dev-key' },
}));
const call = async (name, args = {}) => client.callTool({ name, arguments: args });
const t = (r) => r.content[0].text;
try {
  let r = await call('heron_navigate', { url: 'https://en.wikipedia.org/wiki/Main_Page' });
  console.log(t(r).split('\n').slice(0, 3).join('\n'));
  const box = t(r).match(/\[(e\d+)\] input:search/)?.[1] ?? t(r).match(/\[(e\d+)\] input[^\n]*[Ss]earch/)?.[1];
  console.log('search box id:', box);
  r = await call('heron_type', { id: box, text: 'Gecko browser engine', submit: true });
  console.log(t(r).split('\n').slice(0, 3).join('\n'));
  const shot = await call('heron_screenshot');
  writeFileSync('data/live.png', Buffer.from(shot.content[0].data, 'base64'));
  console.log('screenshot saved: mcp/data/live.png');
  await call('heron_close');
} finally { await client.close(); heron.close(); process.exit(0); }
