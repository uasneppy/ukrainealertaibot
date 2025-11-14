/**
 * Summary:
 * - Modules: channel-filter.js (normalizeChannelName, buildChannelMatcher)
 * - Behaviors: channel normalization and whitelist filtering for parser bridge.
 * - Run: npm test
 */

import { describe, it, expect, beforeEach } from "vitest";
import { normalizeChannelName, buildChannelMatcher } from "../channel-filter.js";

describe("normalizeChannelName", () => {
  it.each([
    ["deepstateua", "deepstateua"],
    ["@DeepStateUA", "deepstateua"],
    ["  @channel_name  ", "channel_name"],
    ["https://t.me/DeepStateUA", "deepstateua"],
    ["", null],
    [null, null],
    [undefined, null]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeChannelName(input)).toBe(expected);
  });
});

describe("buildChannelMatcher", () => {
  let matcher;

  beforeEach(() => {
    matcher = buildChannelMatcher(["@DeepStateUA", "air_alert_ua"]);
  });

  it("allows all channels when whitelist is empty", () => {
    const allowAll = buildChannelMatcher([]);
    expect(allowAll("anychannel"), "expected matcher to allow arbitrary channels").toBe(true);
  });

  it("matches normalized usernames", () => {
    expect(matcher("deepstateua"), "should match lowercase username").toBe(true);
    expect(matcher("@Air_Alert_UA"), "should ignore @ prefix and case").toBe(true);
  });

  it("rejects unknown channels", () => {
    expect(matcher("other_channel"), "should reject channels outside whitelist").toBe(false);
  });

  it("rejects empty channel names", () => {
    expect(matcher(""), "should reject empty identifiers").toBe(false);
  });

  it("matches urls in whitelist", () => {
    const urlMatcher = buildChannelMatcher(["https://t.me/deepstateua"]);
    expect(urlMatcher("@DeepStateUA"), "URL whitelists should be normalized").toBe(true);
  });
});
