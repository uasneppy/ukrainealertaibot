/**
 * Summary:
 * - Modules: utils.js (hasRelevantLocation, isGlobalThreat, formatAlert)
 * - Behaviors: location filtering, global threat overrides, alert formatting.
 * - Run: npm test
 */

import { describe, it, expect } from "vitest";
import { hasRelevantLocation, isGlobalThreat, formatAlert } from "../utils.js";

const REGIONS = ["Київ", "Харківська область", "Львів"];

describe("hasRelevantLocation", () => {
  it.each([
    [["Київ"], true],
    [["м. Київ"], true],
    [["Харків"], true],
    [["unknown"], false],
    [["Одеса"], false],
    [[], false]
  ])("returns %s for %o", (locations, expected) => {
    expect(hasRelevantLocation(locations, REGIONS)).toBe(expected);
  });
});

describe("isGlobalThreat", () => {
  it("detects strategic aviation keywords", () => {
    expect(
      isGlobalThreat({
        threat_type: "активність стратегічна авіація",
        summary: ""
      })
    ).toBe(true);
  });

  it("returns false for routine updates", () => {
    expect(
      isGlobalThreat({
        threat_type: "обстріли",
        summary: "Ситуація спокійна"
      })
    ).toBe(false);
  });
});

describe("formatAlert", () => {
  it("builds structured alert text", () => {
    const text = formatAlert(
      {
        threat_type: "Дрони",
        locations: ["Харківська область"],
        summary: "Ворожі БПЛА рухаються до області.",
        confidence: 0.87
      },
      { channel: "testchannel" }
    );

    expect(text).toContain("🚨 Загроза: Дрони");
    expect(text).toContain("Регіон: Харківська область");
    expect(text).toContain("Ймовірність: 87%");
    expect(text).toContain("Канал: @testchannel");
  });
});
