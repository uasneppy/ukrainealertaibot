/**
 * Summary:
 * - Modules: config.js dynamic settings store.
 * - Behaviors: default bootstrap, prompt/region mutations, OTP persistence.
 * - Run: npm test
 */

import fs from "fs";
import path from "path";
import { beforeEach, afterAll, describe, it, expect } from "vitest";

const TEST_DATA_DIR = path.join(process.cwd(), "tmp-config-store");
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.SETTINGS_PATH = path.join(TEST_DATA_DIR, "settings.json");
process.env.OTP_PATH = path.join(TEST_DATA_DIR, "otp.json");

const configModule = await import("../config.js");
const { loadSettings, addRegion, removeRegion, setPrompt, setPhoneNumber, recordOtp, OTP_PATH } = configModule;

function resetStore() {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  loadSettings();
}

beforeEach(() => {
  resetStore();
});

afterAll(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("config store", () => {
  it("bootstraps defaults when files are missing", () => {
    const settings = loadSettings();
    expect(settings.prompt.length).toBeGreaterThan(10);
    expect(settings.regions.length).toBeGreaterThan(0);
    expect(settings.channels.length).toBeGreaterThan(0);
  });

  it("adds and removes regions deterministically", () => {
    addRegion("Черкаси");
    let settings = loadSettings();
    expect(settings.regions).toContain("Черкаси");

    removeRegion("Черкаси");
    settings = loadSettings();
    expect(settings.regions).not.toContain("Черкаси");
  });

  it("updates prompt and phone number", () => {
    setPrompt("Test prompt");
    setPhoneNumber("+380123456789");
    const settings = loadSettings();
    expect(settings.prompt).toBe("Test prompt");
    expect(settings.phoneNumber).toBe("+380123456789");
  });

  it("persists otp values for parser consumption", () => {
    recordOtp("12345");
    const otpFile = JSON.parse(fs.readFileSync(OTP_PATH, "utf-8"));
    expect(otpFile.otp).toBe("12345");
  });
});
