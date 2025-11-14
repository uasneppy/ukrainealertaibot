import { loadSettings } from "./config.js";
import { analyzeMessage } from "./ai.js";
import {
  hasRelevantLocation,
  isGlobalThreat,
  formatAlert,
  computeKyivProximity
} from "./utils.js";
import { hasMessage, saveMessage } from "./db.js";
import { buildContextualMessage, rememberChannelMessage } from "./context-store.js";
import logger from "./logger.js";

const defaultDeps = {
  loadSettings,
  analyzeMessage,
  hasRelevantLocation,
  isGlobalThreat,
  formatAlert,
  computeKyivProximity,
  hasMessage,
  saveMessage,
  buildContextualMessage,
  rememberChannelMessage
};

export function createMessageProcessor({ broadcastAlert, logger: parentLogger = logger, deps = {} } = {}) {
  if (typeof broadcastAlert !== "function") {
    throw new Error("broadcastAlert function is required");
  }

  const messageLogger = parentLogger.child({ scope: "messages" });
  const runtimeDeps = { ...defaultDeps, ...deps };

  return async function processMessage(message) {
    if (!message) {
      messageLogger.warn("Received empty message payload");
      return;
    }

    const {
      loadSettings: load,
      analyzeMessage: analyze,
      hasRelevantLocation: hasLocation,
      isGlobalThreat: isGlobal,
      formatAlert: format,
      computeKyivProximity: kyivDistance,
      hasMessage: isCached,
      saveMessage: persist,
      buildContextualMessage: contextualize,
      rememberChannelMessage: remember
    } = runtimeDeps;

    const messageKey = `${message.channel}:${message.id}`;

    try {
      if (isCached(messageKey)) {
        messageLogger.debug("Skipping cached message", { messageKey });
        return;
      }

      if (!message.text) {
        messageLogger.warn("Incoming message without text", { messageKey });
        persist(messageKey, message.channel, message.date);
        return;
      }

      const { regions } = load();
      const contextualizedText = contextualize(message.channel, message.text, message.date);
      const analysis = await analyze(contextualizedText);
      remember(message.channel, message.text, message.date);

      messageLogger.info("Analysis result", {
        messageKey,
        threat: analysis.threat,
        threatType: analysis.threat_type,
        locations: analysis.locations,
        confidence: analysis.confidence,
        summary: analysis.summary
      });

      if (analysis.threat) {
        const relevantLocation = hasLocation(analysis.locations, regions);
        const globalThreat = isGlobal(analysis);

        if (globalThreat || relevantLocation) {
          const kyivProximity = kyivDistance(analysis.locations);
          const alert = format(analysis, message, kyivProximity);
          messageLogger.info("Broadcasting alert", {
            messageKey,
            relevantLocation,
            globalThreat,
            locations: analysis.locations,
            threatType: analysis.threat_type,
            summary: analysis.summary
          });
          await broadcastAlert(alert);
        } else {
          messageLogger.debug("Threat not relevant for configured regions", {
            messageKey,
            locations: analysis.locations,
            regions: regions.length,
            summary: analysis.summary
          });
        }
      }

      persist(messageKey, message.channel, message.date);
    } catch (err) {
      messageLogger.error("Failed to process message", { messageKey, error: err.message });
    }
  };
}
