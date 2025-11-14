/**
 * Summary:
 * - Modules: utils.js (hasRelevantLocation, isGlobalThreat, computeKyivProximity, formatAlert)
 * - Behaviors: location filtering, global overrides, proximity math, alert formatting.
 * - Run: npm test
 */

import { describe, it, expect, vi } from "vitest";

const mockCities = vi.hoisted(() => [
  {
    country: "UA",
    name: "Kyiv",
    altName: "Київ,Kyiv City",
    loc: { coordinates: [30.5234, 50.4501] }
  },
  {
    country: "UA",
    name: "Brovary",
    altName: "Бровари",
    loc: { coordinates: [30.7909, 50.5119] }
  }
]);

vi.mock("all-the-cities", () => ({
  default: mockCities
}));
import {
  hasRelevantLocation,
  isGlobalThreat,
  formatAlert,
  computeKyivProximity,
  KYIV_WARNING_DISTANCE_KM
} from "../utils.js";

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

  it("appends Kyiv proximity details and warnings", () => {
    const text = formatAlert(
      {
        threat_type: "Ракети",
        locations: ["Київ"],
        summary: "Фіксуємо рух в бік столиці",
        confidence: 0.65
      },
      { channel: "alerts" },
      {
        distanceKm: 5.123,
        matchedLocation: "Kyiv",
        isCritical: true
      }
    );

    expect(text).toContain("Відстань до центру Києва: 5.1 км");
    expect(text).toContain("населений пункт: Kyiv");
    expect(text).toContain(`⚠️ Ціль ближче ніж ${KYIV_WARNING_DISTANCE_KM} км до Києва!`);
  });
});

describe("computeKyivProximity", () => {
  it("returns null when none of the locations can be resolved", () => {
    expect(computeKyivProximity(["невідомо"])).toBeNull();
  });

  it("detects settlements near Kyiv and remains non-critical above the threshold", () => {
    const proximity = computeKyivProximity(["Бровари"]);
    expect(proximity).not.toBeNull();
    expect(proximity?.matchedLocation).toBe("Brovary");
    expect(proximity?.distanceKm).toBeGreaterThan(KYIV_WARNING_DISTANCE_KM);
    expect(proximity?.isCritical).toBe(false);
  });

  it("raises the critical flag when the location is within the 10 km zone", () => {
    const proximity = computeKyivProximity(["Київ"]);
    expect(proximity).not.toBeNull();
    expect(proximity?.isCritical).toBe(true);
    expect(proximity?.distanceKm).toBeLessThanOrEqual(KYIV_WARNING_DISTANCE_KM);
  });
});
