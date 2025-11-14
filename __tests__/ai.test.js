/**
 * Summary:
 * - Modules: ai.js analyzeMessage helper.
 * - Behaviors: prompt wrapping, model caching, error handling, and JSON parsing validation.
 * - Run with `npm test`.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent
}));
const mockGoogleGenerativeAI = vi.fn(() => ({
  getGenerativeModel: mockGetGenerativeModel
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI
}));

const mockLoadSettings = vi.fn(() => ({ prompt: "Base prompt" }));
vi.mock("../config.js", async () => {
  const actual = await vi.importActual("../config.js");
  return {
    ...actual,
    loadSettings: mockLoadSettings
  };
});

const validGeminiResponse = {
  threat: true,
  threat_type: "missiles",
  locations: ["Kyiv"],
  summary: "Incoming missiles reported over Kyiv.",
  timestamp: "2024-01-01T00:00:00Z",
  confidence: 0.8
};

let analyzeMessage;
let resetGeminiModelCache;

beforeEach(async () => {
  vi.resetModules();
  mockGenerateContent.mockReset();
  mockGetGenerativeModel.mockClear();
  mockGoogleGenerativeAI.mockClear();
  mockLoadSettings.mockReset();
  mockLoadSettings.mockReturnValue({ prompt: "Base prompt" });
  process.env.GEMINI_KEY = "test-key";
  mockGenerateContent.mockResolvedValue({
    response: {
      text: () => JSON.stringify(validGeminiResponse)
    }
  });
  ({ analyzeMessage, resetGeminiModelCache } = await import("../ai.js"));
  resetGeminiModelCache();
});

afterEach(() => {
  delete process.env.GEMINI_KEY;
});

describe("analyzeMessage", () => {
  it("wraps the analyst prompt as a structured system instruction", async () => {
    const message = "Повітряна тривога в Києві";
    await analyzeMessage(message);

    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    const args = mockGetGenerativeModel.mock.calls[0][0];
    expect(args).toMatchObject({ model: "gemini-2.5-flash" });
    expect(args.systemInstruction).toEqual({
      role: "system",
      parts: [{ text: "Base prompt" }]
    });
    expect(mockGenerateContent).toHaveBeenCalledWith([{ text: message }]);
  });

  it("reuses the cached Gemini model when the prompt is unchanged", async () => {
    await analyzeMessage("Перша перевірка");
    await analyzeMessage("Друга перевірка");

    expect(mockGoogleGenerativeAI).toHaveBeenCalledTimes(1);
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("refreshes the Gemini model when the prompt changes", async () => {
    mockLoadSettings
      .mockReturnValueOnce({ prompt: "Base prompt" })
      .mockReturnValueOnce({ prompt: "Новий промпт" });

    await analyzeMessage("Перше повідомлення");
    await analyzeMessage("Друге повідомлення");

    expect(mockGoogleGenerativeAI).toHaveBeenCalledTimes(2);
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(2);
  });

  it("rejects empty message payloads", async () => {
    await expect(analyzeMessage("   ")).rejects.toThrow("Message text is empty");
    expect(mockGoogleGenerativeAI).not.toHaveBeenCalled();
  });

  it("reports invalid JSON responses from Gemini", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => "not json"
      }
    });

    await expect(analyzeMessage("Alert"))
      .rejects.toThrow(/Gemini response is not valid JSON/);
  });
});
