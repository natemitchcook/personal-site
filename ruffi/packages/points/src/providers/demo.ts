// @steered SNARE-2 2026-09-29

import { createHash } from "node:crypto";
import type { AwardOffer, Cabin, SearchIntent, TransferOption } from "../types.ts";
import type { AwardSearchProvider } from "./provider.ts";

const REGION_AIRPORTS: Record<string, string[]> = {
  EU: ["CDG", "LHR", "FCO", "AMS", "MAD", "ATH"],
  AS: ["HND", "NRT", "SIN", "ICN", "BKK", "HKG"],
  AF: ["CPT", "JNB", "NBO", "CAI"],
  SA: ["GRU", "EZE", "SCL", "LIM"],
  OC: ["SYD", "MEL", "AKL", "BNE"],
  NA: ["YVR", "YYZ", "MEX", "CUN"],
};

const PROGRAMS: Array<{
  code: string;
  name: string;
  base: number;
  tax: number;
  transfers: TransferOption[];
}> = [
  {
    code: "AF",
    name: "Air France-KLM Flying Blue",
    base: 58_000,
    tax: 211,
    transfers: [
      { programId: "amex_membership_rewards", programName: "Amex", bonusPercentage: 0 },
      { programId: "chase_ultimate_rewards", programName: "Chase", bonusPercentage: 0 },
      { programId: "capital_one_miles", programName: "Capital One", bonusPercentage: 0 },
      { programId: "citi_thankyou", programName: "Citi", bonusPercentage: 0 },
    ],
  },
  {
    code: "AC",
    name: "Air Canada Aeroplan",
    base: 70_000,
    tax: 78,
    transfers: [
      { programId: "amex_membership_rewards", programName: "Amex", bonusPercentage: 0 },
      { programId: "chase_ultimate_rewards", programName: "Chase", bonusPercentage: 0 },
      { programId: "capital_one_miles", programName: "Capital One", bonusPercentage: 0 },
      { programId: "bilt_rewards", programName: "Bilt", bonusPercentage: 0 },
    ],
  },
  {
    code: "BA",
    name: "British Airways Avios",
    base: 62_500,
    tax: 418,
    transfers: [
      { programId: "amex_membership_rewards", programName: "Amex", bonusPercentage: 0 },
      { programId: "chase_ultimate_rewards", programName: "Chase", bonusPercentage: 0 },
      { programId: "bilt_rewards", programName: "Bilt", bonusPercentage: 0 },
    ],
  },
  {
    code: "UA",
    name: "United MileagePlus",
    base: 80_000,
    tax: 6,
    transfers: [
      { programId: "chase_ultimate_rewards", programName: "Chase", bonusPercentage: 0 },
      { programId: "bilt_rewards", programName: "Bilt", bonusPercentage: 0 },
    ],
  },
];

function dateAt(startDate: string, offset: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function cabin(intent: SearchIntent): Cabin {
  return intent.cabins[0] ?? "business";
}

export class DemoAwardProvider implements AwardSearchProvider {
  readonly id = "demo";
  readonly name = "Ruffi demo inventory";
  readonly live = false;

  async search(intent: SearchIntent) {
    const origins = intent.origins.values;
    const destinations =
      intent.destinations.kind === "continent"
        ? REGION_AIRPORTS[intent.destinations.values[0]] ?? ["CDG"]
        : intent.destinations.values;
    const now = new Date().toISOString();
    const offers: AwardOffer[] = PROGRAMS.map((program, index) => {
      const origin = origins[index % origins.length];
      const destination = destinations[index % destinations.length];
      const points = program.base + index * 2_500;
      const signature = `${program.code}:${origin}:${destination}:${intent.startDate}:${points}`;
      return {
        id: `demo_${createHash("sha256").update(signature).digest("hex").slice(0, 16)}`,
        provider: this.id,
        live: false,
        loyaltyProgramCode: program.code,
        loyaltyProgramName: program.name,
        origin,
        destination,
        departureDate: dateAt(intent.startDate, index * 3),
        cabin: cabin(intent),
        pointsPerTraveler: points,
        taxesPerTraveler: program.tax,
        taxesKnown: true,
        currency: "USD",
        seats: Math.max(intent.travelers, 2),
        stops: index % 3 === 2 ? 1 : 0,
        durationMinutes: 430 + index * 35,
        premiumCabinPercentage: index === 3 ? 82 : 100,
        lastSeenAt: now,
        transferOptions: program.transfers,
      };
    });

    return {
      offers,
      provider: {
        id: this.id,
        name: this.name,
        live: false,
        message: "Demo results prove the Ruffi experience. Add a sanctioned provider key for real availability.",
      },
    };
  }
}
