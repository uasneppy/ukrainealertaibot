import fs from "fs";
import path from "path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
export const SETTINGS_PATH = process.env.SETTINGS_PATH || path.join(DATA_DIR, "settings.json");
export const OTP_PATH = process.env.OTP_PATH || path.join(DATA_DIR, "otp.json");

const ANALYST_PROMPT = `You are a Ukrainian real-time threat analyst.
Always return JSON with the following structure:
{
  "threat": true/false,
  "threat_type": "string describing the threat (missiles, S-300, drones, artillery, explosions, unknown, potential threat)",
  "locations": ["list of Ukrainian regions or cities"],
  "summary": "1-2 sentences summarizing the threat in neutral language",
  "timestamp": "timestamp from message text if present, else null",
  "confidence": 0.0-1.0
}

Rules:
- If the message does not contain a real or potential threat, return threat=false.
- Never add information that does not exist in the message.
- Do not hallucinate.
- If location is unclear, set locations=["unknown"].
- If threat type is unclear, set threat_type="unknown".
- Your output MUST BE VALID JSON, no extra text.
- You never copy the original message; you only provide analytical summary.
- Якщо повідомляється про активність на бойових частотах стратегічної авіації, зліт стратегічної авіації, пуски шахедів, пуски крилатих ракет будь-якого типу, зліт МІГ-31К, пуск Кинджала, вихід флоту в море – попередження надається в незалежності від локації. Будь-що що може дістати будь-де – 100% попередження.
- Всі канали можуть говорити про одну й ту саму загрозу. Цитуй тільки один, не повторюйся багато разів.
`;

export const DEFAULT_SETTINGS = {
  prompt: ANALYST_PROMPT,
  regions: [
    "Київ",
    "Київська область",
    "Харків",
    "Харківська область",
    "Дніпро",
    "Дніпропетровська область",
    "Одеса",
    "Одеська область",
    "Львів",
    "Львівська область",
    "Запоріжжя",
    "Запорізька область",
    "Миколаїв",
    "Миколаївська область",
    "Суми",
    "Сумська область",
    "Чернігів",
    "Чернігівська область"
  ],
  channels: ["air_alert_ua", "deepstateua"],
  phoneNumber: ""
};

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeList(values, fallback) {
  if (!Array.isArray(values) || values.length === 0) {
    return [...fallback];
  }
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeSettings(settings = {}) {
  return {
    prompt:
      typeof settings.prompt === "string" && settings.prompt.trim().length > 0
        ? settings.prompt.trim()
        : DEFAULT_SETTINGS.prompt,
    regions: normalizeList(settings.regions, DEFAULT_SETTINGS.regions),
    channels: normalizeList(settings.channels, DEFAULT_SETTINGS.channels),
    phoneNumber: settings.phoneNumber ? String(settings.phoneNumber).trim() : ""
  };
}

function ensureSettingsFile() {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    const normalized = normalizeSettings(raw);
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(normalized, null, 2));
    }
    return normalized;
  } catch (err) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return DEFAULT_SETTINGS;
  }
}

export function loadSettings() {
  return ensureSettingsFile();
}

export function saveSettings(nextSettings) {
  ensureDataDir();
  const normalized = normalizeSettings(nextSettings);
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

export function updateSettings(partial = {}) {
  const current = loadSettings();
  return saveSettings({ ...current, ...partial });
}

export function setPrompt(prompt) {
  if (!prompt || !prompt.trim()) {
    throw new Error("Prompt text is required");
  }
  return updateSettings({ prompt: prompt.trim() });
}

export function addRegion(region) {
  if (!region || !region.trim()) {
    throw new Error("Region name is required");
  }
  const settings = loadSettings();
  const normalizedRegion = region.trim();
  if (!settings.regions.includes(normalizedRegion)) {
    settings.regions.push(normalizedRegion);
  }
  return saveSettings(settings);
}

export function removeRegion(region) {
  if (!region || !region.trim()) {
    throw new Error("Region name is required");
  }
  const settings = loadSettings();
  const normalizedRegion = region.trim();
  settings.regions = settings.regions.filter((value) => value !== normalizedRegion);
  return saveSettings(settings);
}

export function setPhoneNumber(phoneNumber) {
  if (!phoneNumber || !phoneNumber.trim()) {
    throw new Error("Phone number is required");
  }
  return updateSettings({ phoneNumber: phoneNumber.trim() });
}

export function recordOtp(code) {
  if (!code || !code.trim()) {
    throw new Error("OTP code is required");
  }
  ensureDataDir();
  fs.writeFileSync(
    OTP_PATH,
    JSON.stringify(
      {
        otp: code.trim(),
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

export function clearOtpFile() {
  ensureDataDir();
  fs.writeFileSync(
    OTP_PATH,
    JSON.stringify(
      {
        otp: null,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}
