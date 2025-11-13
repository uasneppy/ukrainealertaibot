import { GoogleGenerativeAI } from "@google/generative-ai";
import { ANALYST_PROMPT } from "./config.js";

const MODEL_NAME = "gemini-2.0-flash-exp";

let modelInstance = null;

function getModel() {
  if (!process.env.GEMINI_KEY) {
    throw new Error("GEMINI_KEY is not set. Please provide a valid Gemini API key.");
  }

  if (!modelInstance) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
    modelInstance = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: ANALYST_PROMPT
    });
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
    locations: Array.isArray(payload.locations) && payload.locations.length > 0 ? payload.locations.map((loc) => String(loc).trim()).filter(Boolean) : ["unknown"],
    summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
    timestamp: payload.timestamp ? String(payload.timestamp).trim() : null,
    confidence: typeof payload.confidence === "number" && payload.confidence >= 0 && payload.confidence <= 1 ? payload.confidence : 0
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

  const model = getModel();
  const response = await model.generateContent([{ text }]);
  const raw = response?.response?.text?.();

  if (!raw) {
    throw new Error("Gemini returned empty response");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Gemini response is not valid JSON: ${err.message}`);
  }

  return validateAnalysis(parsed);
}
