const GLOBAL_THREAT_KEYWORDS = [
  "стратегічна авіація",
  "стратегічної авіації",
  "міг-31",
  "миг-31",
  "ту-22",
  "ту-95",
  "ту-160",
  "кинджал",
  "брсд",
  "шахед",
  "шахеди",
  "шахід",
  "шахід",
  "крилатих ракет",
  "крилаті ракети",
  "пуск ракет",
  "пуски ракет",
  "пуск шахедів",
  "старт шахедів",
  "вихід флоту",
  "флот в море",
  "морська загроза"
];

function normalize(value) {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

export function hasRelevantLocation(locations = [], regions = []) {
  if (!Array.isArray(locations) || locations.length === 0) return false;
  const normalizedRegions = regions.map(normalize);

  return locations.some((location) => {
    const normalizedLocation = normalize(String(location));
    if (normalizedLocation === "unknown" || normalizedLocation.length === 0) {
      return false;
    }
    return normalizedRegions.some((region) =>
      normalizedLocation.includes(region) || region.includes(normalizedLocation)
    );
  });
}

export function isGlobalThreat(analysis) {
  if (!analysis) return false;
  const haystack = `${analysis.threat_type || ""} ${analysis.summary || ""}`.toLowerCase();
  return GLOBAL_THREAT_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function formatAlert({ threat_type, locations, summary, confidence }, message) {
  const regionText = locations && locations.length ? locations.join(", ") : "невідомо";
  const confidencePercent = Math.round((confidence ?? 0) * 100);
  const channel = message?.channel ? `@${message.channel}` : "невідомо";

  return [
    `🚨 Загроза: ${threat_type || "невідомо"}`,
    `Регіон: ${regionText}`,
    `Опис: ${summary}`,
    `Ймовірність: ${confidencePercent}%`,
    `Канал: ${channel}`
  ].join("\n");
}
