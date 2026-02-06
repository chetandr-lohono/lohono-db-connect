import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { toolDefinitions, handleToolCall, pool } from "./tools.js";

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

// SSE endpoint
app.get("/sse", async (req, res) => {
  console.log("New SSE connection established");

  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);

  req.on("close", () => {
    console.log("SSE connection closed");
  });
});

// POST endpoint for client messages
app.post("/messages", async (req, res) => {
  console.log("Received message:", req.body);
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

// Graceful shutdown
process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MCP SSE server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`DB: localhost:5433/lohono_api_production`);
});
