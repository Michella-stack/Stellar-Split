import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./tools.js";

const MAX_BODY = 1_000_000;
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

function sameToken(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Stateless streamable HTTP: one server and transport per request, nothing kept between calls.
export function startHttp({ api, host = "127.0.0.1", port = 8787, authToken }) {
  if (!authToken && !LOOPBACK.has(host)) {
    throw new Error("MCP_AUTH_TOKEN is required when MCP_HTTP_HOST is not loopback");
  }
  const server = http.createServer(async (req, res) => {
    const end = (status, headers = {}) => res.writeHead(status, headers).end();
    if (req.url !== "/mcp") return end(404);
    if (authToken && !sameToken(req.headers.authorization ?? "", `Bearer ${authToken}`)) return end(401);
    if (req.method !== "POST") return end(405, { allow: "POST" });
    let body;
    try {
      body = await readJson(req);
    } catch {
      return end(400);
    }
    const mcp = buildServer(api);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
