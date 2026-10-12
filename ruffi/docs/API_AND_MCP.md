# Ruffi API and MCP

## Why both

The HTTP API is Ruffi's stable product contract. MCP is an agent-friendly adapter over the same service.

This keeps Ruffi usable by:

- its own web experience
- other local agents
- hosted agent runtimes
- background schedulers
- mobile or browser clients
- evaluation and admin tools

## HTTP API

The OpenAPI document is available at:

```text
http://localhost:3000/ruffi/api/v1/openapi
```

Routes:

```text
GET  /api/v1/points/catalog
GET  /api/v1/points/state
PUT  /api/v1/points/state
POST /api/v1/points/search
GET  /api/v1/points/watches
POST /api/v1/points/watches
PATCH /api/v1/points/watches
DELETE /api/v1/points/watches?id=...
POST /api/v1/points/watches/check
GET  /api/v1/points/alerts
PATCH /api/v1/points/alerts
```

The web page receives a random local bearer session when the server renders it:

```http
Authorization: Bearer <token>
```

All `/api/v1` routes require that token, and it rotates when the local server
restarts. Other local agents should use the stdio MCP interface instead of
trying to recover the browser session token.

## Local MCP

Start the stdio server:

```bash
cd /Users/nccook/personal-site/ruffi
npm run --silent mcp
```

Generic client configuration:

```json
{
  "command": "node",
  "args": [
    "--experimental-strip-types",
    "/Users/nccook/personal-site/ruffi/server/mcp.ts"
  ],
  "cwd": "/Users/nccook/personal-site/ruffi"
}
```

Agents should launch Node directly so stdout contains only MCP JSON-RPC messages.

Tools:

- `ruffi_get_catalog`
- `ruffi_get_wallet`
- `ruffi_update_wallet`
- `ruffi_parse_search`
- `ruffi_search_awards`
- `ruffi_create_watch`
- `ruffi_list_watches`
- `ruffi_check_watches`

The parse and search tools accept an optional prior `SearchIntent`, so agents
can refine a request conversationally. Ruffi uses local Ollama first and falls
back to deterministic parsing if the model is unavailable.

The wallet tool also accepts explicit preference notes. When
`typesafe_api_key` is present in `.data/credentials.txt`, Ruffi can use Jev to
choose among deterministically eligible offers.

## Remote MCP

When Ruffi moves off localhost:

1. Add a Streamable HTTP MCP endpoint backed by the same service.
2. Use OAuth for user authorization and audience-restricted tokens.
3. Give each client only the scopes it needs, such as `wallet:read`, `search:run`, or `watches:write`.
4. Rate-limit by user and agent client.
5. Keep airline credentials in a separate credential service that MCP tools cannot read.
6. Log every tool call and consequential recommendation.

## Agent safety contract

- Demo results are explicitly labeled as demo.
- Live results still require verification before transferring points.
- Tools cannot transfer points, buy tickets, or access raw loyalty credentials.
- Wallet writes replace only the manual wallet.
- Search inputs and response sizes are bounded.
- External agents receive structured offers and explanations, not unrestricted filesystem access.

## Protocol references

- MCP architecture: https://modelcontextprotocol.io/docs/learn/architecture
- MCP lifecycle: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- MCP transports: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
