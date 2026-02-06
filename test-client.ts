import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testMCPServer() {
  // Create client
  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  // Connect to server
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
  });

  await client.connect(transport);
  console.log("✓ Connected to MCP server");

  // List available tools
  const tools = await client.listTools();
  console.log("\nAvailable tools:");
  console.log(JSON.stringify(tools, null, 2));

  // Call example_tool
  console.log("\nCalling example_tool...");
  const result = await client.callTool({
    name: "example_tool",
    arguments: {
      message: "Hello from test client!",
      count: 42,
    },
  });

  console.log("\nResult:");
  console.log(JSON.stringify(result, null, 2));

  // Test validation error
  console.log("\nTesting validation (empty message)...");
  try {
    const errorResult = await client.callTool({
      name: "example_tool",
      arguments: {
        message: "",
      },
    });
    console.log(JSON.stringify(errorResult, null, 2));
  } catch (error) {
    console.log("Error:", error);
  }

  await client.close();
  process.exit(0);
}

testMCPServer().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
