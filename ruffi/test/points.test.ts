// @steered SNARE-2 2026-09-29

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { applyPreferenceDecision } from "../packages/points/src/decisioning.ts";
import { buildFundingPlan, rankAwardOffers } from "../packages/points/src/funding.ts";
import { parseSearchIntent, refineSearchIntent } from "../packages/points/src/intent.ts";
import { interpretSearchIntent } from "../packages/points/src/ollamaIntent.ts";
import {
  resetLocalCredentialsCacheForTests,
} from "../packages/points/src/providers/localCredentials.ts";
import { SeatsAeroProvider } from "../packages/points/src/providers/seatsAero.ts";
import { validateIntent } from "../packages/points/src/service.ts";
import type { AwardOffer, RankedAwardOffer } from "../packages/points/src/types.ts";

function offer(overrides: Partial<AwardOffer> = {}): AwardOffer {
  return {
    id: "offer_one",
    provider: "test",
    live: true,
    loyaltyProgramCode: "AF",
    loyaltyProgramName: "Air France-KLM Flying Blue",
    origin: "JFK",
    destination: "CDG",
    departureDate: "2027-07-08",
    cabin: "business",
    pointsPerTraveler: 58_000,
    taxesPerTraveler: 210,
    currency: "USD",
    seats: 2,
    stops: 0,
    premiumCabinPercentage: 100,
    lastSeenAt: "2026-09-29T12:00:00.000Z",
    transferOptions: [
      {
        programId: "amex_membership_rewards",
        programName: "Amex",
        bonusPercentage: 0,
      },
    ],
    ...overrides,
  };
}

test("parses a flexible natural-language award request", () => {
  const intent = parseSearchIntent(
    "I want two business class seats from New York to Europe in July",
    ["JFK", "EWR"],
    new Date("2026-09-29T12:00:00Z")
  );

  assert.deepEqual(intent.origins.values, ["JFK", "EWR", "LGA"]);
  assert.deepEqual(intent.destinations, {
    kind: "continent",
    values: ["EU"],
    label: "Europe",
  });
  assert.equal(intent.startDate, "2027-07-01");
  assert.equal(intent.endDate, "2027-07-31");
  assert.deepEqual(intent.cabins, ["business"]);
  assert.equal(intent.travelers, 2);
});

test("preserves context while refining destination and departure time", () => {
  const initial = parseSearchIntent(
    "One way direct economy flight from JFK or EWR to LAX or SNA in July 2027 on American, United, or Delta",
    ["JFK", "EWR"],
    new Date("2026-09-29T12:00:00Z")
  );
  const refined = refineSearchIntent(
    "Nonstop to SNA only, departing after 10am and no later than 4pm",
    initial,
    ["JFK", "EWR"],
    new Date("2026-09-29T12:00:00Z")
  );

  assert.deepEqual(refined.origins.values, ["JFK", "EWR"]);
  assert.deepEqual(refined.destinations.values, ["SNA"]);
  assert.equal(refined.startDate, "2027-07-01");
  assert.equal(refined.endDate, "2027-07-31");
  assert.equal(refined.maxStops, 0);
  assert.deepEqual(refined.sources, ["american", "united", "delta"]);
  assert.deepEqual(refined.carriers, ["AA", "UA", "DL"]);
  assert.deepEqual(refined.departureTime, {
    earliestMinutes: 600,
    latestMinutes: 960,
    label: "10:00 AM to 4:00 PM local departure",
  });
});

test("rejects a departure window that has already passed", () => {
  const past = parseSearchIntent(
    "Economy from JFK to LAX in July 2026",
    ["JFK"],
    new Date("2026-09-29T12:00:00Z")
  );
  assert.throws(() => validateIntent(past), /past/);
});

