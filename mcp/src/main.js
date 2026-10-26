import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { createApi } from "./api.js";
import { startHttp } from "./http.js";
import { createSettler } from "./settle.js";
import { buildServer } from "./tools.js";

const { LEDGERLY_API_URL, LEDGERLY_TOKEN, MCP_TRANSPORT = "stdio", MCP_HTTP_HOST, MCP_HTTP_PORT, MCP_AUTH_TOKEN, LEDGERLY_SIGNER_FILE, LEDGERLY_HORIZON_URL } = process.env;

if (!LEDGERLY_API_URL || !LEDGERLY_TOKEN) {
  console.error("LEDGERLY_API_URL and LEDGERLY_TOKEN are required");
  process.exit(1);
}
let url;
try {
  url = new URL(LEDGERLY_API_URL);
} catch {
  console.error("LEDGERLY_API_URL is not a valid URL");
  process.exit(1);
}
if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  console.error("LEDGERLY_API_URL must be https unless it points to localhost");
  process.exit(1);
}

const api = createApi({ baseUrl: LEDGERLY_API_URL, token: LEDGERLY_TOKEN });

// The signer secret is read once from a file (never an env var) and stays inside the settler. No file, no ledgerly_settle.
let settler;
if (LEDGERLY_SIGNER_FILE) {
  try {
    settler = createSettler({ secret: readFileSync(LEDGERLY_SIGNER_FILE, "utf8"), apiUrl: LEDGERLY_API_URL, api, horizonUrl: LEDGERLY_HORIZON_URL });
  } catch {
    console.error("LEDGERLY_SIGNER_FILE could not be read or does not hold a valid Stellar secret key");
    process.exit(1);
  }
}

if (MCP_TRANSPORT === "http") {
  let server;
  try {
    server = await startHttp({ api, settler, host: MCP_HTTP_HOST, port: Number(MCP_HTTP_PORT ?? 8787), authToken: MCP_AUTH_TOKEN });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const { address, port } = server.address();
  console.error(`ledgerly-mcp listening on http://${address}:${port}/mcp`);
} else {
  await buildServer(api, { settler }).connect(new StdioServerTransport());
}
