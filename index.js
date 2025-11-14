import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import { createParser } from "./parser.js";
import {
  loadSettings,
  setPrompt,
  addRegion,
  removeRegion,
  setPhoneNumber,
  recordOtp
} from "./config.js";
import logger from "./logger.js";
import { createMessageProcessor } from "./message-processor.js";

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
const botLogger = logger.child({ scope: "bot" });
const adminLogger = logger.child({ scope: "admin" });
const ingestLogger = logger.child({ scope: "ingest" });
const alertLogger = logger.child({ scope: "alerts" });
const processIncomingMessage = createMessageProcessor({ broadcastAlert, logger });

botLogger.info("Bot runtime initialized", {
  targetChats: TARGET_CHAT_IDS.length,
  adminChats: ADMIN_CHAT_IDS.size || 0
});

startParser();
registerAdminCommands();

function startParser() {
  if (parser) {
    parser.removeAllListeners();
    parser.stop();
  }

  const { channels } = loadSettings();
  botLogger.info("Spawning python parser", { channels: channels.length });
  parser = createParser(channels);

  parser.on("message", (message) => {
    ingestLogger.debug("Message received from parser", {
      channel: message.channel,
      id: message.id
    });
    processIncomingMessage(message);
  });

  parser.on("status", handleParserStatus);

  parser.on("error", (err) => {
    botLogger.error("Parser error", { error: err.message });
    notifyAdmins(`Парсер повідомив про помилку: ${err.message}`);
  });

  parser.on("exit", (code) => {
    botLogger.warn("Parser exited", { code });
    notifyAdmins(`Парсер вимкнувся з кодом ${code}. Автоматичний перезапуск.`);
    scheduleParserRestart();
  });
}

function scheduleParserRestart(delay = 5000) {
  if (restartTimeout) {
    return;
  }
  botLogger.info("Scheduling parser restart", { delayMs: delay });
  restartTimeout = setTimeout(() => {
    restartTimeout = null;
    startParser();
  }, delay);
}

function handleParserStatus(status) {
  lastParserStatus = status;
  botLogger.info("Parser status", status);
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
    botLogger.info("Admin notice broadcast skipped (no admin targets)", { text });
    return;
  }

  adminLogger.info("Sending admin notification", {
    text,
    targets
  });
  await Promise.all(
    targets.map(async (chatId) => {
      try {
        await bot.sendMessage(chatId, text);
      } catch (err) {
        adminLogger.error("Failed to notify admin", { chatId, error: err.message });
      }
    })
  );
}

function registerAdminCommands() {
  bot.onText(/^\/help$/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    adminLogger.info("/help requested", { chatId: msg.chat.id });
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
    adminLogger.info("/listregions", { chatId: msg.chat.id, totalRegions: regions.length });
    bot.sendMessage(msg.chat.id, `Моніторимо регіони:\n- ${regions.join("\n- ")}`);
  });

  bot.onText(/^\/prompt$/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const { prompt } = loadSettings();
    adminLogger.info("/prompt requested", { chatId: msg.chat.id });
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
    adminLogger.info("Prompt updated", { chatId: msg.chat.id, length: nextPrompt.length });
    bot.sendMessage(msg.chat.id, "Промпт оновлено. Нові аналізи використовуватимуть його автоматично.");
  });

  bot.onText(/^\/addregion\s+(.+)$/i, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    try {
      const region = match?.[1]?.trim();
      addRegion(region);
      adminLogger.info("Region added", { chatId: msg.chat.id, region });
      const { regions } = loadSettings();
      bot.sendMessage(msg.chat.id, `Регіон додано. Поточний список:\n- ${regions.join("\n- ")}`);
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Не вдалося додати регіон: ${err.message}`);
      adminLogger.error("Failed to add region", { chatId: msg.chat.id, error: err.message });
    }
  });

  bot.onText(/^\/removeregion\s+(.+)$/i, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    try {
      const region = match?.[1]?.trim();
      removeRegion(region);
      adminLogger.info("Region removed", { chatId: msg.chat.id, region });
      const { regions } = loadSettings();
      bot.sendMessage(msg.chat.id, `Регіон видалено. Поточний список:\n- ${regions.join("\n- ")}`);
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Не вдалося видалити регіон: ${err.message}`);
      adminLogger.error("Failed to remove region", { chatId: msg.chat.id, error: err.message });
    }
  });

  bot.onText(/^\/setphone\s+(.+)$/i, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    try {
      const phone = match?.[1]?.trim();
      setPhoneNumber(phone);
      adminLogger.info("Phone number stored", { chatId: msg.chat.id });
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
      adminLogger.info("OTP recorded", { chatId: msg.chat.id });
      bot.sendMessage(msg.chat.id, "OTP збережено. Python-парсер продовжить авторизацію автоматично.");
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Не вдалося прийняти OTP: ${err.message}`);
      adminLogger.error("Failed to record OTP", { chatId: msg.chat.id, error: err.message });
    }
  });

  bot.onText(/^\/status$/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const statusText = lastParserStatus?.message || "Статус недоступний";
    const stage = lastParserStatus?.stage ? ` (етап: ${lastParserStatus.stage})` : "";
    adminLogger.info("/status requested", { chatId: msg.chat.id, status: lastParserStatus?.status });
    bot.sendMessage(msg.chat.id, `Статус парсера: ${statusText}${stage}`);
  });
}

async function broadcastAlert(alertText) {
  if (!TARGET_CHAT_IDS.length) {
    alertLogger.warn("No TELEGRAM_TARGET_CHAT_IDS configured. Alert logged only.");
    return;
  }

  await Promise.all(
    TARGET_CHAT_IDS.map(async (chatId) => {
      try {
        await bot.sendMessage(chatId, alertText);
        alertLogger.info("Alert delivered", { chatId });
      } catch (err) {
        alertLogger.error("Failed to send alert", { chatId, error: err.message });
      }
    })
  );
}

process.on("SIGINT", () => {
  if (parser) {
    parser.stop();
  }
  botLogger.info("SIGINT received. Stopping bot gracefully.");
  process.exit(0);
});
