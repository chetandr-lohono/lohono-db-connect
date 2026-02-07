/**
 * OpenTelemetry SDK bootstrap — MUST be imported before any other module.
 *
 * Usage:  import "./observability/tracing.js";   // first line of entrypoint
 *
 * Auto-instruments: Express, HTTP, pg, mongodb, dns, net
 * Exports traces + logs via OTLP/gRPC to the OpenTelemetry Collector.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
} from "@opentelemetry/api";

// ── Debug logging (controlled via env) ─────────────────────────────────────

const diagLevel = process.env.OTEL_LOG_LEVEL === "debug"
  ? DiagLogLevel.DEBUG
  : DiagLogLevel.INFO;
diag.setLogger(new DiagConsoleLogger(), diagLevel);

// ── Resource (identifies this service in SigNoz) ───────────────────────────

const serviceName = process.env.OTEL_SERVICE_NAME || "lohono-unknown";
const collectorUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317";

const resource = new Resource({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "1.0.0",
  "deployment.environment": process.env.NODE_ENV || "development",
  "service.namespace": "lohono-ai",
  "host.timezone": "Asia/Kolkata",
});

// ── Trace exporter ─────────────────────────────────────────────────────────

const traceExporter = new OTLPTraceExporter({ url: collectorUrl });

// ── Log exporter ───────────────────────────────────────────────────────────

const logExporter = new OTLPLogExporter({ url: collectorUrl });
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));

// ── Auto-instrumentation config ────────────────────────────────────────────

const instrumentations = getNodeAutoInstrumentations({
  // Enrich Express spans with route info
  "@opentelemetry/instrumentation-express": {
    enabled: true,
  },
  // Capture HTTP request/response headers selectively
  "@opentelemetry/instrumentation-http": {
    enabled: true,
    headersToSpanAttributes: {
      client: { requestHeaders: ["x-correlation-id", "x-user-email"] },
      server: { requestHeaders: ["x-correlation-id", "x-user-email"] },
    },
  },
  // Capture PG query text (sanitized by default)
  "@opentelemetry/instrumentation-pg": {
    enabled: true,
    enhancedDatabaseReporting: false, // don't leak bind params
  },
  // Capture MongoDB commands
  "@opentelemetry/instrumentation-mongodb": {
    enabled: true,
    enhancedDatabaseReporting: false,
  },
  // Disable noisy FS instrumentation
  "@opentelemetry/instrumentation-fs": { enabled: false },
});

// ── SDK init ─────────────────────────────────────────────────────────────────

const sdk = new NodeSDK({
  resource,
  traceExporter,
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  instrumentations,
});

sdk.start();

diag.info(`[OTel] ${serviceName} → ${collectorUrl}`);

// ── Graceful shutdown ──────────────────────────────────────────────────────

const shutdown = async () => {
  try {
    await sdk.shutdown();
    await loggerProvider.shutdown();
    diag.info("[OTel] SDK shut down successfully");
  } catch (err) {
    diag.error("[OTel] Error shutting down SDK", err as Error);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { sdk, loggerProvider, resource, serviceName };
