import { z } from "zod";
import pg from "pg";
import {
  getFullContext,
  classifyIntent,
  getQueryTemplate,
  listQueryPatterns,
} from "./schema-rules.js";

const { Pool } = pg;

// ── Database pool ──────────────────────────────────────────────────────────

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5433"),
  user: process.env.DB_USER || "lohono_api",
  database: process.env.DB_NAME || "lohono_api_production",
  password: process.env.DB_PASSWORD || "",
});

// ── Zod schemas ────────────────────────────────────────────────────────────

const QueryInputSchema = z.object({
  sql: z.string().min(1, "SQL query cannot be empty"),
  params: z.array(z.unknown()).optional(),
});

const DescribeTableInputSchema = z.object({
  table_name: z.string().min(1, "Table name cannot be empty"),
  schema: z.string().optional().default("public"),
});

const ListTablesInputSchema = z.object({
  schema: z.string().optional().default("public"),
});

const ClassifyIntentInputSchema = z.object({
  question: z.string().min(1, "Question cannot be empty"),
});

const GetQueryTemplateInputSchema = z.object({
  pattern_name: z.string().min(1, "Pattern name cannot be empty"),
});

// ── Read-only query helper ─────────────────────────────────────────────────

async function executeReadOnlyQuery(sql: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Tool definitions (JSON Schema for MCP) ─────────────────────────────────

export const toolDefinitions = [
  // ── Database tools ──
  {
    name: "query",
    description:
      "Run a read-only SQL query against the lohono_api_production PostgreSQL database. Use parameterized queries ($1, $2, ...) with the params array for user-supplied values.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "The SQL query to execute (read-only)",
        },
        params: {
          type: "array",
          description:
            "Optional array of parameter values for parameterized queries",
          items: {},
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "list_tables",
    description:
      "List all tables in a given schema of the lohono_api_production database",
    inputSchema: {
      type: "object" as const,
      properties: {
        schema: {
          type: "string",
          description: 'Schema name (defaults to "public")',
        },
      },
    },
  },
  {
    name: "describe_table",
    description:
      "Get the column definitions, types, and constraints for a specific table",
    inputSchema: {
      type: "object" as const,
      properties: {
        table_name: {
          type: "string",
          description: "Name of the table to describe",
        },
        schema: {
          type: "string",
          description: 'Schema name (defaults to "public")',
        },
      },
      required: ["table_name"],
    },
  },
  {
    name: "list_schemas",
    description: "List all schemas in the database",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  // ── Schema intelligence tools ──
  {
    name: "get_sales_funnel_context",
    description:
      "Get the complete sales funnel schema intelligence — core business rules, funnel stage definitions, date filter patterns, source mappings, anti-patterns, and validation checklist. Call this FIRST before writing any sales funnel SQL query to understand all mandatory rules.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "classify_sales_intent",
    description:
      "Classify a natural-language question about sales funnel data. Returns the matching query pattern(s), applicable business rules, date filters, and validation checks. Use this to determine WHICH query pattern to use before generating SQL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description:
            "The user's natural-language question about sales/funnel data",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "get_query_template",
    description:
      "Get the full rule set, date filters, funnel stages, metrics, special logic, and validation checks for a specific named query pattern. Available patterns: mtd_funnel_current, mtd_funnel_last_year, source_daily_breakdown, open_funnel_count, mtd_lead_details, prospect_aging, account_aging, historical_funnel_details, regional_closed_analysis.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pattern_name: {
          type: "string",
          description:
            "Name of the query pattern (e.g. mtd_funnel_current, prospect_aging)",
        },
      },
      required: ["pattern_name"],
    },
  },
  {
    name: "list_query_patterns",
    description:
      "List all available sales funnel query patterns with their descriptions and intent keywords. Use this to discover which patterns exist.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ── Tool handler ───────────────────────────────────────────────────────────

export async function handleToolCall(
  name: string,
  args: Record<string, unknown> | undefined
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  try {
    // ── Database tools ──

    if (name === "query") {
      const { sql, params } = QueryInputSchema.parse(args);
      const result = await executeReadOnlyQuery(sql, params);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { rowCount: result.rowCount, rows: result.rows },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "list_tables") {
      const { schema } = ListTablesInputSchema.parse(args);
      const result = await executeReadOnlyQuery(
        `SELECT table_name, table_type
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY table_name`,
        [schema]
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
      };
    }

    if (name === "describe_table") {
      const { table_name, schema } = DescribeTableInputSchema.parse(args);
      const result = await executeReadOnlyQuery(
        `SELECT
           c.column_name,
           c.data_type,
           c.character_maximum_length,
           c.is_nullable,
           c.column_default,
           tc.constraint_type
         FROM information_schema.columns c
         LEFT JOIN information_schema.key_column_usage kcu
           ON c.table_schema = kcu.table_schema
           AND c.table_name = kcu.table_name
           AND c.column_name = kcu.column_name
         LEFT JOIN information_schema.table_constraints tc
           ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
         WHERE c.table_schema = $1 AND c.table_name = $2
         ORDER BY c.ordinal_position`,
        [schema, table_name]
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
      };
    }

    if (name === "list_schemas") {
      const result = await executeReadOnlyQuery(
        `SELECT schema_name
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY schema_name`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
      };
    }

    // ── Schema intelligence tools ──

    if (name === "get_sales_funnel_context") {
      const context = getFullContext();
      return {
        content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
      };
    }

    if (name === "classify_sales_intent") {
      const { question } = ClassifyIntentInputSchema.parse(args);
      const result = classifyIntent(question);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === "get_query_template") {
      const { pattern_name } = GetQueryTemplateInputSchema.parse(args);
      const template = getQueryTemplate(pattern_name);
      if (!template) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown pattern: "${pattern_name}". Use list_query_patterns to see available patterns.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(template, null, 2) }],
      };
    }

    if (name === "list_query_patterns") {
      const patterns = listQueryPatterns();
      return {
        content: [{ type: "text", text: JSON.stringify(patterns, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: "text",
            text: `Validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}
