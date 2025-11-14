import { GoogleGenerativeAI } from "@google/generative-ai";
import { loadSettings } from "./config.js";
import logger from "./logger.js";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let modelInstance = null;
let lastPromptSignature = null;
const aiLogger = logger.child({ scope: "gemini" });

const THREAT_TRUE_VALUES = ["так", "true", "yes", "1", "загроза", "тривога"];
const THREAT_FALSE_VALUES = ["ні", "no", "false", "0", "нема", "відсутня"];

function normalizePrompt(systemInstruction) {
  return typeof systemInstruction === "string" ? systemInstruction.trim() : "";
}

function buildSystemInstruction(systemInstruction) {
  const normalizedPrompt = normalizePrompt(systemInstruction);
  if (!normalizedPrompt) {
    throw new Error("Gemini system prompt is empty");
  }

  return {
    role: "system",
    parts: [{ text: normalizedPrompt }]
  };
}

function getModel(systemInstruction) {
  if (!process.env.GEMINI_KEY) {
    throw new Error("GEMINI_KEY is not set. Please provide a valid Gemini API key.");
  }

  const normalizedPrompt = normalizePrompt(systemInstruction);
  if (!normalizedPrompt) {
    throw new Error("Gemini system prompt is empty");
  }

  if (!modelInstance || lastPromptSignature !== normalizedPrompt) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
    modelInstance = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: buildSystemInstruction(normalizedPrompt)
    });
    lastPromptSignature = normalizedPrompt;
  }

  return modelInstance;
}

function parseThreatFlag(value) {
  if (!value) {
    throw new Error("Gemini response missing threat indicator");
  }

  const normalized = value.toLowerCase().trim();
  if (THREAT_TRUE_VALUES.some((token) => normalized.includes(token))) {
    return true;
  }
  if (THREAT_FALSE_VALUES.some((token) => normalized.includes(token))) {
    return false;
  }
  throw new Error("Gemini threat indicator unrecognized");
}

function parseLocations(value) {
  if (!value) {
    return ["unknown"];
  }
  const normalized = value.toLowerCase().trim();
  if (!normalized || normalized === "невідомо" || normalized === "unknown") {
    return ["unknown"];
  }
  return value
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTimestamp(value) {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (!normalized || normalized === "невідомо" || normalized === "немає") {
    return null;
  }
  return value.trim();
}

function parseConfidence(value) {
  if (!value) {
    return 0;
  }
  const match = String(value)
    .replace(/,/g, ".")
    .match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) {
    return 0;
  }
  let number = parseFloat(match[1]);
  if (!Number.isFinite(number)) {
    return 0;
  }
  if (number > 1) {
    number = number / 100;
  }
  return Math.min(Math.max(number, 0), 1);
}

function parseStructuredResponse(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("Gemini response is empty");
  }

  const entries = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const label = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (label) {
      entries[label] = value;
    }
  }

  const threatValue = entries["загроза"] || entries["zagroza"] || entries.threat;
  const summary = entries["опис"] || entries["summary"] || "";
  const threatType = entries["тип"] || entries["type"] || "unknown";
  const locations = entries["локації"] || entries["локации"] || entries["locations"];
  const timestamp = entries["час"] || entries["time"] || entries["timestamp"];
  const confidence = entries["ймовірність"] || entries["ймовірнiсть"] || entries["probability"];

  return {
    threat: parseThreatFlag(threatValue),
    threat_type: threatType?.trim() || "unknown",
    locations: parseLocations(locations),
    summary: summary.trim(),
    timestamp: parseTimestamp(timestamp),
    confidence: parseConfidence(confidence)
  };
}

function validateAnalysis(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Gemini response is malformed");
  }

  const result = {
    threat: Boolean(payload.threat),
    threat_type: typeof payload.threat_type === "string" ? payload.threat_type.trim() : "unknown",
    locations:
      Array.isArray(payload.locations) && payload.locations.length > 0
        ? payload.locations.map((loc) => String(loc).trim()).filter(Boolean)
        : ["unknown"],
    summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
    timestamp: payload.timestamp ? String(payload.timestamp).trim() : null,
    confidence:
      typeof payload.confidence === "number" && payload.confidence >= 0 && payload.confidence <= 1
        ? payload.confidence
        : 0
  };

  if (result.summary.length === 0) {
    throw new Error("Gemini summary missing");
  }

  return result;
}

export async function analyzeMessage(text) {
  if (!text || !text.trim()) {
    throw new Error("Message text is empty");
  }

  const { prompt } = loadSettings();
  const model = getModel(prompt);
  aiLogger.debug("Sending text to Gemini", {
    length: text.length,
    preview: text.slice(0, 120)
  });

  let raw;
  try {
    const response = await model.generateContent([{ text }]);
    raw = response?.response?.text?.();
  } catch (err) {
    aiLogger.error("Gemini API call failed", { error: err.message });
    throw err;
  }

  if (!raw) {
    throw new Error("Gemini returned empty response");
  }

  let parsed;
  try {
    parsed = parseStructuredResponse(raw);
  } catch (err) {
    aiLogger.error("Gemini response parsing failed", { error: err.message, raw });
    throw err;
  }

  const analysis = validateAnalysis(parsed);
  aiLogger.info("Gemini analysis parsed", {
    threat: analysis.threat,
    threatType: analysis.threat_type,
    locations: analysis.locations,
    confidence: analysis.confidence
  });
  return analysis;
}

export function resetGeminiModelCache() {
  modelInstance = null;
  lastPromptSignature = null;
}