test("validates a local Ollama interpretation before using it", async () => {
  const previousFetch = globalThis.fetch;
  const previousModel = process.env.RUFFI_FLIGHT_MODEL;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({
            origins: ["JFK", "EWR"],
            destinations: ["SNA"],
            startDate: "2027-07-01",
            endDate: "2027-07-31",
            cabins: ["economy"],
            travelers: 1,
            maxStops: 0,
            sources: ["united"],
            carriers: ["UA"],
            departureTime: { earliestMinutes: 600, latestMinutes: 960 },
            tripType: "one_way",
          }),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  process.env.RUFFI_FLIGHT_MODEL = "test-flight-model";

  try {
    const result = await interpretSearchIntent(
      "Find a nonstop United flight to SNA after 10am and before 4pm in July 2027",
      ["JFK", "EWR"],
      undefined,
      new Date("2026-09-29T12:00:00Z")
    );
    assert.equal(result.interpretation.engine, "ollama");
    assert.equal(result.interpretation.model, "test-flight-model");
    assert.deepEqual(result.intent.destinations.values, ["SNA"]);
    assert.deepEqual(result.intent.carriers, ["UA"]);
    assert.equal(result.intent.departureTime?.earliestMinutes, 600);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousModel === undefined) delete process.env.RUFFI_FLIGHT_MODEL;
    else process.env.RUFFI_FLIGHT_MODEL = previousModel;
  }
});

