import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function testSSEServer() {
  const serverUrl = "http://localhost:3000";
  
  console.log(`Connecting to SSE server at ${serverUrl}...`);
  
  // Create client
  const client = new Client(
    {
      name: "test-sse-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  // Connect to SSE server
  const transport = new SSEClientTransport(new URL(`${serverUrl}/sse`));
  
  await client.connect(transport);
  console.log("✓ Connected to SSE MCP server");

  // List available tools
  const tools = await client.listTools();
  console.log("\nAvailable tools:");
  console.log(JSON.stringify(tools, null, 2));

  // Call example_tool
  console.log("\nCalling example_tool...");
  const result = await client.callTool({
    name: "example_tool",
    arguments: {
      message: "Hello from SSE client!",
      count: 99,
    },
  });

  console.log("\nResult:");
  console.log(JSON.stringify(result, null, 2));

  // Test validation error
  console.log("\nTesting validation (empty message)...");
  const errorResult = await client.callTool({
    name: "example_tool",
    arguments: {
      message: "",
    },
  });
  console.log(JSON.stringify(errorResult, null, 2));

  await client.close();
  console.log("\n✓ Test completed successfully");
  process.exit(0);
}

testSSEServer().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
