/**
 * Summary:
 * - Module: message-processor.js
 * - Behaviors: cache skips, missing text handling, relevant/global threat broadcasts, irrelevance filtering
 * - Run: npm test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("all-the-cities", () => ({ default: [] }));
import { createMessageProcessor } from "../message-processor.js";

const baseMessage = {
  channel: "source-channel",
  id: 42,
  text: "Test payload",
  date: 1234567890
};

function buildDeps(overrides = {}) {
  return {
    loadSettings: vi.fn(() => ({ regions: ["Kyiv"] })),
    analyzeMessage: vi.fn(async () => ({
      threat: true,
      threat_type: "drone",
      locations: ["Kyiv"],
      confidence: 0.9,
      summary: "Threat summary"
    })),
    hasRelevantLocation: vi.fn(() => true),
    isGlobalThreat: vi.fn(() => false),
    formatAlert: vi.fn(() => "alert-text"),
    computeKyivProximity: vi.fn(() => ({ closest: "Kyiv", distanceKm: 0 })),
    hasMessage: vi.fn(() => false),
    saveMessage: vi.fn(),
    buildContextualMessage: vi.fn(() => "context"),
    rememberChannelMessage: vi.fn(),
    ...overrides
  };
}

describe("message processor", () => {
  let broadcastAlert;

  beforeEach(() => {
    broadcastAlert = vi.fn(async () => undefined);
  });

  it("skips cached messages without triggering analysis", async () => {
    const deps = buildDeps({ hasMessage: vi.fn(() => true) });
    const processor = createMessageProcessor({ broadcastAlert, deps });

    await processor(baseMessage);

    expect(deps.analyzeMessage).not.toHaveBeenCalled();
    expect(deps.saveMessage).not.toHaveBeenCalled();
    expect(broadcastAlert).not.toHaveBeenCalled();
  });

  it("stores messages without text and aborts further processing", async () => {
    const deps = buildDeps({ hasMessage: vi.fn(() => false) });
    const processor = createMessageProcessor({ broadcastAlert, deps });
    const message = { ...baseMessage, id: 99, text: undefined };

    await processor(message);

    expect(deps.saveMessage).toHaveBeenCalledWith(
      `${message.channel}:${message.id}`,
      message.channel,
      message.date
    );
    expect(deps.analyzeMessage).not.toHaveBeenCalled();
    expect(broadcastAlert).not.toHaveBeenCalled();
  });

  it("broadcasts alerts immediately when threat is relevant", async () => {
    const deps = buildDeps();
    const processor = createMessageProcessor({ broadcastAlert, deps });

    await processor(baseMessage);

    expect(deps.buildContextualMessage).toHaveBeenCalledWith(
      baseMessage.channel,
      baseMessage.text,
      baseMessage.date
    );
    expect(deps.analyzeMessage).toHaveBeenCalledWith("context");
    expect(deps.formatAlert).toHaveBeenCalled();
    expect(broadcastAlert).toHaveBeenCalledWith("alert-text");
    expect(deps.saveMessage).toHaveBeenCalledWith(
      `${baseMessage.channel}:${baseMessage.id}`,
      baseMessage.channel,
      baseMessage.date
    );
  });

  it("suppresses broadcasts for irrelevant regional threats", async () => {
    const deps = buildDeps({
      hasRelevantLocation: vi.fn(() => false),
      isGlobalThreat: vi.fn(() => false)
    });
    const processor = createMessageProcessor({ broadcastAlert, deps });

    await processor(baseMessage);

    expect(broadcastAlert).not.toHaveBeenCalled();
    expect(deps.saveMessage).toHaveBeenCalled();
  });
});
