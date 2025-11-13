import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import { createParser } from "./parser.js";
import { analyzeMessage } from "./ai.js";
import { REGIONS, CHANNELS } from "./config.js";
import { hasRelevantLocation, isGlobalThreat, formatAlert } from "./utils.js";
import { hasMessage, saveMessage } from "./db.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const TARGET_CHAT_IDS = (process.env.TELEGRAM_TARGET_CHAT_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (TARGET_CHAT_IDS.length === 0) {
  console.warn("No TELEGRAM_TARGET_CHAT_IDS specified. Alerts will not be delivered.");
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const parser = createParser(CHANNELS);

const queue = [];
let processing = false;

parser.on("message", (message) => {
  queue.push(message);
  processQueue();
});

parser.on("error", (err) => {
  console.error("Parser error:", err);
});

parser.on("exit", (code) => {
  console.warn(`Parser exited with code ${code}`);
});

async function processQueue() {
  if (processing || queue.length === 0) {
    return;
  }

  processing = true;

  while (queue.length > 0) {
    const message = queue.shift();
    const messageKey = `${message.channel}:${message.id}`;

    try {
      if (hasMessage(messageKey)) {
        continue;
      }

      if (!message.text) {
        saveMessage(messageKey, message.channel, message.date);
        continue;
      }

      const analysis = await analyzeMessage(message.text);
      if (analysis.threat) {
        const relevantLocation = hasRelevantLocation(analysis.locations, REGIONS);
        const globalThreat = isGlobalThreat(analysis);

        if (globalThreat || relevantLocation) {
          const alert = formatAlert(analysis, message);
          await broadcastAlert(alert);
        }
      }

      saveMessage(messageKey, message.channel, message.date);
    } catch (err) {
      console.error(`Failed to process message ${messageKey}:`, err);
    }
  }

  processing = false;
}

async function broadcastAlert(alertText) {
  if (!TARGET_CHAT_IDS.length) {
    console.log("Alert (not sent):\n" + alertText);
    return;
  }

  await Promise.all(
    TARGET_CHAT_IDS.map(async (chatId) => {
      try {
        await bot.sendMessage(chatId, alertText);
      } catch (err) {
        console.error(`Failed to send alert to ${chatId}:`, err.message);
      }
    })
  );
}

process.on("SIGINT", () => {
  parser.stop();
  process.exit(0);
});
