# lohono-db-context

A Model Context Protocol (MCP) server with Zod validation built using TypeScript.

## Features

- TypeScript with strict type checking
- MCP SDK integration
- Zod schema validation for tool inputs
- Example tool implementation

## Installation

```bash
npm install
```

## Development

### Stdio Server (for Claude CLI)

Run in development mode with hot reload:

```bash
npm run dev
```

### SSE Server (HTTP)

Run SSE server in development mode:

```bash
npm run dev:sse
```

The server will start on `http://localhost:3000`

## Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

## Start

### Start Stdio Server

```bash
npm start
```

### Start SSE Server

```bash
npm start:sse
```

## Project Structure

- `src/index.ts` - Main MCP server implementation
- `tsconfig.json` - TypeScript configuration
- `package.json` - Project dependencies and scripts

## Adding Tools

To add new tools:

1. Define a Zod schema for input validation
2. Register the tool in the `ListToolsRequestSchema` handler
3. Implement the tool logic in the `CallToolRequestSchema` handler
4. Use Zod's `.parse()` method to validate inputs

## Example

The project includes an `example_tool` that demonstrates:
- Input validation with Zod
- Error handling for invalid inputs
- Returning structured responses
