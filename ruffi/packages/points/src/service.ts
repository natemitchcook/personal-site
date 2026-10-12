// @steered SNARE-2 2026-09-29

import { POINT_PROGRAMS } from "./catalog.ts";
import { CABINS } from "./types.ts";
import { CONNECTOR_STRATEGY, LOYALTY_CONNECTOR_PLAN } from "./coverage.ts";
import { applyPreferenceDecision } from "./decisioning.ts";
import { rankAwardOffers } from "./funding.ts";
import { parseSearchIntent } from "./intent.ts";
import { interpretSearchIntent } from "./ollamaIntent.ts";
import { configuredAwardProvider } from "./providers/index.ts";
import type {
  IntentInterpretation,
  SearchIntent,
  SearchLocation,
  SearchResult,
  Wallet,
} from "./types.ts";

function validDate(value: string): boolean {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

export function validateIntent(intent: SearchIntent): SearchIntent {
  if (!intent || typeof intent !== "object") throw new Error("A search intent is required.");
  const rawQuery =
    typeof intent.rawQuery === "string" ? intent.rawQuery.trim().slice(0, 1000) : "";
  if (rawQuery.length < 2) throw new Error("Describe where and when you want to go.");

  function validLocation(value: unknown): SearchLocation {
    if (!value || typeof value !== "object") throw new Error("Search locations are required.");
    const candidate = value as SearchLocation;
    const kind = candidate.kind;
    const max = kind === "continent" ? 1 : 8;
    const pattern = kind === "continent" ? /^(EU|AS|AF|SA|OC|NA)$/ : /^[A-Z]{3}$/;
    const values = Array.isArray(candidate.values)
      ? [
          ...new Set(
            candidate.values
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => entry.trim().toUpperCase())
              .filter((entry) => pattern.test(entry))
          ),
        ].slice(0, max)
      : [];
    if ((kind !== "airports" && kind !== "continent") || values.length === 0) {
      throw new Error("Use valid airport or region codes.");
    }
    const label =
      typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label.trim().slice(0, 100)
        : values.join(", ");
    return { kind, values, label };
  }

  const origins = validLocation(intent.origins);
  const destinations = validLocation(intent.destinations);
  const cabins = Array.isArray(intent.cabins)
    ? [...new Set(intent.cabins.filter((entry) => CABINS.includes(entry)))].slice(0, 4)
    : [];
  if (cabins.length === 0) throw new Error("Select at least one cabin.");

  if (!validDate(intent.startDate) || !validDate(intent.endDate)) {
    throw new Error("Search dates must use YYYY-MM-DD.");
  }
  if (Date.parse(intent.endDate) < Date.parse(intent.startDate)) {
    throw new Error("The end date must be on or after the start date.");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (intent.endDate < today) {
    throw new Error("The requested departure window is in the past.");
  }
  const days = (Date.parse(intent.endDate) - Date.parse(intent.startDate)) / 86_400_000;
  if (days > 61) {
    throw new Error("Search windows are limited to 62 days. Create multiple watches for longer periods.");
  }
  if (intent.travelers < 1 || intent.travelers > 9) {
    throw new Error("Travelers must be between 1 and 9.");
  }
  if (!Number.isSafeInteger(intent.travelers)) {
    throw new Error("Travelers must be a whole number.");
  }
  const maxStops =
    intent.maxStops === undefined
      ? undefined
      : Number.isSafeInteger(intent.maxStops) && intent.maxStops >= 0 && intent.maxStops <= 3
        ? intent.maxStops
        : undefined;
  if (intent.maxStops !== undefined && maxStops === undefined) {
    throw new Error("Maximum stops must be between 0 and 3.");
  }
  const maxPoints =
    intent.maxPoints === undefined
      ? undefined
      : Number.isSafeInteger(intent.maxPoints) && intent.maxPoints > 0 && intent.maxPoints <= 10_000_000
        ? intent.maxPoints
        : undefined;
  if (intent.maxPoints !== undefined && maxPoints === undefined) {
    throw new Error("Maximum points must be a positive whole number.");
  }
  const sources = Array.isArray(intent.sources)
    ? [
        ...new Set(
          intent.sources
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim().toLowerCase())
            .filter((entry) => /^[a-z][a-z0-9_-]{1,30}$/.test(entry))
        ),
      ].slice(0, 20)
    : undefined;
  const carriers = Array.isArray(intent.carriers)
    ? [
        ...new Set(
          intent.carriers
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim().toUpperCase())
            .filter((entry) => /^[A-Z0-9]{2,3}$/.test(entry))
        ),
      ].slice(0, 20)
    : undefined;
  const departureTime = intent.departureTime;
  if (
    departureTime &&
    (!Number.isSafeInteger(departureTime.earliestMinutes) ||
      !Number.isSafeInteger(departureTime.latestMinutes) ||
      departureTime.earliestMinutes < 0 ||
      departureTime.latestMinutes > 1439 ||
      departureTime.latestMinutes < departureTime.earliestMinutes)
  ) {
    throw new Error("Departure times must be a valid local-time window.");
  }
  const assumptions = Array.isArray(intent.assumptions)
    ? intent.assumptions
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    rawQuery,
    origins,
    destinations,
    startDate: intent.startDate,
    endDate: intent.endDate,
    cabins,
    travelers: intent.travelers,
    maxStops,
    maxPoints,
    sources: sources?.length ? sources : undefined,
    carriers: carriers?.length ? carriers : undefined,
    departureTime: departureTime
      ? {
          earliestMinutes: departureTime.earliestMinutes,
          latestMinutes: departureTime.latestMinutes,
          label:
            typeof departureTime.label === "string"
              ? departureTime.label.trim().slice(0, 100)
              : "Requested local departure window",
        }
      : undefined,
    tripType: intent.tripType === "round_trip" ? "round_trip" : "one_way",
    assumptions,
  };
}

