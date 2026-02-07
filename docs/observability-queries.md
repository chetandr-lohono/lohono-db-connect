# Observability Query Examples

## SigNoz UI Queries

### 1. Trace Full Flow: Web → Backend → MCP → Postgres

In the **SigNoz Traces** tab, search by trace ID:

```
traceID = <your-trace-id>
```

This shows the full waterfall: HTTP request → auth middleware → chat handler → Claude API → MCP tool call → Postgres query.

The `X-Correlation-ID` response header contains the trace ID for any API call.

### 2. Find All Requests by User

```
user.id = "someone@isprava.com"
```

Or filter by service:
```
serviceName = "lohono-mcp-client" AND user.email = "someone@isprava.com"
```

### 3. Find Slow MCP Tool Calls (>5s)

```
serviceName = "lohono-mcp-client" AND name CONTAINS "mcp.tool" AND durationNano > 5000000000
```

### 4. Find Failed Requests

```
statusCode = ERROR
```

Or HTTP 5xx specifically:
```
http.response.status_code >= 500
```

### 5. Claude API Calls with Token Usage

```
name = "llm.claude.messages.create"
```

Attributes available: `llm.model`, `llm.usage.input_tokens`, `llm.usage.output_tokens`, `llm.stop_reason`, `llm.round`.

### 6. Database Query Performance

```
db.system = "postgresql" AND durationNano > 1000000000
```

### 7. SSE Session Lifecycle

```
name = "mcp.sse.session"
```

## ClickHouse Direct Queries

If you need to query ClickHouse directly (advanced):

### Find traces by user email (last 1 hour)
```sql
SELECT DISTINCT traceID, serviceName, name, durationNano / 1e6 as duration_ms
FROM signoz_traces.distributed_signoz_index_v2
WHERE timestamp > now() - INTERVAL 1 HOUR
  AND stringTagMap['user.email'] = 'someone@isprava.com'
ORDER BY timestamp DESC
LIMIT 50
```

### MCP tool call latency percentiles
```sql
SELECT
  stringTagMap['mcp.tool.name'] as tool_name,
  count() as calls,
  quantile(0.50)(durationNano / 1e6) as p50_ms,
  quantile(0.95)(durationNano / 1e6) as p95_ms,
  quantile(0.99)(durationNano / 1e6) as p99_ms
FROM signoz_traces.distributed_signoz_index_v2
WHERE timestamp > now() - INTERVAL 24 HOUR
  AND name LIKE 'mcp.tool.%'
GROUP BY tool_name
ORDER BY calls DESC
```

### Claude API cost tracking
```sql
SELECT
  toDate(timestamp) as day,
  count() as api_calls,
  sum(numberTagMap['llm.usage.input_tokens']) as total_input_tokens,
  sum(numberTagMap['llm.usage.output_tokens']) as total_output_tokens,
  avg(durationNano / 1e6) as avg_duration_ms
FROM signoz_traces.distributed_signoz_index_v2
WHERE timestamp > now() - INTERVAL 7 DAY
  AND name = 'llm.claude.messages.create'
GROUP BY day
ORDER BY day DESC
```

### Error rate by service (last 24h)
```sql
SELECT
  serviceName,
  count() as total,
  countIf(hasError = true) as errors,
  round(countIf(hasError = true) / count() * 100, 2) as error_rate_pct
FROM signoz_traces.distributed_signoz_index_v2
WHERE timestamp > now() - INTERVAL 24 HOUR
GROUP BY serviceName
ORDER BY error_rate_pct DESC
```

### End-to-end request trace reconstruction
```sql
SELECT
  traceID,
  spanID,
  parentSpanID,
  serviceName,
  name,
  durationNano / 1e6 as duration_ms,
  stringTagMap['user.email'] as user_email,
  stringTagMap['mcp.tool.name'] as tool_name,
  stringTagMap['db.system'] as db_system,
  hasError
FROM signoz_traces.distributed_signoz_index_v2
WHERE traceID = '<your-trace-id>'
ORDER BY timestamp ASC
```

## Log Queries in SigNoz

### Find logs for a specific trace
```
trace_id = <your-trace-id>
```

### Find error logs with stack traces
```
level = "error" AND body CONTAINS "stack_trace"
```

### Find logs by user
```
user_id = "someone@isprava.com"
```

## Structured Log Fields

Every log entry includes:
- `trace_id` — OpenTelemetry trace ID (correlates with spans)
- `span_id` — Current span ID
- `timestamp_ist` — IST-formatted timestamp
- `service` — Service name (`lohono-mcp-server` or `lohono-mcp-client`)
- `user_id` — Authenticated user's ID/email
- `user_email` — User email
- `http_method`, `http_path`, `http_status`, `duration_ms` — HTTP context
- `request_body` — Sanitized request body (PII masked)
- `error_name`, `error_message`, `stack_trace` — Error details

## Custom Span Attributes

| Span Kind | Attributes |
|-----------|-----------|
| `mcp.tool.*` | `mcp.tool.name`, `mcp.tool.args`, `mcp.tool.result_length` |
| `mcp.server.tool.*` | `mcp.tool.name`, `mcp.tool.args_summary`, `user.email` |
| `mcp.sse.session` | `mcp.transport`, `user.email` |
| `llm.claude.messages.create` | `llm.model`, `llm.round`, `llm.stop_reason`, `llm.usage.*` |
| `db.postgres.*` | `db.system`, `db.operation`, `db.statement` |
| `db.mongodb.*` | `db.system`, `db.collection`, `db.operation` |
