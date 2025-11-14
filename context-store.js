const CONTEXT_HISTORY_LIMIT = 5;
const CONTEXT_TTL_MS = 15 * 60 * 1000;
const channelHistory = new Map();

function toTimestampMs(source) {
  if (typeof source === "number" && Number.isFinite(source)) {
    if (source > 1e12) {
      return source;
    }
    return source * 1000;
  }
  return Date.now();
}

function purgeHistory(channel, nowMs) {
  const history = channelHistory.get(channel);
  if (!history || history.length === 0) {
    return [];
  }

  const filtered = history.filter((entry) => nowMs - entry.timestamp <= CONTEXT_TTL_MS);
  if (filtered.length === 0) {
    channelHistory.delete(channel);
    return [];
  }
  channelHistory.set(channel, filtered);
  return filtered;
}

export function buildContextualMessage(channel, text, messageDateSeconds) {
  if (!text || !text.trim() || !channel) {
    return text;
  }

  const now = toTimestampMs(messageDateSeconds);
  const history = purgeHistory(channel, now);
  if (history.length === 0) {
    return text;
  }

  const recentEntries = history.slice(-CONTEXT_HISTORY_LIMIT);
  const contextLines = recentEntries.map((entry, index) => `(${index + 1}) ${entry.text}`);

  return [
    "Контекст попередніх повідомлень каналу:",
    ...contextLines,
    "",
    "Нове повідомлення:",
    text
  ].join("\n");
}

export function rememberChannelMessage(channel, text, messageDateSeconds) {
  if (!channel || !text || !text.trim()) {
    return;
  }

  const timestamp = toTimestampMs(messageDateSeconds);
  const history = purgeHistory(channel, timestamp);
  const nextHistory = history.slice();
  nextHistory.push({ text: text.trim(), timestamp });
  while (nextHistory.length > CONTEXT_HISTORY_LIMIT) {
    nextHistory.shift();
  }
  channelHistory.set(channel, nextHistory);
}

export function resetContextStore() {
  channelHistory.clear();
}

export function getChannelHistorySnapshot(channel) {
  return channelHistory.get(channel)?.slice() || [];
}
