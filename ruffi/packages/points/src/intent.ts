// @steered SNARE-2 2026-09-29

import { type Cabin, type SearchIntent, type SearchLocation } from "./types.ts";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const MONTH_ALIASES = new Map<string, number>(
  MONTHS.flatMap((month, index) => [
    [month, index] as const,
    [month.slice(0, 3), index] as const,
  ])
);

const REGIONS = [
  { pattern: /\beurope\b/i, code: "EU", label: "Europe" },
  { pattern: /\basia\b/i, code: "AS", label: "Asia" },
  { pattern: /\bafrica\b/i, code: "AF", label: "Africa" },
  {
    pattern: /\b(?:south america|latin america)\b/i,
    code: "SA",
    label: "South America",
  },
  {
    pattern: /\b(?:australia|new zealand|oceania|south pacific)\b/i,
    code: "OC",
    label: "Oceania",
  },
  {
    pattern: /\b(?:north america|canada|mexico)\b/i,
    code: "NA",
    label: "North America",
  },
];

const CITIES = [
  { pattern: /\b(?:new york|nyc)\b/i, airports: ["JFK", "EWR", "LGA"], label: "New York" },
  { pattern: /\b(?:washington(?: dc)?|d\.c\.)\b/i, airports: ["IAD", "DCA", "BWI"], label: "Washington, DC" },
  { pattern: /\b(?:los angeles|lax)\b/i, airports: ["LAX"], label: "Los Angeles" },
  { pattern: /\b(?:orange county|santa ana|sna)\b/i, airports: ["SNA"], label: "Orange County" },
  { pattern: /\b(?:san francisco|bay area|sfo)\b/i, airports: ["SFO", "OAK", "SJC"], label: "San Francisco Bay Area" },
  { pattern: /\b(?:chicago|ord)\b/i, airports: ["ORD", "MDW"], label: "Chicago" },
  { pattern: /\b(?:boston|bos)\b/i, airports: ["BOS"], label: "Boston" },
  { pattern: /\b(?:miami|south florida|mia)\b/i, airports: ["MIA", "FLL", "PBI"], label: "South Florida" },
  { pattern: /\b(?:paris|cdg)\b/i, airports: ["CDG", "ORY"], label: "Paris" },
  { pattern: /\b(?:london|lhr)\b/i, airports: ["LHR", "LGW", "LCY"], label: "London" },
  { pattern: /\b(?:rome|fco)\b/i, airports: ["FCO"], label: "Rome" },
  { pattern: /\b(?:tokyo|hnd|nrt)\b/i, airports: ["HND", "NRT"], label: "Tokyo" },
];

const KNOWN_AIRPORTS = new Set(CITIES.flatMap(({ airports }) => airports));

const AIRLINE_FILTERS = [
  { pattern: /\b(?:american(?: airlines)?|aadvantage)\b/i, source: "american", carrier: "AA" },
  { pattern: /\b(?:united(?: airlines)?|mileageplus)\b/i, source: "united", carrier: "UA" },
  { pattern: /\b(?:delta(?: air lines)?|skymiles)\b/i, source: "delta", carrier: "DL" },
  { pattern: /\b(?:air canada|aeroplan)\b/i, source: "aeroplan", carrier: "AC" },
  { pattern: /\b(?:air france|klm|flying blue)\b/i, source: "flyingblue", carrier: "AF" },
  { pattern: /\b(?:alaska(?: airlines)?|mileage plan)\b/i, source: "alaska", carrier: "AS" },
] as const;

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDates(query: string, now: Date, fallback = true) {
  const range = query.match(
    /\b(20\d{2}-\d{2}-\d{2})\s+(?:to|through|-)\s+(20\d{2}-\d{2}-\d{2})\b/i
  );
  if (range) {
    return { startDate: range[1], endDate: range[2], assumption: "Used the exact date range in your request." };
  }

  if (!fallback) return undefined;

  const exact = query.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (exact) {
    return { startDate: exact[1], endDate: exact[1], assumption: "Used the exact departure date in your request." };
  }

  const monthMatch = query.match(
    new RegExp(`\\b(${[...MONTH_ALIASES.keys()].join("|")})\\b(?:\\s+(20\\d{2}))?`, "i")
  );
  if (monthMatch) {
    const month = MONTH_ALIASES.get(monthMatch[1].toLowerCase()) ?? 0;
    let year = monthMatch[2] ? Number(monthMatch[2]) : now.getUTCFullYear();
    if (!monthMatch[2] && month < now.getUTCMonth()) year += 1;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return {
      startDate: isoDate(year, month, 1),
      endDate: isoDate(year, month, lastDay),
      assumption: `Treated ${MONTHS[month]} as a flexible, full-month window.`,
    };
  }

  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() + 30);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    assumption: "No dates were found, so Ruffi used a window 30 to 60 days out.",
  };
}

