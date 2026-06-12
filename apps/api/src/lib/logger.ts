import pino from "pino";

// Single shared logger for the API. Pretty-print in dev for readability,
// JSON in production for ingestion by Loki / Datadog / CloudWatch.
const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),

  // Redact common secret-carrying fields so they never reach logs.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
      "*.apiKey",
      "*.OPENAI_API_KEY",
      "*.GEMINI_API_KEY",
      "*.MONGODB_URI",
      "*.REDIS_URL"
    ],
    censor: "[REDACTED]"
  },

  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname"
          }
        }
      })
});
