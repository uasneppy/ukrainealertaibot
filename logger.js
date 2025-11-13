import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config.js";

const LEVELS = ["error", "warn", "info", "debug"];
const LEVEL_RANK = LEVELS.reduce((acc, level, index) => {
  acc[level] = index;
  return acc;
}, {});

const DEFAULT_LEVEL = normalizeLevel(process.env.LOG_LEVEL || "info");
const LOG_DIR = path.resolve(process.env.LOG_DIR || path.join(DATA_DIR, "logs"));
const LOG_FILE_PATH = path.resolve(process.env.LOG_FILE || path.join(LOG_DIR, "bot.log"));

fs.mkdirSync(LOG_DIR, { recursive: true });

const stream = fs.createWriteStream(LOG_FILE_PATH, { flags: "a" });
let currentLevel = DEFAULT_LEVEL;

stream.on("error", (err) => {
  console.error("Logger stream error:", err);
});

process.on("exit", () => {
  if (!stream.destroyed) {
    stream.end();
  }
});

function normalizeLevel(level) {
  const normalized = String(level || "info").toLowerCase();
  if (!LEVELS.includes(normalized)) {
    return "info";
  }
  return normalized;
}

function shouldLog(level) {
  return LEVEL_RANK[level] <= LEVEL_RANK[currentLevel];
}

function sanitizeMeta(meta = {}) {
  const output = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value instanceof Error) {
      output[key] = { message: value.message, stack: value.stack };
      continue;
    }
    if (value && typeof value === "object") {
      try {
        output[key] = JSON.parse(JSON.stringify(value));
      } catch {
        output[key] = String(value);
      }
      continue;
    }
    if (typeof value === "undefined") {
      continue;
    }
    output[key] = value;
  }
  return output;
}

function writeLog(level, message, bindings, meta) {
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const context = sanitizeMeta({ ...bindings, ...(meta || {}) });
  const entry = { timestamp, level, message, ...context };
  const line = JSON.stringify(entry);
  stream.write(line + "\n");

  const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  const consoleArgs = [
    `[${timestamp}] [${level.toUpperCase()}] ${message}`,
    Object.keys(context).length ? context : undefined
  ].filter(Boolean);
  consoleMethod(...consoleArgs);
}

class StructuredLogger {
  constructor(bindings = {}) {
    this.bindings = bindings;
  }

  child(childBindings = {}) {
    return new StructuredLogger({ ...this.bindings, ...childBindings });
  }

  debug(message, meta) {
    writeLog("debug", message, this.bindings, meta);
  }

  info(message, meta) {
    writeLog("info", message, this.bindings, meta);
  }

  warn(message, meta) {
    writeLog("warn", message, this.bindings, meta);
  }

  error(message, meta) {
    writeLog("error", message, this.bindings, meta);
  }
}

export function setLogLevel(level) {
  currentLevel = normalizeLevel(level);
}

export function flushLogs() {
  return new Promise((resolve, reject) => {
    stream.write("", (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export const LOG_FILE = LOG_FILE_PATH;

const rootLogger = new StructuredLogger();
export default rootLogger;
