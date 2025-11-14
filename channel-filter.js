export function normalizeChannelName(name) {
  if (name === null || name === undefined) {
    return null;
  }
  let trimmed = String(name).trim();
  if (!trimmed) {
    return null;
  }
  const telegramUrlMatch = trimmed.match(/^https?:\/\/t\.me\/(.+)$/i);
  if (telegramUrlMatch) {
    trimmed = telegramUrlMatch[1].split(/[/?]/, 1)[0];
  }
  trimmed = trimmed.replace(/^@+/, "");
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function buildChannelMatcher(channels = []) {
  const normalizedAllowed = new Set(
    (Array.isArray(channels) ? channels : [])
      .map(normalizeChannelName)
      .filter(Boolean)
  );

  return function isChannelAllowed(channelName) {
    if (normalizedAllowed.size === 0) {
      return true;
    }
    const normalizedIncoming = normalizeChannelName(channelName);
    if (!normalizedIncoming) {
      return false;
    }
    return normalizedAllowed.has(normalizedIncoming);
  };
}
