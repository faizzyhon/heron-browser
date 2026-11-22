// Usage: npm run make-key -- <tenant> [maxSessions]
// Prints the customer API key ONCE and the wrangler command that stores only its hash.
import { randomBytes, createHash } from 'node:crypto';
const [tenant, max = '2'] = process.argv.slice(2);
if (!tenant) { console.error('usage: make-key <tenant> [maxSessions]'); process.exit(1); }
const key = 'hrn_live_' + randomBytes(24).toString('base64url');
const hash = createHash('sha256').update(key).digest('hex');
const rec = JSON.stringify({ tenant, maxSessions: Number(max) });
console.log(`API key (give to customer, not stored anywhere): ${key}\n`);
console.log(`Store hash in KV (run in worker/):\nnpx wrangler kv key put --binding=KEYS "key:${hash}" '${rec}' --remote`);
