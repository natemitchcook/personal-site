// @steered SNARE-2 2026-09-29

import type { PointProgram } from "./types.ts";

export const POINT_PROGRAMS: PointProgram[] = [
  {
    id: "amex_membership_rewards",
    name: "American Express Membership Rewards",
    shortName: "Amex",
    kind: "bank",
    providerCodes: ["AMEX", "AMERICAN EXPRESS"],
  },
  {
    id: "chase_ultimate_rewards",
    name: "Chase Ultimate Rewards",
    shortName: "Chase",
    kind: "bank",
    providerCodes: ["CHASE"],
  },
  {
    id: "bilt_rewards",
    name: "Bilt Rewards",
    shortName: "Bilt",
    kind: "bank",
    providerCodes: ["BILT"],
  },
  {
    id: "capital_one_miles",
    name: "Capital One Miles",
    shortName: "Capital One",
    kind: "bank",
    providerCodes: ["CAPITAL ONE", "CAPITALONE"],
  },
  {
    id: "citi_thankyou",
    name: "Citi ThankYou Points",
    shortName: "Citi",
    kind: "bank",
    providerCodes: ["CITI"],
  },
  {
    id: "air_canada_aeroplan",
    name: "Air Canada Aeroplan",
    shortName: "Aeroplan",
    kind: "airline",
    providerCodes: ["AC", "AEROPLAN"],
  },
  {
    id: "air_france_flying_blue",
    name: "Air France-KLM Flying Blue",
    shortName: "Flying Blue",
    kind: "airline",
    providerCodes: ["AF", "FB", "FLYING BLUE"],
  },
  {
    id: "alaska_mileage_plan",
    name: "Alaska Mileage Plan",
    shortName: "Alaska",
    kind: "airline",
    providerCodes: ["AS", "ALASKA"],
  },
  {
    id: "american_aadvantage",
    name: "American AAdvantage",
    shortName: "American",
    kind: "airline",
    providerCodes: ["AA", "AADVANTAGE"],
  },
  {
    id: "ana_mileage_club",
    name: "ANA Mileage Club",
    shortName: "ANA",
    kind: "airline",
    providerCodes: ["NH", "ANA"],
  },
  {
    id: "avianca_lifemiles",
    name: "Avianca LifeMiles",
    shortName: "LifeMiles",
    kind: "airline",
    providerCodes: ["AV", "LIFEMILES"],
  },
  {
    id: "british_airways_avios",
    name: "British Airways Avios",
    shortName: "BA Avios",
    kind: "airline",
    providerCodes: ["BA", "BRITISH AIRWAYS"],
  },
  {
    id: "delta_skymiles",
    name: "Delta SkyMiles",
    shortName: "Delta",
    kind: "airline",
    providerCodes: ["DL", "DELTA"],
  },
  {
    id: "emirates_skywards",
    name: "Emirates Skywards",
    shortName: "Emirates",
    kind: "airline",
    providerCodes: ["EK", "EMIRATES"],
  },
  {
    id: "etihad_guest",
    name: "Etihad Guest",
    shortName: "Etihad",
    kind: "airline",
    providerCodes: ["EY", "ETIHAD"],
  },
  {
    id: "qantas_frequent_flyer",
    name: "Qantas Frequent Flyer",
    shortName: "Qantas",
    kind: "airline",
    providerCodes: ["QF", "QANTAS"],
  },
  {
    id: "qatar_avios",
    name: "Qatar Airways Privilege Club",
    shortName: "Qatar Avios",
    kind: "airline",
    providerCodes: ["QR", "QATAR"],
  },
  {
    id: "singapore_krisflyer",
    name: "Singapore KrisFlyer",
    shortName: "KrisFlyer",
    kind: "airline",
    providerCodes: ["SQ", "SINGAPORE"],
  },
  {
    id: "united_mileageplus",
    name: "United MileagePlus",
    shortName: "United",
    kind: "airline",
    providerCodes: ["UA", "UNITED"],
  },
  {
    id: "virgin_atlantic_flying_club",
    name: "Virgin Atlantic Flying Club",
    shortName: "Virgin Atlantic",
    kind: "airline",
    providerCodes: ["VS", "VIRGIN ATLANTIC"],
  },
  {
    id: "virgin_australia_velocity",
    name: "Virgin Australia Velocity",
    shortName: "Velocity",
    kind: "airline",
    providerCodes: ["VA", "VIRGIN AUSTRALIA", "VELOCITY"],
  },
];

export const DEFAULT_WALLET_PROGRAM_IDS = [
  "amex_membership_rewards",
  "chase_ultimate_rewards",
  "bilt_rewards",
  "capital_one_miles",
  "citi_thankyou",
  "american_aadvantage",
  "united_mileageplus",
  "delta_skymiles",
  "air_canada_aeroplan",
  "air_france_flying_blue",
  "british_airways_avios",
  "virgin_atlantic_flying_club",
];

export function pointProgram(programId: string): PointProgram | undefined {
  return POINT_PROGRAMS.find((program) => program.id === programId);
}

export function pointProgramByProviderCode(
  providerCode: string
): PointProgram | undefined {
  const normalized = providerCode.trim().toUpperCase();

  return POINT_PROGRAMS.find((program) =>
    program.providerCodes.includes(normalized)
  );
}

export function bankProgramFromProviderName(
  providerName: string
): PointProgram | undefined {
  const normalized = providerName.trim().toUpperCase();

  return POINT_PROGRAMS.find(
    (program) =>
      program.kind === "bank" && program.providerCodes.includes(normalized)
  );
}
