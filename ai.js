import { GoogleGenerativeAI } from "@google/generative-ai";
import { loadSettings } from "./config.js";
import logger from "./logger.js";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let modelInstance = null;
let lastPromptSignature = null;
const aiLogger = logger.child({ scope: "gemini" });

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

function validateAnalysis(payload) {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Gemini response is not a JSON object");
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
    parsed = JSON.parse(raw);
  } catch (err) {
    aiLogger.error("Gemini response is not valid JSON", { error: err.message, raw });
    throw new Error(`Gemini response is not valid JSON: ${err.message}`);
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
