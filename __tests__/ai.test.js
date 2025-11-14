/**
 * Summary:
 * - Modules: ai.js analyzeMessage helper.
 * - Behaviors: prompt wrapping, model caching, structured text parsing, and error handling.
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

const validGeminiResponse = `Загроза: так
Тип: missiles
Локації: Київ
Опис: Incoming missiles reported over Kyiv.
Час: 2024-01-01T00:00:00Z
Ймовірність: 80%`;

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
      text: () => validGeminiResponse
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

  it("parses structured Gemini responses into a normalized analysis", async () => {
    const analysis = await analyzeMessage("Alert text");

    expect(analysis).toEqual({
      threat: true,
      threat_type: "missiles",
      locations: ["Київ"],
      summary: "Incoming missiles reported over Kyiv.",
      timestamp: "2024-01-01T00:00:00Z",
      confidence: 0.8
    });
  });

  it("reports invalid structured responses from Gemini", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => "not json"
      }
    });

    await expect(analyzeMessage("Alert")).rejects.toThrow(/Gemini/);
  });

  it("supports percent-based confidence declarations", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => `Загроза: ні\nТип: unknown\nЛокації: невідомо\nОпис: Test\nЧас: невідомо\nЙмовірність: 25%`
      }
    });

    const analysis = await analyzeMessage("Alert");
    expect(analysis.confidence).toBeCloseTo(0.25);
    expect(analysis.threat).toBe(false);
  });
});
