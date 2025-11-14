import cities from "all-the-cities";

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

const KYIV_COORDINATES = { lat: 50.4501, lon: 30.5234 };
export const KYIV_WARNING_DISTANCE_KM = 10;
const EARTH_RADIUS_KM = 6371;
const LOCATION_STOP_WORDS = [
  "область",
  "обл",
  "район",
  "р-н",
  "громада",
  "місто",
  "город",
  "city",
  "м.",
  "мiсто",
  "смт"
];

const TRANSLITERATION_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  ы: "y",
  э: "e",
  ъ: "",
  '"': "",
  "'": "",
  "’": "",
  ё: "yo"
};

const SPECIAL_TRANSLITERATION = {
  є: { start: "ye", other: "ie" },
  ї: { start: "yi", other: "i" },
  й: { start: "y", other: "i" },
  ю: { start: "yu", other: "iu" },
  я: { start: "ya", other: "ia" }
};

const kyivLocationIndex = buildKyivLocationIndex();

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

function buildKyivLocationIndex() {
  const index = new Map();
  for (const city of cities) {
    if (city.country !== "UA") continue;
    const lat = city?.loc?.coordinates?.[1];
    const lon = city?.loc?.coordinates?.[0];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const names = [city.name];
    if (city.altName) {
      names.push(...city.altName.split(","));
    }
    for (const rawName of names) {
      const normalized = normalize(rawName);
      if (!normalized) continue;
      if (!index.has(normalized)) {
        index.set(normalized, {
          lat,
          lon,
          canonicalName: city.name
        });
      }
    }
  }
  return index;
}

function sanitizeLocation(value) {
  const normalized = normalize(value);
  if (!normalized || normalized === "unknown" || normalized === "невідомо") {
    return "";
  }

  let result = normalized;
  for (const word of LOCATION_STOP_WORDS) {
    const pattern = new RegExp(`\\b${word.replace(/\./g, "\\.")}\\b`, "g");
    result = result.replace(pattern, "");
  }
  return result.replace(/\s+/g, " ").trim();
}

function transliterate(value) {
  let result = "";
  let atWordStart = true;
  for (const char of value) {
    if (char === " " || char === "-") {
      result += char;
      atWordStart = true;
      continue;
    }
    if (char === "'" || char === "\"" || char === "’" || char === "`") {
      atWordStart = true;
      continue;
    }
    const special = SPECIAL_TRANSLITERATION[char];
    if (special) {
      result += atWordStart ? special.start : special.other;
    } else {
      result += TRANSLITERATION_MAP[char] ?? char;
    }
    atWordStart = false;
  }
  return result;
}

function findLocationMatch(candidate) {
  if (!candidate) {
    return null;
  }
  return kyivLocationIndex.get(candidate) || null;
}

function findMatchByTokens(value) {
  const tokens = value.split(/\s+/).filter(Boolean);
  for (let length = tokens.length; length > 0; length -= 1) {
    const candidate = tokens.slice(tokens.length - length).join(" ");
    const match = findLocationMatch(candidate);
    if (match) {
      return match;
    }
  }

  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const match = findLocationMatch(tokens[i]);
    if (match) {
      return match;
    }
  }
  return null;
}

function lookupCoordinates(location) {
  const sanitized = sanitizeLocation(location);
  if (!sanitized) {
    return null;
  }

  const transliterated = transliterate(sanitized);

  return (
    findLocationMatch(sanitized) ||
    findLocationMatch(transliterated) ||
    findMatchByTokens(sanitized) ||
    findMatchByTokens(transliterated)
  );
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(coordA, coordB) {
  const lat1 = toRadians(coordA.lat);
  const lat2 = toRadians(coordB.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(coordB.lon - coordA.lon);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
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

export function computeKyivProximity(locations = []) {
  if (!Array.isArray(locations) || locations.length === 0) {
    return null;
  }

  let closest = null;
  for (const location of locations) {
    const coordinates = lookupCoordinates(location);
    if (!coordinates) continue;
    const distanceKm = haversineDistanceKm(coordinates, KYIV_COORDINATES);
    if (!closest || distanceKm < closest.distanceKm) {
      closest = {
        distanceKm,
        matchedLocation: coordinates.canonicalName,
        originalQuery: String(location).trim(),
        isCritical: distanceKm <= KYIV_WARNING_DISTANCE_KM
      };
    }
  }

  return closest;
}

export function formatAlert({ threat_type, locations, summary, confidence }, message, kyivProximity) {
  const regionText = locations && locations.length ? locations.join(", ") : "невідомо";
  const confidencePercent = Math.round((confidence ?? 0) * 100);
  const channel = message?.channel ? `@${message.channel}` : "невідомо";
  const lines = [
    `🚨 Загроза: ${threat_type || "невідомо"}`,
    `Регіон: ${regionText}`,
    `Опис: ${summary}`,
    `Ймовірність: ${confidencePercent}%`,
    `Канал: ${channel}`
  ];

  if (kyivProximity) {
    lines.push(
      `Відстань до центру Києва: ${kyivProximity.distanceKm.toFixed(1)} км (населений пункт: ${
        kyivProximity.matchedLocation
      })`
    );
    if (kyivProximity.isCritical) {
      lines.push(`⚠️ Ціль ближче ніж ${KYIV_WARNING_DISTANCE_KM} км до Києва!`);
    }
  }

  return lines.join("\n");
}
