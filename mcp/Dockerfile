# Ledgerly MCP server for one agent. See docs/adr/0009-mcp-server-runs-next-to-each-agent.md.
# Base pinned by digest. The tag is for people; the digest is what is pulled. Bump both together, and
# only to an image that is at least 7 days old (the repo's dependency cooldown).
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=8787

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src

# 0.0.0.0 is safe only because the server refuses to start without MCP_AUTH_TOKEN on a non-loopback address
# and because the service must not publish this port. Run it with a read-only filesystem, cap_drop ALL and
# no-new-privileges (docs/AGENT-MCP-ROLLOUT.md).
USER node
EXPOSE 8787
CMD ["node", "src/main.js"]
