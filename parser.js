import { spawn } from "child_process";
import { EventEmitter } from "events";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import { DATA_DIR, SETTINGS_PATH, OTP_PATH } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ParserBridge extends EventEmitter {
  constructor(channels = []) {
    super();
    this.channels = channels;
    this.process = null;
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

    this.process.on("error", (err) => this.emit("error", err));
    this.process.on("exit", (code) => {
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
        } else if (payload.type === "status") {
          this.emit("status", payload);
        } else {
          this.emit("message", payload);
        }
      } catch (err) {
        this.emit("error", new Error(`Failed to parse parser output: ${err.message}`));
      }
    });

    this.process.stdin.write(JSON.stringify(this.channels));
    this.process.stdin.end();
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

export function createParser(channels) {
  const bridge = new ParserBridge(channels);
  bridge.start();
  return bridge;
}
