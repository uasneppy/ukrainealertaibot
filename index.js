import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import { createParser } from "./parser.js";
import { analyzeMessage } from "./ai.js";
import {
  loadSettings,
  setPrompt,
  addRegion,
  removeRegion,
  setPhoneNumber,
  recordOtp
} from "./config.js";
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

const ADMIN_CHAT_IDS = new Set(
  (process.env.TELEGRAM_ADMIN_CHAT_IDS || process.env.TELEGRAM_TARGET_CHAT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

if (TARGET_CHAT_IDS.length === 0) {
  console.warn("No TELEGRAM_TARGET_CHAT_IDS specified. Alerts will not be delivered.");
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
let parser = null;
let restartTimeout = null;
let lastAnnouncedStage = null;
let lastParserStatus = { status: "init", message: "Парсер запускається" };
const queue = [];
let processing = false;

startParser();
registerAdminCommands();

function startParser() {
  if (parser) {
    parser.removeAllListeners();
    parser.stop();
  }

  const { channels } = loadSettings();
  parser = createParser(channels);

  parser.on("message", (message) => {
    queue.push(message);
    processQueue();
  });

  parser.on("status", handleParserStatus);

  parser.on("error", (err) => {
    console.error("Parser error:", err);
    notifyAdmins(`Парсер повідомив про помилку: ${err.message}`);
  });

  parser.on("exit", (code) => {
    console.warn(`Parser exited with code ${code}`);
    notifyAdmins(`Парсер вимкнувся з кодом ${code}. Автоматичний перезапуск.`);
    scheduleParserRestart();
  });
}

function scheduleParserRestart(delay = 5000) {
  if (restartTimeout) {
    return;
  }
  restartTimeout = setTimeout(() => {
    restartTimeout = null;
    startParser();
  }, delay);
}

function handleParserStatus(status) {
  lastParserStatus = status;
  if (status.status === "auth_status") {
    if (status.stage && status.stage !== lastAnnouncedStage) {
      lastAnnouncedStage = status.stage;
      if (status.message) {
        notifyAdmins(status.message);
      }
    }
  } else if (status.status === "ready") {
    lastAnnouncedStage = "ready";
    if (status.message) {
      notifyAdmins(status.message);
    }
  } else if (status.status === "error") {
    lastAnnouncedStage = "error";
    if (status.message) {
      notifyAdmins(`Помилка авторизації: ${status.message}`);
    }
  }
}

function isAdmin(chatId) {
  if (ADMIN_CHAT_IDS.size === 0) {
    return true;
  }
  return ADMIN_CHAT_IDS.has(String(chatId));
}

async function notifyAdmins(text) {
  if (!text) return;
  const targets = ADMIN_CHAT_IDS.size ? [...ADMIN_CHAT_IDS] : [];

  if (targets.length === 0) {
    console.log(`[ADMIN NOTICE] ${text}`);
    return;
  }

  await Promise.all(
    targets.map(async (chatId) => {
      try {
        await bot.sendMessage(chatId, text);
      } catch (err) {
        console.error(`Failed to notify admin ${chatId}:`, err.message);
      }
    })
  );
}

function registerAdminCommands() {
  bot.onText(/^\/help$/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    bot.sendMessage(
      msg.chat.id,
      [
        "Доступні команди:",
        "/listregions — переглянути список регіонів",
        "/addregion <назва> — додати регіон",
        "/removeregion <назва> — видалити регіон",
        "/prompt — показати поточний промпт",
        "/setprompt <текст> — змінити промпт",
        "/setphone <номер> — зберегти номер Telegram",
        "/setotp <код> — передати OTP від Telegram",
        "/status — стан Python-парсера"
      ].join("\n")
    );
  });

  bot.onText(/^\/listregions$/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const { regions } = loadSettings();
    bot.sendMessage(msg.chat.id, `Моніторимо регіони:\n- ${regions.join("\n- ")}`);
  });

  bot.onText(/^\/prompt$/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const { prompt } = loadSettings();
    bot.sendMessage(msg.chat.id, `Поточний промпт аналітика:\n${prompt}`);
  });

  bot.onText(/^\/setprompt(?:\s+([\s\S]+))?$/i, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const nextPrompt = match?.[1]?.trim();
    if (!nextPrompt) {
      bot.sendMessage(msg.chat.id, "Будь ласка, надішліть текст промпта після команди.");
      return;
    }
    setPrompt(nextPrompt);
    bot.sendMessage(msg.chat.id, "Промпт оновлено. Нові аналізи використовуватимуть його автоматично.");
  });

  bot.onText(/^\/addregion\s+(.+)$/i, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    try {
      const region = match?.[1]?.trim();
      addRegion(region);
      const { regions } = loadSettings();
      bot.sendMessage(msg.chat.id, `Регіон додано. Поточний список:\n- ${regions.join("\n- ")}`);
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Не вдалося додати регіон: ${err.message}`);
    }
  });

  bot.onText(/^\/removeregion\s+(.+)$/i, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    try {
      const region = match?.[1]?.trim();
      removeRegion(region);
      const { regions } = loadSettings();
      bot.sendMessage(msg.chat.id, `Регіон видалено. Поточний список:\n- ${regions.join("\n- ")}`);
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Не вдалося видалити регіон: ${err.message}`);
    }
  });

  bot.onText(/^\/setphone\s+(.+)$/i, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    try {
      const phone = match?.[1]?.trim();
      setPhoneNumber(phone);
      bot.sendMessage(
        msg.chat.id,
        "Номер збережено. Перевірте Telegram — код підтвердження прийде автоматично. Потім скористайтеся /setotp."
      );
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Не вдалося зберегти номер: ${err.message}`);
    }
  });

  bot.onText(/^\/setotp\s+(.+)$/i, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const code = match?.[1]?.replace(/\s+/g, "");
    try {
      recordOtp(code);
      bot.sendMessage(msg.chat.id, "OTP збережено. Python-парсер продовжить авторизацію автоматично.");
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Не вдалося прийняти OTP: ${err.message}`);
    }
  });

  bot.onText(/^\/status$/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const statusText = lastParserStatus?.message || "Статус недоступний";
    const stage = lastParserStatus?.stage ? ` (етап: ${lastParserStatus.stage})` : "";
    bot.sendMessage(msg.chat.id, `Статус парсера: ${statusText}${stage}`);
  });
}

async function processQueue() {
  if (processing || queue.length === 0) {
    return;
  }

  processing = true;

  while (queue.length > 0) {
    const message = queue.shift();
    const settings = loadSettings();
    const regions = settings.regions;
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
        const relevantLocation = hasRelevantLocation(analysis.locations, regions);
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
  if (parser) {
    parser.stop();
  }
  process.exit(0);
});
