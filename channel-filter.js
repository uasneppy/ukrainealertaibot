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

function collectCandidates(source) {
  const candidates = [];

  const pushCandidate = (value) => {
    const normalized = normalizeChannelName(value);
    if (normalized) {
      candidates.push(normalized);
    }
  };

  if (source && typeof source === "object" && !Array.isArray(source)) {
    const { channel, channelId, channelUsername, channelCandidates } = source;
    pushCandidate(channel);
    pushCandidate(channelId);
    pushCandidate(channelUsername);
    if (Array.isArray(channelCandidates)) {
      for (const candidate of channelCandidates) {
        pushCandidate(candidate);
      }
    }
  } else if (Array.isArray(source)) {
    for (const value of source) {
      pushCandidate(value);
    }
  } else {
    pushCandidate(source);
  }

  return candidates;
}

export function buildChannelMatcher(channels = []) {
  const normalizedAllowed = new Set(
    (Array.isArray(channels) ? channels : [])
      .map(normalizeChannelName)
      .filter(Boolean)
  );

  return function isChannelAllowed(channelMetadata) {
    if (normalizedAllowed.size === 0) {
      return true;
    }
    const normalizedCandidates = collectCandidates(channelMetadata);
    if (normalizedCandidates.length === 0) {
      return false;
    }
    return normalizedCandidates.some((candidate) => normalizedAllowed.has(candidate));
  };
}
