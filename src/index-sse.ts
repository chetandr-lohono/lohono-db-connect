// ── OTel SDK must be imported FIRST ────────────────────────────────────────
import "./observability/tracing.js";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { toolDefinitions, handleToolCall, pool } from "./tools.js";
import { resolveUserEmail, filterToolsByAccess, loadAclConfig } from "./acl.js";
import {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  logInfo,
  logError,
  withMCPServerToolSpan,
  startSSESessionSpan,
} from "./observability/index.js";

// Load ACL config at startup
loadAclConfig();

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLoggingMiddleware());

// ── Session email storage (SSE transport → user email from headers) ──
const sessionEmails = new Map<SSEServerTransport, string>();

// Create MCP server
const server = new Server(
  {
    name: "lohono-db-context",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  const meta = request.params?._meta as Record<string, unknown> | undefined;
  // Try to find session email from any active session
  let sessionEmail: string | undefined;
  for (const [, email] of sessionEmails) {
    sessionEmail = email;
    break;
  }
  const userEmail = resolveUserEmail(meta, sessionEmail);
  const tools = await filterToolsByAccess(toolDefinitions, userEmail, pool);
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args, _meta } = request.params;
  const meta = _meta as Record<string, unknown> | undefined;
  // Try to find session email from any active session
  let sessionEmail: string | undefined;
  for (const [, email] of sessionEmails) {
    sessionEmail = email;
    break;
  }
  const userEmail = resolveUserEmail(meta, sessionEmail);

  // Wrap tool execution in a custom span
  return withMCPServerToolSpan(
    { toolName: name, toolArgs: (args || {}) as Record<string, unknown>, userEmail },
    async () => handleToolCall(name, args, userEmail)
  );
});

// SSE endpoint
app.get("/sse", async (req, res) => {
  const headerEmail = req.headers["x-user-email"] as string | undefined;
  logInfo(`New SSE connection established`, { user_email: headerEmail });

  const sseSpan = startSSESessionSpan(headerEmail);
  const transport = new SSEServerTransport("/messages", res);

  // Store header email for this session
  if (headerEmail) {
    sessionEmails.set(transport, headerEmail);
  }

  await server.connect(transport);

  req.on("close", () => {
    logInfo("SSE connection closed", { user_email: headerEmail });
    sseSpan.end();
    sessionEmails.delete(transport);
  });
});

// POST endpoint for client messages
app.post("/messages", async (req, res) => {
  logInfo("Received SSE message", { message_type: typeof req.body });
  res.status(200).end();
});

// Health check endpoint
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", server: "lohono-db-context", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", server: "lohono-db-context", db: "disconnected" });
  }
});

// Error logging middleware (must be last)
app.use(errorLoggingMiddleware());

// Graceful shutdown
process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logInfo(`MCP SSE server running`, {
    port: PORT as unknown as string,
    sse_endpoint: `http://localhost:${PORT}/sse`,
    health_endpoint: `http://localhost:${PORT}/health`,
  });
});
