// @steered SNARE-2 2026-09-29

import { formatClock, parseSearchIntent, refineSearchIntent } from "./intent.ts";
import type {
  Cabin,
  IntentInterpretation,
  SearchIntent,
  SearchLocation,
} from "./types.ts";

const MAX_MODEL_RESPONSE_BYTES = 64 * 1024;
const MODEL_TIMEOUT_MS = 30_000;
const SOURCE_CARRIERS: Record<string, string> = {
  american: "AA",
  united: "UA",
  delta: "DL",
  aeroplan: "AC",
  flyingblue: "AF",
  alaska: "AS",
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function safeBaseUrl(): string {
  const configured = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  const url = new URL(configured);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Ollama must use a loopback-only HTTP address.");
  }
  return url.toString().replace(/\/$/, "");
}

function stringArray(value: unknown, pattern: RegExp, max = 20): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => pattern.test(entry))
    ),
  ].slice(0, max);
  return entries.length > 0 ? entries : undefined;
}

function location(value: unknown, region: unknown): SearchLocation | undefined {
  const airports = stringArray(value, /^[A-Za-z]{3}$/, 8)?.map((entry) => entry.toUpperCase());
  if (airports?.length) {
    return { kind: "airports", values: airports, label: airports.join(", ") };
  }
  if (typeof region === "string" && /^(EU|AS|AF|SA|OC|NA)$/.test(region.toUpperCase())) {
    const code = region.toUpperCase();
    const labels: Record<string, string> = {
      EU: "Europe",
      AS: "Asia",
      AF: "Africa",
      SA: "South America",
      OC: "Oceania",
      NA: "North America",
    };
    return { kind: "continent", values: [code], label: labels[code] };
  }
  return undefined;
}

function date(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return undefined;
  return Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ? value : undefined;
}

function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

function cabins(value: unknown): Cabin[] | undefined {
  const parsed = stringArray(value, /^(economy|premium_economy|business|first)$/, 4);
  return parsed?.length ? (parsed as Cabin[]) : undefined;
}

function parseModelJson(value: string): UnknownRecord {
  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(withoutFence);
  const result = record(parsed);
  if (!result) throw new Error("Ollama returned an invalid search object.");
  return result;
}

function applyModelIntent(base: SearchIntent, model: UnknownRecord): SearchIntent {
  const origins = location(model.origins, undefined);
  const destinations = location(model.destinations, model.destinationRegion);
  const startDate = date(model.startDate);
  const endDate = date(model.endDate);
  const parsedCabins = cabins(model.cabins);
  const travelers = integer(model.travelers, 1, 9);
  const maxStops = integer(model.maxStops, 0, 3);
  const maxPoints = integer(model.maxPoints, 1, 10_000_000);
  const sources = stringArray(model.sources, /^[a-z][a-z0-9_-]{1,30}$/i)?.map((entry) =>
    entry.toLowerCase()
  );
  const carriers =
    stringArray(model.carriers, /^[A-Za-z0-9]{2,3}$/)?.map((entry) => entry.toUpperCase()) ??
    sources?.flatMap((source) => (SOURCE_CARRIERS[source] ? [SOURCE_CARRIERS[source]] : []));
  const departure = record(model.departureTime);
  const earliestMinutes = integer(departure?.earliestMinutes, 0, 1439);
  const latestMinutes = integer(departure?.latestMinutes, 0, 1439);
  const departureTime =
    earliestMinutes !== undefined &&
    latestMinutes !== undefined &&
    latestMinutes >= earliestMinutes
      ? {
          earliestMinutes,
          latestMinutes,
          label: `${formatClock(earliestMinutes)} to ${formatClock(latestMinutes)} local departure`,
        }
      : undefined;
  const tripType =
    model.tripType === "one_way" || model.tripType === "round_trip"
      ? model.tripType
      : undefined;

  return {
    ...base,
    origins: origins ?? base.origins,
    destinations: destinations ?? base.destinations,
    startDate: startDate ?? base.startDate,
    endDate: endDate ?? base.endDate,
    cabins: parsedCabins ?? base.cabins,
    travelers: travelers ?? base.travelers,
    maxStops: maxStops ?? base.maxStops,
    maxPoints: maxPoints ?? base.maxPoints,
    sources: sources ?? base.sources,
    carriers: carriers?.length ? [...new Set(carriers)].slice(0, 20) : base.carriers,
    departureTime: departureTime ?? base.departureTime,
    tripType: tripType ?? base.tripType,
  };
}

async function modelIntent(
  query: string,
  homeAirports: string[],
  base: SearchIntent,
  previous: SearchIntent | undefined,
  now: Date
): Promise<{ intent: SearchIntent; model: string }> {
  const model = process.env.RUFFI_FLIGHT_MODEL?.trim() || process.env.LOCAL_GMAIL_MODEL?.trim() || "qwen3:8b";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const response = await fetch(`${safeBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: "json",
        options: { temperature: 0, num_predict: 512 },
        messages: [
          {
            role: "system",
            content: [
              "Convert an award-flight request into one strict JSON object.",
              "Preserve the previous intent unless the new message changes a field.",
              "Use only airport IATA codes explicitly stated or clearly implied by a named city.",
              "Airline source ids are american, united, delta, aeroplan, flyingblue, and alaska.",
              "Use local departure clock minutes from midnight for time windows.",
              "Do not invent availability, prices, flight numbers, or credentials.",
              "Allowed fields: origins, destinations, destinationRegion, startDate, endDate, cabins, travelers, maxStops, maxPoints, sources, carriers, departureTime, tripType.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              currentDate: now.toISOString().slice(0, 10),
              homeAirports,
              previousIntent: previous ?? null,
              deterministicInterpretation: base,
              message: query,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_MODEL_RESPONSE_BYTES) {
      throw new Error("Ollama returned too much data.");
    }
    if (!response.ok) throw new Error("Ollama was unavailable.");
    const payload = record(JSON.parse(body));
    const message = record(payload?.message);
    if (typeof message?.content !== "string") throw new Error("Ollama returned no search content.");
    return { intent: applyModelIntent(base, parseModelJson(message.content)), model };
  } finally {
    clearTimeout(timeout);
  }
}

export async function interpretSearchIntent(
  query: string,
  homeAirports: string[],
  previous?: SearchIntent,
  now = new Date()
): Promise<{ intent: SearchIntent; interpretation: IntentInterpretation }> {
  const deterministic = previous
    ? refineSearchIntent(query, previous, homeAirports, now)
    : parseSearchIntent(query, homeAirports, now);

  try {
    const interpreted = await modelIntent(query, homeAirports, deterministic, previous, now);
    return {
      intent: interpreted.intent,
      interpretation: {
        engine: "ollama",
        model: interpreted.model,
        refinement: Boolean(previous),
        message: previous
          ? "Local Ollama refined the prior search, then Ruffi validated every field."
          : "Local Ollama structured the request, then Ruffi validated every field.",
      },
    };
  } catch {
    return {
      intent: deterministic,
      interpretation: {
        engine: "deterministic",
        refinement: Boolean(previous),
        message: previous
          ? "Ollama was unavailable, so Ruffi refined the prior search deterministically."
          : "Ollama was unavailable, so Ruffi used its deterministic flight parser.",
      },
    };
  }
}
