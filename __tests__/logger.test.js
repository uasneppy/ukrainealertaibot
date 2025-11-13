/**
 * Summary:
 * - Modules: logger.js structured logging utility.
 * - Behaviors: file persistence with metadata, log level filtering.
 * - Run: npm test
 */

import fs from "fs";
import path from "path";
import { beforeEach, afterAll, describe, it, expect } from "vitest";

const TEST_DATA_DIR = path.join(process.cwd(), "tmp-logger-store");
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.LOG_DIR = path.join(TEST_DATA_DIR, "logs");
process.env.LOG_FILE = path.join(process.env.LOG_DIR, "bot.log");

const loggerModule = await import("../logger.js");
const { default: logger, flushLogs, setLogLevel, LOG_FILE } = loggerModule;

function resetLogFile() {
  fs.mkdirSync(process.env.LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, "");
}

beforeEach(async () => {
  resetLogFile();
  setLogLevel("debug");
  await flushLogs();
});

afterAll(() => {
  setLogLevel(process.env.LOG_LEVEL || "info");
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("structured logger", () => {
  it("writes structured metadata to the log file", async () => {
    logger.info("processing alert", { messageKey: "channel:1" });
    await flushLogs();

    const lines = fs
      .readFileSync(LOG_FILE, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBe(1);

    const payload = JSON.parse(lines[0]);
    expect(payload.message).toBe("processing alert");
    expect(payload.level).toBe("info");
    expect(payload.messageKey).toBe("channel:1");
    expect(payload).toHaveProperty("timestamp");
  });

  it("filters entries using the configured log level", async () => {
    setLogLevel("error");
    resetLogFile();
    await flushLogs();

    logger.info("should be ignored");
    await flushLogs();
    expect(fs.readFileSync(LOG_FILE, "utf-8")).toBe("");

    logger.error("should be persisted");
    await flushLogs();
    const lines = fs
      .readFileSync(LOG_FILE, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBe(1);
    const payload = JSON.parse(lines[0]);
    expect(payload.level).toBe("error");
    expect(payload.message).toBe("should be persisted");
  });
});
