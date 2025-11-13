import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "messages.sqlite");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    date TEXT NOT NULL
  )
`).run();

const hasMessageStmt = db.prepare("SELECT 1 FROM messages WHERE id = ?");
const insertMessageStmt = db.prepare("INSERT OR IGNORE INTO messages (id, channel, date) VALUES (?, ?, ?)");

export function hasMessage(messageId) {
  return Boolean(hasMessageStmt.get(messageId));
}

export function saveMessage(messageId, channel, date) {
  insertMessageStmt.run(messageId, channel, date);
}
