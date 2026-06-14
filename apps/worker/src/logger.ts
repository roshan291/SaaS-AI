// Structured logging for the worker process.
//
// We use pino for the same reasons as the API: it is fast, emits JSON by
// default (so log aggregators can index fields), and supports a child logger
// pattern that lets us attach contextual fields once (e.g. `queue`, `jobId`)
// without repeating them in every log line.
//
// In development we pretty-print to a TTY for readability; in production we
// emit raw NDJSON so the host platform (Docker / k8s / Fly / Render) can
// ingest it directly.
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: { service: "worker" },
    transport: isDev
        ? {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:HH:MM:ss.l",
                ignore: "pid,hostname,service"
            }
        }
        : undefined
});