function parseCabins(query: string): Cabin[] {
  const cabins: Cabin[] = [];
  if (/\bfirst(?: class)?\b/i.test(query)) cabins.push("first");
  if (/\bbusiness(?: class)?\b/i.test(query)) cabins.push("business");
  if (/\bpremium economy\b/i.test(query)) cabins.push("premium_economy");
  if (/\b(?:economy|coach)\b/i.test(query)) cabins.push("economy");
  return cabins.length > 0 ? cabins : ["economy"];
}

function parseTravelers(query: string): number {
  const numeric = query.match(/\b([1-9])\s+(?:people|passengers|travelers|travellers|seats|tickets)\b/i);
  if (numeric) return Number(numeric[1]);
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const word = query.match(/\b(one|two|three|four|five|six)(?:\s+[a-z]+){0,3}\s+(?:people|passengers|travelers|travellers|seats|tickets)\b/i);
  if (word) return words[word[1].toLowerCase()];
  if (/\b(?:my wife|my husband|my partner|jenna)\s+and\s+(?:me|i)\b/i.test(query)) return 2;
  return 1;
}

function parseMaxStops(query: string): number | undefined {
  if (/\b(?:nonstop|non-stop|direct)\b/i.test(query)) return 0;
  if (/\b(?:no more than|at most|max(?:imum)?)\s+(?:one|1)\s+stop\b/i.test(query)) return 1;
  return undefined;
}

function parseMaxPoints(query: string): number | undefined {
  const match = query.match(/\b(?:under|less than|max(?:imum)?|no more than)\s+([\d,]+)\s*(k)?\s*(?:points|miles)?\b/i);
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) ? value * (match[2] ? 1000 : 1) : undefined;
}

function parseAirlines(query: string): {
  sources?: string[];
  carriers?: string[];
} {
  const matched = AIRLINE_FILTERS.filter(({ pattern }) => pattern.test(query));
  if (matched.length === 0) return {};
  return {
    sources: [...new Set(matched.map(({ source }) => source))],
    carriers: [...new Set(matched.map(({ carrier }) => carrier))],
  };
}

function clockMinutes(hourText: string, minuteText: string | undefined, meridiem: string): number {
  let hour = Number(hourText) % 12;
  if (meridiem.toLowerCase() === "pm") hour += 12;
  return hour * 60 + Number(minuteText ?? 0);
}

function parseDepartureTime(query: string): SearchIntent["departureTime"] {
  const clock = "(1[0-2]|0?[1-9])(?::([0-5]\\d))?\\s*(am|pm)";
  const between = query.match(new RegExp(`\\bbetween\\s+${clock}\\s+(?:and|to|-)\\s+${clock}\\b`, "i"));
  const fromTo = query.match(
    new RegExp(`\\b(?:depart(?:ing|ure)?\\s+)?(?:from\\s+)?${clock}\\s+(?:to|through|-)\\s+${clock}\\b`, "i")
  );
  const afterBefore = query.match(
    new RegExp(
      `\\b(?:after|not before|no earlier than)\\s+${clock}.*?\\b(?:before|not later than|no later than|by)\\s+${clock}\\b`,
      "i"
    )
  );
  const match = between ?? fromTo ?? afterBefore;
  if (!match) return undefined;
  const earliestMinutes = clockMinutes(match[1], match[2], match[3]);
  const latestMinutes = clockMinutes(match[4], match[5], match[6]);
  if (latestMinutes < earliestMinutes) return undefined;
  return {
    earliestMinutes,
    latestMinutes,
    label: `${formatClock(earliestMinutes)} to ${formatClock(latestMinutes)} local departure`,
  };
}

export function formatClock(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;
}

function location(text: string, fallback: string[], allowRegion: boolean): SearchLocation {
  if (allowRegion) {
    const region = REGIONS.find(({ pattern }) => pattern.test(text));
    if (region) return { kind: "continent", values: [region.code], label: region.label };
  }
  const codes = [...text.matchAll(/\b([a-z]{3})\b/gi)]
    .filter((match) => match[1] === match[1].toUpperCase() || KNOWN_AIRPORTS.has(match[1].toUpperCase()))
    .map((match) => match[1].toUpperCase());
  if (codes.length > 0) {
    const unique = [...new Set(codes)].slice(0, 8);
    return { kind: "airports", values: unique, label: unique.join(", ") };
  }
  const city = CITIES.find(({ pattern }) => pattern.test(text));
  if (city) return { kind: "airports", values: city.airports, label: city.label };
  return { kind: "airports", values: fallback, label: fallback.join(", ") };
}

