/**
 * Summary:
 * - Modules: context-store.js (buildContextualMessage, rememberChannelMessage).
 * - Behaviors: contextual text formatting, history retention, TTL pruning.
 * - Run: npm test
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildContextualMessage,
  rememberChannelMessage,
  resetContextStore,
  getChannelHistorySnapshot
} from "../context-store.js";

describe("context-store", () => {
  beforeEach(() => {
    resetContextStore();
  });

  it("returns original text when no history exists", () => {
    const now = Date.now() / 1000;
    const text = buildContextualMessage("test-channel", "Новий текст", now);
    expect(text).toBe("Новий текст");
  });

  it("includes up to five recent entries in the context block", () => {
    const base = Date.now() / 1000;
    for (let i = 1; i <= 6; i += 1) {
      rememberChannelMessage("test-channel", `Msg ${i}`, base + i);
    }

    const contextual = buildContextualMessage("test-channel", "Актуальне повідомлення", base + 10);
    expect(contextual).toContain("Контекст попередніх повідомлень каналу:");
    expect(contextual).toContain("(1) Msg 2");
    expect(contextual).not.toContain("Msg 1");
    expect(contextual).toContain("(5) Msg 6");
    expect(contextual).toMatch(/Нове повідомлення:\nАктуальне повідомлення$/);
  });

  it("drops stale entries that exceeded the TTL", () => {
    const now = Date.now();
    rememberChannelMessage("test-channel", "Старий контекст", now - 20 * 60 * 1000);
    rememberChannelMessage("test-channel", "Актуальний контекст", now);

    const contextual = buildContextualMessage("test-channel", "Черговий апдейт", now / 1000);
    expect(contextual).toContain("Актуальний контекст");
    expect(contextual).not.toContain("Старий контекст");

    const snapshot = getChannelHistorySnapshot("test-channel");
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].text).toBe("Актуальний контекст");
  });
});
