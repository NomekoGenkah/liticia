import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import { config } from "./env";

const logsDir = path.resolve(__dirname, "../../../", config.STORAGE_LOGS_DIR);
fs.mkdirSync(logsDir, { recursive: true });

const destination = pino.destination(path.join(logsDir, "backend.log"));

export const logger = pino(
  {
    level: config.LOG_LEVEL,
    base: { service: "licitia-backend" },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  config.NODE_ENV === "development"
    ? pino.multistream([
        { stream: pino.transport({ target: "pino-pretty", options: { colorize: true } }) },
        { stream: destination },
      ])
    : destination
);
