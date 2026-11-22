# Heron MCP server and Claude connector

`mcp/` wraps the Heron API as MCP tools: `heron_navigate`, `heron_snapshot`, `heron_click`, `heron_type`, `heron_press`, `heron_scroll`, `heron_screenshot`, `heron_close`. A session opens automatically on first use and reopens if its lease expired. If a page shows a bot challenge, the tool output tells the model not to bypass it and to ask the user.

Install once: `cd mcp && npm install`. Start the Heron origin first (`cd heron && npm start`).

## A. Claude Code (local, stdio) — works now
The repo's [.mcp.json](../.mcp.json) is picked up automatically when Claude Code is opened in this folder (approve it when prompted). Or add it manually:
```
claude mcp add heron -e HERON_URL=http://127.0.0.1:8787 -e HERON_API_KEY=dev-key -- node "C:\path\to\Agentic Browser\mcp\src\index.mjs"
```
Point `HERON_URL`/`HERON_API_KEY` at the Cloudflare gateway and a real key to use the hosted version.

## B. Claude Desktop (local, stdio)
Add to `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart:
```json
{ "mcpServers": { "heron": {
  "command": "node",
  "args": ["C:\\path\\to\\Agentic Browser\\mcp\\src\\index.mjs"],
  "env": { "HERON_URL": "http://127.0.0.1:8787", "HERON_API_KEY": "dev-key" }
} } }
```

## C. Remote connector (claude.ai custom connector) — needs extra work
Start the HTTP transport:
```powershell
cd mcp
$env:MCP_AUTH_TOKEN="<long random>"; $env:HERON_API_KEY="<heron key>"; npm run start:http   # http://127.0.0.1:8788/mcp
cloudflared tunnel --url http://127.0.0.1:8788                                              # public https URL
```
Endpoint: `https://<tunnel-host>/mcp` (stateless Streamable HTTP; requires `Authorization: Bearer <MCP_AUTH_TOKEN>`).

**Limit [unverified, check claude.ai connector docs]:** claude.ai custom connectors accept a URL and OAuth, and I have not confirmed they let you set a static bearer header. If they don't, this endpoint can't be used as-is. The fix is an OAuth layer (Cloudflare's `workers-oauth-provider` on the existing Worker is the natural place). Until then use A or B, or any MCP client that supports custom headers.

## Security
- The HTTP mode shares one browser session across everyone with the token. It is single-tenant. Do not hand the token to multiple customers; per-tenant sessions come with the OAuth step.
- Everything the browser reads from a web page is untrusted input to the model (prompt injection). Keep destructive or credentialed actions behind user confirmation in your MCP client.
- Never commit `MCP_AUTH_TOKEN` or real API keys.
