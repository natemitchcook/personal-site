// @steered SNARE-2 2026-09-29

import { createHash } from "node:crypto";
import { bankProgramFromProviderName, pointProgramByProviderCode } from "../catalog.ts";
import type { AwardOffer, Cabin, SearchIntent, TransferOption } from "../types.ts";
import { getLocalCredential } from "./localCredentials.ts";
import { AwardProviderError, type AwardSearchProvider } from "./provider.ts";

const ENDPOINT = "https://ai-api.pointsyeah.com/explorer/search";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" ? (value as UnknownRecord) : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 500 ? value : undefined;
}

function httpsUrl(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cabin(value: unknown): Cabin | undefined {
  const normalized = text(value)?.toLowerCase();
  if (normalized === "premium") return "premium_economy";
  if (normalized === "economy" || normalized === "business" || normalized === "first") {
    return normalized;
  }
  return undefined;
}

function locationFilter(intent: SearchIntent, side: "origins" | "destinations") {
  const location = intent[side];
  return {
    airports: location.kind === "airports" ? location.values : [],
    countries: [],
    continents: location.kind === "continent" ? location.values : [],
    regions: [],
    states: [],
  };
}

function transfers(value: unknown): TransferOption[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((entry) => {
    const item = record(entry);
    const bankName = text(item?.bank) ?? text(item?.code);
    if (!bankName) return [];
    const program = bankProgramFromProviderName(bankName);
    return [{
      programId: program?.id ?? `provider:${bankName.toLowerCase().replaceAll(" ", "_")}`,
      programName: program?.shortName ?? bankName,
      bonusPercentage: Math.max(0, number(item?.bonus_percentage) ?? 0),
      sourceUrl: httpsUrl(item?.url),
    }];
  });
}

function normalize(entry: unknown): AwardOffer | undefined {
  const item = record(entry);
  const departure = record(item?.departure);
  const arrival = record(item?.arrival);
  const programCode = text(item?.program);
  const origin = text(departure?.code);
  const destination = text(arrival?.code);
  const departureDate = text(item?.departure_date);
  const points = number(item?.miles);
  const awardCabin = cabin(item?.cabin);
  if (!programCode || !origin || !destination || !departureDate || !points || !awardCabin) {
    return undefined;
  }

  const program = pointProgramByProviderCode(programCode);
  const signature = [programCode, origin, destination, departureDate, awardCabin, points, item?.tax].join(":");
  const updatedAt = number(item?.updated_at);
  return {
    id: `pointsyeah_${createHash("sha256").update(signature).digest("hex").slice(0, 20)}`,
    provider: "pointsyeah",
    live: true,
    loyaltyProgramCode: programCode,
    loyaltyProgramName: program?.name ?? programCode,
    origin,
    originCity: text(departure?.city),
    destination,
    destinationCity: text(arrival?.city),
    departureDate,
    cabin: awardCabin,
    pointsPerTraveler: Math.max(0, Math.round(points)),
    taxesPerTraveler: Math.max(0, number(item?.tax) ?? 0),
    taxesKnown: number(item?.tax) !== undefined,
    currency: "USD",
    seats: Math.max(1, Math.round(number(item?.seats) ?? 1)),
    stops: Math.max(0, Math.round(number(item?.stops) ?? 0)),
    durationMinutes: number(item?.duration),
    premiumCabinPercentage: number(item?.premium_cabin_percentage),
    lastSeenAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
    bookingUrl: httpsUrl(item?.detail_url),
    transferOptions: transfers(item?.transfer),
  };
}

export class PointsYeahProvider implements AwardSearchProvider {
  readonly id = "pointsyeah";
  readonly name = "PointsYeah";
  readonly live = true;

  async search(intent: SearchIntent) {
    const apiKey = await getLocalCredential("pointsyeah_api_key");
    if (!apiKey) {
      throw new AwardProviderError(
        "Add pointsyeah_api_key to the protected Ruffi credential file.",
        503
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          departure: locationFilter(intent, "origins"),
          arrival: locationFilter(intent, "destinations"),
          start_date: intent.startDate,
          end_date: intent.endDate,
          cabins: intent.cabins.map((value) => ({
            economy: "Economy",
            premium_economy: "Premium",
            business: "Business",
            first: "First",
          })[value]),
          sort: "miles",
          max_stops: intent.maxStops,
          max_miles: intent.maxPoints,
          min_premium_cabin_percentage: intent.cabins.some((value) => value === "business" || value === "first") ? 80 : undefined,
          pagination: { page: 1, page_size: 100 },
          collection: true,
          seats: intent.travelers,
          weekend_only: false,
        }),
        signal: controller.signal,
      });
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new AwardProviderError("The award provider returned too much data.");
      }
      if (!response.ok) {
        throw new AwardProviderError(`PointsYeah search failed with status ${response.status}.`, response.status);
      }
      const payload = record(JSON.parse(body));
      const offers = Array.isArray(payload?.results)
        ? payload.results.map(normalize).filter(Boolean) as AwardOffer[]
        : [];
      return {
        offers,
        provider: {
          id: this.id,
          name: this.name,
          live: true,
          message: "Live provider results. Verify availability in the loyalty program before transferring points.",
        },
      };
    } catch (error) {
      if (error instanceof AwardProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AwardProviderError("PointsYeah search timed out.", 504);
      }
      throw new AwardProviderError("PointsYeah could not be reached.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
