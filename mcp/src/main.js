import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApi } from "./api.js";
import { startHttp } from "./http.js";
import { buildServer } from "./tools.js";

const { LEDGERLY_API_URL, LEDGERLY_TOKEN, MCP_TRANSPORT = "stdio", MCP_HTTP_HOST, MCP_HTTP_PORT, MCP_AUTH_TOKEN } = process.env;

if (!LEDGERLY_API_URL || !LEDGERLY_TOKEN) {
  console.error("LEDGERLY_API_URL and LEDGERLY_TOKEN are required");
  process.exit(1);
}
const url = new URL(LEDGERLY_API_URL);
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.error("LEDGERLY_API_URL must be https unless it points to localhost");
  process.exit(1);
}

const api = createApi({ baseUrl: LEDGERLY_API_URL, token: LEDGERLY_TOKEN });

if (MCP_TRANSPORT === "http") {
  const server = await startHttp({ api, host: MCP_HTTP_HOST, port: Number(MCP_HTTP_PORT ?? 8787), authToken: MCP_AUTH_TOKEN });
  const { address, port } = server.address();
  console.error(`ledgerly-mcp listening on http://${address}:${port}/mcp`);
} else {
  await buildServer(api).connect(new StdioServerTransport());
}
