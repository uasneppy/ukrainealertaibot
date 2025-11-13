import { spawn } from "child_process";
import { EventEmitter } from "events";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import { DATA_DIR, SETTINGS_PATH, OTP_PATH } from "./config.js";
import logger from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ParserBridge extends EventEmitter {
  constructor(channels = []) {
    super();
    this.channels = channels;
    this.process = null;
    this.log = logger.child({ scope: "parser-bridge" });
  }

  start() {
    const scriptPath = path.join(__dirname, "parse.py");

    this.process = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "inherit"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        DATA_DIR,
        SETTINGS_PATH,
        OTP_PATH,
        TELETHON_SESSION_PATH: path.join(DATA_DIR, "telegram_parser")
      }
    });

    this.process.on("error", (err) => {
      this.log.error("Parser process failed to start", { error: err.message });
      this.emit("error", err);
    });
    this.process.on("exit", (code) => {
      this.log.warn("Parser process exited", { code });
      this.emit("exit", code);
    });

    const rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const payload = JSON.parse(line);
        if (payload.type === "message") {
          this.emit("message", payload.data);
          this.log.debug("Forwarded parser message", {
            channel: payload?.data?.channel,
            id: payload?.data?.id
          });
        } else if (payload.type === "status") {
          this.emit("status", payload);
          this.log.info("Parser status event", payload);
        } else {
          this.emit("message", payload);
        }
      } catch (err) {
        this.log.error("Failed to parse parser output", { error: err.message, line });
        this.emit("error", new Error(`Failed to parse parser output: ${err.message}`));
      }
    });

    this.log.info("Passing channels to parser", { channels: this.channels.length });
    this.process.stdin.write(JSON.stringify(this.channels));
    this.process.stdin.end();
  }

  stop() {
    if (this.process) {
      this.log.info("Stopping parser process");
      this.process.kill();
    }
  }
}

export function createParser(channels) {
  const bridge = new ParserBridge(channels);
  bridge.start();
  return bridge;
}