test("normalizes Seats.aero trip details and treats American zero seats as unknown", async () => {
  await mkdir(path.join(process.cwd(), ".data"), { recursive: true });
  const directory = await mkdtemp(path.join(process.cwd(), ".data", "test-credentials-"));
  const credentialFile = path.join(directory, "credentials.txt");
  await writeFile(credentialFile, "seats_aero_api_key=test-seats-key\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(credentialFile, 0o600);

  const previousPath = process.env.RUFFI_LOCAL_CREDENTIAL_FILE;
  const previousFetch = globalThis.fetch;
  process.env.RUFFI_LOCAL_CREDENTIAL_FILE = credentialFile;
  resetLocalCredentialsCacheForTests();
  let requestedUrl: URL | undefined;
  let requestedAuthorization: string | null = null;

  globalThis.fetch = async (input, init) => {
    requestedUrl = new URL(String(input));
    requestedAuthorization = new Headers(init?.headers).get("Partner-Authorization");
    return new Response(
      JSON.stringify({
        data: [
          {
            Date: "2027-07-15",
            UpdatedAt: "2026-09-29T12:00:00Z",
            Route: {
              OriginAirport: "JFK",
              DestinationAirport: "SNA",
              Source: "american",
            },
            AvailabilityTrips: [
              {
                Cabin: "Y",
                MileageCost: 29_100,
                TotalTaxes: 600,
                TaxesCurrency: "USD",
                RemainingSeats: 0,
                Stops: 0,
                FlightNumbers: ["AA1847"],
                Airlines: ["AA"],
                DepartsAt: "2027-07-15T13:30:00",
                ArrivesAt: "2027-07-15T16:51:00",
              },
            ],
          },
          {
            Date: "2027-07-15",
            UpdatedAt: "2026-09-29T12:00:00Z",
            Route: {
              OriginAirport: "JFK",
              DestinationAirport: "SNA",
              Source: "lifemiles",
            },
            AvailabilityTrips: [
              {
                Cabin: "Y",
                MileageCost: 25_000,
                TotalTaxes: 600,
                TaxesCurrency: "USD",
                RemainingSeats: 2,
                Stops: 0,
                FlightNumbers: ["AV9999"],
                Airlines: ["AV"],
                DepartsAt: "2027-07-15T14:30:00",
                ArrivesAt: "2027-07-15T17:51:00",
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const intent = refineSearchIntent(
      "SNA only, departing between 10am and 4pm",
      parseSearchIntent(
        "One way direct economy flight from JFK or EWR to LAX or SNA in July 2027 on American, United, or Delta",
        ["JFK", "EWR"],
        new Date("2026-09-29T12:00:00Z")
      ),
      ["JFK", "EWR"],
      new Date("2026-09-29T12:00:00Z")
    );
    const result = await new SeatsAeroProvider().search(intent);
    assert.equal(requestedUrl?.hostname, "seats.aero");
    assert.equal(requestedUrl?.searchParams.get("origin_airport"), "JFK,EWR");
    assert.equal(requestedUrl?.searchParams.get("destination_airport"), "SNA");
    assert.equal(requestedUrl?.searchParams.get("direct_only"), "true");
    assert.equal(requestedUrl?.searchParams.get("include_trips"), "true");
    assert.equal(requestedUrl?.searchParams.get("cabins"), "economy");
    assert.equal(requestedUrl?.searchParams.get("source"), null);
    assert.equal(requestedAuthorization, "test-seats-key");
    assert.equal(result.offers.length, 1);
    assert.equal(result.offers[0].loyaltyProgramName, "American AAdvantage");
    assert.equal(result.offers[0].pointsPerTraveler, 29_100);
    assert.equal(result.offers[0].taxesPerTraveler, 6);
    assert.equal(result.offers[0].seatCountKnown, false);
    assert.deepEqual(result.offers[0].flightNumbers, ["AA1847"]);
    assert.equal(result.offers[0].departureTime, "2027-07-15T13:30:00");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousPath === undefined) delete process.env.RUFFI_LOCAL_CREDENTIAL_FILE;
    else process.env.RUFFI_LOCAL_CREDENTIAL_FILE = previousPath;
    resetLocalCredentialsCacheForTests();
    await rm(directory, { recursive: true, force: true });
  }
});

test("builds a funding plan from transferable points", () => {
  const plan = buildFundingPlan(offer(), 2, [
    { programId: "amex_membership_rewards", balance: 184_000 },
  ]);

  assert.equal(plan.covered, true);
  assert.equal(plan.requiredPoints, 116_000);
  assert.deepEqual(plan.steps, [
    {
      programId: "amex_membership_rewards",
      programName: "Amex",
      points: 116_000,
      action: "transfer",
      destinationProgram: "Air France-KLM Flying Blue",
      bonusPercentage: 0,
    },
  ]);
});

test("keeps hard constraints and wallet feasibility in deterministic ranking", () => {
  const ranked = rankAwardOffers(
    [
      offer({ id: "expensive", pointsPerTraveler: 75_000, stops: 0 }),
      offer({ id: "cheap", pointsPerTraveler: 58_000, stops: 1 }),
    ],
    2,
    [{ programId: "amex_membership_rewards", balance: 184_000 }]
  );

  assert.equal(ranked[0].id, "cheap");
  assert.equal(ranked[0].funding.covered, true);
});

test("Jev can preference-rank eligible offers without changing eligibility", async () => {
  await mkdir(path.join(process.cwd(), ".data"), { recursive: true });
  const directory = await mkdtemp(path.join(process.cwd(), ".data", "test-credentials-"));
  const credentialFile = path.join(directory, "credentials.txt");
  await writeFile(credentialFile, "typesafe_api_key=test-typesafe-key\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(credentialFile, 0o600);

  const previousPath = process.env.RUFFI_LOCAL_CREDENTIAL_FILE;
  const previousBase = process.env.TYPESAFE_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.RUFFI_LOCAL_CREDENTIAL_FILE = credentialFile;
  process.env.TYPESAFE_BASE_URL = "https://example.test";
  resetLocalCredentialsCacheForTests();
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        answers: {
          best_offer: { type: "choice", choice: "offer_2", confidence: 0.91 },
          needs_review: { type: "noul", noul: 0.12 },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    const ranked = rankAwardOffers(
      [
        offer({ id: "low_tax", taxesPerTraveler: 40, stops: 1 }),
        offer({ id: "nonstop", taxesPerTraveler: 210, stops: 0 }),
      ],
      2,
      [{ programId: "amex_membership_rewards", balance: 184_000 }]
    ) as RankedAwardOffer[];
    const intent = parseSearchIntent(
      "Two business class seats from JFK to CDG in July 2027",
      ["JFK"],
      new Date("2026-09-29T12:00:00Z")
    );
    const decided = await applyPreferenceDecision(
      ranked,
      intent,
      "Nonstop is much more important to me than taxes and fees."
    );

    assert.equal(decided.decisioning.engine, "jev");
    assert.equal(decided.decisioning.selectedOfferId, ranked[1].id);
    assert.equal(decided.offers[0].id, ranked[1].id);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousPath === undefined) delete process.env.RUFFI_LOCAL_CREDENTIAL_FILE;
    else process.env.RUFFI_LOCAL_CREDENTIAL_FILE = previousPath;
    if (previousBase === undefined) delete process.env.TYPESAFE_BASE_URL;
    else process.env.TYPESAFE_BASE_URL = previousBase;
    resetLocalCredentialsCacheForTests();
    await rm(directory, { recursive: true, force: true });
  }
});
