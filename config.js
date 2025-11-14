import fs from "fs";
import path from "path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
export const SETTINGS_PATH = process.env.SETTINGS_PATH || path.join(DATA_DIR, "settings.json");
export const OTP_PATH = process.env.OTP_PATH || path.join(DATA_DIR, "otp.json");

const ANALYST_PROMPT = `Ти — український аналітик реальних загроз.
Відповідай лише у форматі шести рядків (ніякого JSON):
Загроза: так/ні
Тип: <тип загрози або "невідомо">
Локації: <перелік регіонів/міст через кому або "невідомо">
Опис: <1-2 нейтральні речення з підсумком>
Час: <час/дата з повідомлення або "невідомо">
Ймовірність: <число 0-100 із знаком %>

Правила:
- Якщо немає реальної або потенційної загрози, напиши "Загроза: ні".
- Не додавай даних, яких немає в повідомленні, та не галюцинуй.
- Якщо локація незрозуміла, вкажи "невідомо".
- Якщо тип загрози незрозумілий, вкажи "невідомо".
- Не копіюй оригінальний текст, лише роби аналітичний підсумок.
- Якщо повідомляється про активність на бойових частотах стратегічної авіації, зліт стратегічної авіації, пуски шахедів, пуски крилатих ракет будь-якого типу, зліт МІГ-31К, пуск Кинджала, вихід флоту в море – попередження надається незалежно від локації. Будь-що що може дістати будь-де – 100% попередження.
- Всі канали можуть говорити про одну й ту саму загрозу. Цитуй тільки один, не повторюйся багато разів.
- Повертай тільки вказані шість рядків без додаткових пояснень.
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
