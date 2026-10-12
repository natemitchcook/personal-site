// @steered SNARE-2 2026-09-29

import { createHash } from "node:crypto";
import type {
  AwardOffer,
  Cabin,
  SearchIntent,
  TransferOption,
} from "../types.ts";
import { getLocalCredential } from "./localCredentials.ts";
import { AwardProviderError, type AwardSearchProvider } from "./provider.ts";

const ENDPOINT = "https://seats.aero/partnerapi/search";
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const REGION_AIRPORTS: Record<string, string[]> = {
  EU: ["CDG", "LHR", "FCO", "AMS", "MAD", "ATH"],
  AS: ["HND", "NRT", "SIN", "ICN", "BKK", "HKG"],
  AF: ["CPT", "JNB", "NBO", "CAI"],
  SA: ["GRU", "EZE", "SCL", "LIM"],
  OC: ["SYD", "MEL", "AKL", "BNE"],
  NA: ["YVR", "YYZ", "MEX", "CUN"],
};

const CABIN_FIELDS: Record<
  Cabin,
  { query: string; available: string; mileage: string; seats: string; direct: string; airlines: string }
> = {
  economy: {
    query: "economy",
    available: "YAvailable",
    mileage: "YMileage",
    seats: "YRemainingSeats",
    direct: "YDirect",
    airlines: "YAirlines",
  },
  premium_economy: {
    query: "premium_economy",
    available: "WAvailable",
    mileage: "WMileage",
    seats: "WRemainingSeats",
    direct: "WDirect",
    airlines: "WAirlines",
  },
  business: {
    query: "business",
    available: "JAvailable",
    mileage: "JMileage",
    seats: "JRemainingSeats",
    direct: "JDirect",
    airlines: "JAirlines",
  },
  first: {
    query: "first",
    available: "FAvailable",
    mileage: "FMileage",
    seats: "FRemainingSeats",
    direct: "FDirect",
    airlines: "FAirlines",
  },
};