export function parseNaturalLanguageSearch(query: string, homeAirports: string[], now?: Date) {
  return validateIntent(parseSearchIntent(query, homeAirports, now));
}

export async function interpretNaturalLanguageSearch(
  query: string,
  homeAirports: string[],
  previousIntent?: SearchIntent,
  now?: Date
) {
  const previous = previousIntent ? validateIntent(previousIntent) : undefined;
  const interpreted = await interpretSearchIntent(query, homeAirports, previous, now);
  return {
    intent: validateIntent(interpreted.intent),
    interpretation: interpreted.interpretation,
  };
}

function localDepartureMinutes(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const iso = value.match(/T(\d{2}):(\d{2})/);
  if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
  const clock = value.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(AM|PM)\b/i);
  if (!clock) return undefined;
  let hour = Number(clock[1]) % 12;
  if (clock[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(clock[2] ?? 0);
}

export async function searchAwards(
  intent: SearchIntent,
  wallet: Wallet,
  preferenceNotes = "",
  interpretation?: IntentInterpretation
): Promise<SearchResult> {
  const safeIntent = validateIntent(intent);
  const provider = configuredAwardProvider();
  const result = await provider.search(safeIntent);
  const filtered = result.offers.filter((offer) => {
    if (offer.seatCountKnown !== false && offer.seats < safeIntent.travelers) return false;
    if (safeIntent.maxStops !== undefined && offer.stops > safeIntent.maxStops) return false;
    if (safeIntent.maxPoints !== undefined && offer.pointsPerTraveler > safeIntent.maxPoints) return false;
    if (safeIntent.carriers?.length) {
      const actual = new Set([
        ...(offer.carriers ?? []),
        ...offer.flightNumbers?.map((flight) => flight.match(/^[A-Z0-9]{2,3}/)?.[0]).filter(Boolean) ?? [],
        offer.loyaltyProgramCode,
      ]);
      if (!safeIntent.carriers.some((carrier) => actual.has(carrier))) return false;
    }
    if (safeIntent.departureTime) {
      const minutes = localDepartureMinutes(offer.departureTime);
      if (
        minutes === undefined ||
        minutes < safeIntent.departureTime.earliestMinutes ||
        minutes > safeIntent.departureTime.latestMinutes
      ) {
        return false;
      }
    }
    return offer.departureDate >= safeIntent.startDate && offer.departureDate <= safeIntent.endDate;
  });
  const ranked = rankAwardOffers(filtered, safeIntent.travelers, wallet.balances).slice(0, 100);
  const decided = await applyPreferenceDecision(ranked, safeIntent, preferenceNotes);
  return {
    intent: safeIntent,
    offers: decided.offers,
    decisioning: decided.decisioning,
    provider: result.provider,
    searchedAt: new Date().toISOString(),
    interpretation,
  };
}

export async function searchNaturalLanguage(
  query: string,
  wallet: Wallet,
  preferenceNotes = "",
  now?: Date,
  previousIntent?: SearchIntent
) {
  const interpreted = await interpretNaturalLanguageSearch(
    query,
    wallet.homeAirports,
    previousIntent,
    now
  );
  return searchAwards(
    interpreted.intent,
    wallet,
    preferenceNotes,
    interpreted.interpretation
  );
}

export function getPointsPlatformCatalog() {
  return {
    programs: POINT_PROGRAMS,
    connectorPlan: LOYALTY_CONNECTOR_PLAN,
    strategy: CONNECTOR_STRATEGY,
  };
}

export function offerFingerprint(offer: SearchResult["offers"][number]): string {
  return [
    offer.loyaltyProgramCode,
    offer.origin,
    offer.destination,
    offer.departureDate,
    offer.cabin,
    offer.stops,
  ].join(":");
}
