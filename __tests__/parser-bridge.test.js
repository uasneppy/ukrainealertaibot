/**
 * Summary:
 * - Modules: parser.js (ParserBridge)
 * - Behaviors: parser bridge channel whitelisting and parser stdout handling.
 * - Run: npm test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { PassThrough } from "stream";

class MockProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stdin = { write: vi.fn(), end: vi.fn() };
    this.kill = vi.fn();
  }
}

const spawnMock = vi.fn();

vi.mock("child_process", () => ({
  spawn: spawnMock
}));

let ParserBridge;

async function loadModule() {
  ({ ParserBridge } = await import("../parser.js"));
}

function emitLine(process, payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ParserBridge", () => {
  let spawnedProcess;

  beforeEach(async () => {
    vi.resetModules();
    spawnedProcess = new MockProcess();
    spawnMock.mockReset();
    spawnMock.mockReturnValue(spawnedProcess);
    await loadModule();
  });

  it("forwards messages from allowed channels", async () => {
    const bridge = new ParserBridge(["deepstateua"]);
    const onMessage = vi.fn();
    bridge.on("message", onMessage);

    bridge.start();
    emitLine(spawnedProcess, {
      type: "message",
      data: { channel: "DeepStateUA", id: "1", text: "Payload" }
    });
    await flushAsync();

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({
      channel: "DeepStateUA",
      id: "1",
      text: "Payload"
    });
  });

  it("filters out messages from channels outside the whitelist", async () => {
    const bridge = new ParserBridge(["allowed_channel"]);
    const onMessage = vi.fn();
    bridge.on("message", onMessage);

    bridge.start();
    emitLine(spawnedProcess, {
      type: "message",
      data: { channel: "other_channel", id: "10", text: "Ignored" }
    });
    await flushAsync();

    expect(onMessage).not.toHaveBeenCalled();
  });
});