function explicitLocation(
  query: string,
  side: "origin" | "destination",
  fallback: string[]
): SearchLocation | undefined {
  const match =
    side === "origin"
      ? query.match(/\bfrom\s+(.+?)(?=\s+(?:to|into|for|during|in|on|with)\b|$)/i)
      : query.match(/\b(?:to|into)\s+(.+?)(?=\s+(?:from|for|during|in|on|with|depart|after|before)\b|$)/i);
  if (!match) return undefined;
  const parsed = location(match[1], fallback, side === "destination");
  return parsed.values.length > 0 ? parsed : undefined;
}

function queryHistory(previous: SearchIntent, query: string): string {
  const next = `${previous.rawQuery}\nFollow-up: ${query.trim()}`;
  return next.slice(-1000);
}

export function parseSearchIntent(
  rawQuery: string,
  homeAirports: string[],
  now = new Date()
): SearchIntent {
  const query = rawQuery.trim().slice(0, 500);
  if (query.length < 4) throw new Error("Describe where and when you want to go.");

  const homes = homeAirports
    .map((airport) => airport.trim().toUpperCase())
    .filter((airport) => /^[A-Z]{3}$/.test(airport))
    .slice(0, 8);
  if (homes.length === 0) throw new Error("Add at least one home airport before searching.");

  const origin = explicitLocation(query, "origin", homes);
  const destination = explicitLocation(query, "destination", []);
  const dates = parseDates(query, now)!;
  const airlines = parseAirlines(query);
  const origins = origin
    ? origin
    : { kind: "airports" as const, values: homes, label: homes.join(", ") };
  const destinations = destination ?? location(query, [], true);
  if (destinations.values.length === 0) {
    throw new Error("Use a destination city, airport code, or region such as Europe.");
  }

  return {
    rawQuery: query,
    origins,
    destinations,
    startDate: dates.startDate,
    endDate: dates.endDate,
    cabins: parseCabins(query),
    travelers: parseTravelers(query),
    maxStops: parseMaxStops(query),
    maxPoints: parseMaxPoints(query),
    sources: airlines.sources,
    carriers: airlines.carriers,
    departureTime: parseDepartureTime(query),
    tripType: /\b(?:round trip|roundtrip|return)\b/i.test(query) ? "round_trip" : "one_way",
    assumptions: [dates.assumption, ...(!origin ? [`Used your home airports: ${origins.label}.`] : [])],
  };
}

export function refineSearchIntent(
  rawQuery: string,
  previous: SearchIntent,
  homeAirports: string[],
  now = new Date()
): SearchIntent {
  const query = rawQuery.trim().slice(0, 500);
  if (query.length < 2) throw new Error("Describe what you want to change.");

  const homes = homeAirports
    .map((airport) => airport.trim().toUpperCase())
    .filter((airport) => /^[A-Z]{3}$/.test(airport))
    .slice(0, 8);
  const origin = explicitLocation(query, "origin", homes);
  const destination =
    explicitLocation(query, "destination", []) ??
    (/\bonly\b/i.test(query) ? location(query, [], true) : undefined);
  const dates = parseDates(query, now, false);
  const cabins = /\b(?:economy|coach|premium economy|business|first(?: class)?)\b/i.test(query)
    ? parseCabins(query)
    : previous.cabins;
  const airlines = parseAirlines(query);
  const timeWindow = parseDepartureTime(query);

  return {
    ...previous,
    rawQuery: queryHistory(previous, query),
    origins: origin ?? previous.origins,
    destinations:
      destination && destination.values.length > 0 ? destination : previous.destinations,
    startDate: dates?.startDate ?? previous.startDate,
    endDate: dates?.endDate ?? previous.endDate,
    cabins,
    travelers:
      /\b(?:people|passengers|travelers|travellers|seats|tickets)\b/i.test(query)
        ? parseTravelers(query)
        : previous.travelers,
    maxStops:
      /\b(?:nonstop|non-stop|direct|stop)\b/i.test(query)
        ? parseMaxStops(query)
        : previous.maxStops,
    maxPoints:
      /\b(?:points|miles)\b/i.test(query) ? parseMaxPoints(query) ?? previous.maxPoints : previous.maxPoints,
    sources: airlines.sources ?? previous.sources,
    carriers: airlines.carriers ?? previous.carriers,
    departureTime: timeWindow ?? previous.departureTime,
    tripType: /\b(?:round trip|roundtrip|return)\b/i.test(query)
      ? "round_trip"
      : /\b(?:one way|one-way)\b/i.test(query)
        ? "one_way"
        : previous.tripType,
    assumptions: [
      ...(dates ? [dates.assumption] : []),
      `Refined the previous search with: “${query}”`,
    ],
  };
}