const SOURCE_PROGRAMS: Record<string, { code: string; name: string; transfers: TransferOption[] }> = {
  american: { code: "AA", name: "American AAdvantage", transfers: [] },
  united: { code: "UA", name: "United MileagePlus", transfers: [] },
  delta: { code: "DL", name: "Delta SkyMiles", transfers: [] },
  aeroplan: { code: "AC", name: "Air Canada Aeroplan", transfers: [] },
  flyingblue: { code: "AF", name: "Air France-KLM Flying Blue", transfers: [] },
  alaska: { code: "AS", name: "Alaska Mileage Plan", transfers: [] },
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function field(item: UnknownRecord | undefined, names: string[]): unknown {
  if (!item) return undefined;
  for (const name of names) {
    if (item[name] !== undefined) return item[name];
  }
  const lowered = new Map(Object.entries(item).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    const value = lowered.get(name.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function text(value: unknown, max = 500): string | undefined {
  return typeof value === "string" && value.length <= max ? value.trim() || undefined : undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function boolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return undefined;
}

function strings(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/)
      : [];
  return [
    ...new Set(
      values
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && entry.length <= 40)
    ),
  ].slice(0, 20);
}

function cabinFromValue(value: unknown): Cabin | undefined {
  const normalized = text(value)?.toUpperCase();
  if (normalized === "Y" || normalized === "ECONOMY") return "economy";
  if (normalized === "W" || normalized === "PREMIUM_ECONOMY" || normalized === "PREMIUM ECONOMY") {
    return "premium_economy";
  }
  if (normalized === "J" || normalized === "BUSINESS") return "business";
  if (normalized === "F" || normalized === "FIRST") return "first";
  return undefined;
}

function sourceProgram(value: unknown) {
  const source = text(value)?.toLowerCase() || "unknown";
  return {
    source,
    ...(SOURCE_PROGRAMS[source] ?? {
      code: source.toUpperCase().slice(0, 12),
      name: source === "unknown" ? "Unknown mileage program" : source,
      transfers: [],
    }),
  };
}

function availabilitySource(
  availability: UnknownRecord,
  route: UnknownRecord | undefined
): string | undefined {
  return (
    text(field(availability, ["Source", "source"])) ??
    text(field(route, ["Source", "source"]))
  )?.toLowerCase();
}

function remainingSeats(source: string, value: unknown): { seats: number; known: boolean } {
  const parsed = number(value);
  if (parsed === undefined || parsed < 0 || (source === "american" && parsed === 0)) {
    return { seats: 0, known: false };
  }
  return { seats: Math.round(parsed), known: true };
}

function isoDate(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  const match = candidate.match(/^20\d{2}-\d{2}-\d{2}/);
  return match?.[0];
}

function stableId(parts: unknown[]): string {
  return `seats_aero_${createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 24)}`;
}

function normalizeTrip(
  availability: UnknownRecord,
  trip: UnknownRecord,
  requestedCabins: Cabin[]
): AwardOffer | undefined {
  const route = record(field(availability, ["Route", "route"]));
  const program = sourceProgram(availabilitySource(availability, route));
  const cabin = cabinFromValue(field(trip, ["Cabin", "cabin"]));
  if (!cabin || !requestedCabins.includes(cabin)) return undefined;
  const origin =
    text(field(trip, ["OriginAirport", "origin_airport", "Origin"])) ??
    text(field(route, ["OriginAirport", "origin_airport", "Origin"]));
  const destination =
    text(field(trip, ["DestinationAirport", "destination_airport", "Destination"])) ??
    text(field(route, ["DestinationAirport", "destination_airport", "Destination"]));
  const departureTime = text(
    field(trip, ["DepartsAt", "DepartureTime", "departure_time", "DepartureAt"])
  );
  const arrivalTime = text(field(trip, ["ArrivesAt", "ArrivalTime", "arrival_time", "ArrivalAt"]));
  const departureDate =
    isoDate(departureTime) ?? isoDate(field(availability, ["Date", "date"]));
  const mileage = number(field(trip, ["MileageCost", "Mileage", "mileage_cost", "mileage"]));
  if (!origin || !destination || !departureDate || mileage === undefined || mileage <= 0) {
    return undefined;
  }
  const seatCount = remainingSeats(
    program.source,
    field(trip, ["RemainingSeats", "remaining_seats", "Seats"])
  );
  const flightNumbers = strings(field(trip, ["FlightNumbers", "flight_numbers", "Flights"]));
  const carriers = strings(field(trip, ["Airlines", "airlines", "Carriers"]));
  const direct = boolean(field(trip, ["Direct", "direct"]));
  const stops = number(field(trip, ["Stops", "stops"]));
  const taxesInMinorUnits = number(field(trip, ["TotalTaxes", "total_taxes", "Taxes"])) ?? 0;
  const currency = text(field(trip, ["TaxesCurrency", "taxes_currency", "Currency"])) || "USD";
  const duration = number(field(trip, ["Duration", "duration_minutes", "DurationMinutes"]));
  const updated =
    text(field(availability, ["UpdatedAt", "updated_at"])) ?? new Date().toISOString();

  return {
    id: stableId([
      program.source,
      origin,
      destination,
      departureTime ?? departureDate,
      cabin,
      mileage,
      flightNumbers.join(","),
    ]),
    provider: "seats_aero",
    live: true,
    loyaltyProgramCode: program.code,
    loyaltyProgramName: program.name,
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    departureDate,
    cabin,
    pointsPerTraveler: Math.round(mileage),
    taxesPerTraveler: Math.max(0, taxesInMinorUnits / 100),
    taxesKnown: true,
    currency: /^[A-Z]{3}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : "USD",
    seats: seatCount.seats,
    seatCountKnown: seatCount.known,
    stops: Math.max(0, Math.round(stops ?? (direct ? 0 : Math.max(0, flightNumbers.length - 1)))),
    durationMinutes: duration === undefined ? undefined : Math.max(0, Math.round(duration)),
    departureTime,
    arrivalTime,
    flightNumbers,
    carriers,
    lastSeenAt: updated,
    transferOptions: program.transfers,
  };
}

function normalizeSummary(
  availability: UnknownRecord,
  cabin: Cabin
): AwardOffer | undefined {
  const fields = CABIN_FIELDS[cabin];
  if (!boolean(field(availability, [fields.available]))) return undefined;
  const route = record(field(availability, ["Route", "route"]));
  const origin = text(field(route, ["OriginAirport", "origin_airport", "Origin"]));
  const destination = text(field(route, ["DestinationAirport", "destination_airport", "Destination"]));
  const departureDate = isoDate(field(availability, ["Date", "date"]));
  const mileage = number(field(availability, [fields.mileage]));
  if (!origin || !destination || !departureDate || mileage === undefined || mileage <= 0) {
    return undefined;
  }
  const program = sourceProgram(availabilitySource(availability, route));
  const seatCount = remainingSeats(program.source, field(availability, [fields.seats]));
  const direct = boolean(field(availability, [fields.direct]));
  const carriers = strings(field(availability, [fields.airlines]));
  const updated =
    text(field(availability, ["UpdatedAt", "updated_at"])) ?? new Date().toISOString();

  return {
    id: stableId([program.source, origin, destination, departureDate, cabin, mileage]),
    provider: "seats_aero",
    live: true,
    loyaltyProgramCode: program.code,
    loyaltyProgramName: program.name,
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    departureDate,
    cabin,
    pointsPerTraveler: Math.round(mileage),
    taxesPerTraveler: 0,
    taxesKnown: false,
    currency: "USD",
    seats: seatCount.seats,
    seatCountKnown: seatCount.known,
    stops: direct ? 0 : 1,
    carriers,
    lastSeenAt: updated,
    transferOptions: program.transfers,
  };
}

function destinationAirports(intent: SearchIntent): string[] {
  if (intent.destinations.kind === "airports") return intent.destinations.values;
  return REGION_AIRPORTS[intent.destinations.values[0]] ?? [];
}

function normalizePayload(payload: unknown, intent: SearchIntent): AwardOffer[] {
  const body = record(payload);
  const data = field(body, ["data", "Data"]);
  const availability = Array.isArray(data) ? data : [];
  const requestedSources = new Set(intent.sources ?? []);
  const offers = availability.flatMap((entry) => {
    const item = record(entry);
    if (!item) return [];
    const route = record(field(item, ["Route", "route"]));
    const source = availabilitySource(item, route);
    if (requestedSources.size > 0 && (!source || !requestedSources.has(source))) return [];
    const tripValue = field(item, ["AvailabilityTrips", "availability_trips", "Trips", "trips"]);
    const trips = Array.isArray(tripValue) ? tripValue : [];
    const tripOffers = trips
      .map((trip) => record(trip))
      .filter(Boolean)
      .flatMap((trip) => normalizeTrip(item, trip!, intent.cabins) ?? []);
    if (tripOffers.length > 0) return tripOffers;
    return intent.cabins.flatMap((cabin) => normalizeSummary(item, cabin) ?? []);
  });
  return [...new Map(offers.map((offer) => [offer.id, offer])).values()];
}

export class SeatsAeroProvider implements AwardSearchProvider {
  readonly id = "seats_aero";
  readonly name = "Seats.aero";
  readonly live = true;

  async search(intent: SearchIntent) {
    const apiKey = await getLocalCredential("seats_aero_api_key");
    if (!apiKey) {
      throw new AwardProviderError(
        "Add seats_aero_api_key to the protected Ruffi credential file to enable live search.",
        503
      );
    }
    const destinations = destinationAirports(intent);
    if (destinations.length === 0) {
      throw new AwardProviderError("No supported airports were found for that destination.", 400);
    }

    const url = new URL(ENDPOINT);
    url.searchParams.set("origin_airport", intent.origins.values.join(","));
    url.searchParams.set("destination_airport", destinations.join(","));
    url.searchParams.set("start_date", intent.startDate);
    url.searchParams.set("end_date", intent.endDate);
    url.searchParams.set("take", "1000");
    url.searchParams.set("skip", "0");
    url.searchParams.set("order_by", "lowest_mileage");
    url.searchParams.set("include_trips", "true");
    url.searchParams.set("minify_trips", "false");
    url.searchParams.set(
      "cabins",
      intent.cabins.map((cabin) => CABIN_FIELDS[cabin].query).join(",")
    );
    if (intent.maxStops === 0) url.searchParams.set("direct_only", "true");
    if (intent.carriers?.length) url.searchParams.set("carriers", intent.carriers.join(","));
    if (intent.sources?.length === 1) url.searchParams.set("source", intent.sources[0]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        headers: { "Partner-Authorization": apiKey },
        signal: controller.signal,
      });
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_RESPONSE_BYTES) {
        throw new AwardProviderError("Seats.aero returned too much data.");
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new AwardProviderError("Seats.aero returned too much data.");
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AwardProviderError("Seats.aero rejected the configured API key.", 502);
        }
        if (response.status === 429) {
          throw new AwardProviderError("Seats.aero rate-limited this search. Try again later.", 429);
        }
        throw new AwardProviderError(`Seats.aero search failed with status ${response.status}.`);
      }
      const offers = normalizePayload(JSON.parse(body), intent);
      return {
        offers,
        provider: {
          id: this.id,
          name: this.name,
          live: true,
          message:
            "Cached Seats.aero Pro results. Verify availability in the loyalty program before transferring points.",
        },
      };
    } catch (error) {
      if (error instanceof AwardProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AwardProviderError("Seats.aero search timed out.", 504);
      }
      throw new AwardProviderError("Seats.aero could not be reached.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
