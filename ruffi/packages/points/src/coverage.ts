// @steered SNARE-2 2026-09-29

export type ConnectorStatus =
  | "available_adapter"
  | "researching_direct"
  | "commercial_access_required";

export type LoyaltyConnectorPlan = {
  id: string;
  loyaltyProgram: string;
  homeAirline: string;
  alliance: "oneworld" | "star_alliance" | "skyteam" | "independent";
  priority: 1 | 2 | 3;
  status: ConnectorStatus;
  why: string;
};

export const LOYALTY_CONNECTOR_PLAN: LoyaltyConnectorPlan[] = [
  {
    id: "american_aadvantage",
    loyaltyProgram: "American AAdvantage",
    homeAirline: "American Airlines",
    alliance: "oneworld",
    priority: 1,
    status: "researching_direct",
    why: "American pricing plus broad oneworld and non-alliance partner awards.",
  },
  {
    id: "alaska_mileage_plan",
    loyaltyProgram: "Alaska Mileage Plan",
    homeAirline: "Alaska Airlines",
    alliance: "oneworld",
    priority: 1,
    status: "researching_direct",
    why: "Distinct partner pricing and useful oneworld access.",
  },
  {
    id: "british_airways_avios",
    loyaltyProgram: "British Airways Club",
    homeAirline: "British Airways",
    alliance: "oneworld",
    priority: 1,
    status: "researching_direct",
    why: "Avios pricing and wide oneworld partner visibility.",
  },
  {
    id: "qantas_frequent_flyer",
    loyaltyProgram: "Qantas Frequent Flyer",
    homeAirline: "Qantas",
    alliance: "oneworld",
    priority: 2,
    status: "researching_direct",
    why: "Additional oneworld availability and different award pricing.",
  },
  {
    id: "qatar_avios",
    loyaltyProgram: "Qatar Airways Privilege Club",
    homeAirline: "Qatar Airways",
    alliance: "oneworld",
    priority: 2,
    status: "researching_direct",
    why: "Important Qatar and Avios redemption path.",
  },
  {
    id: "united_mileageplus",
    loyaltyProgram: "United MileagePlus",
    homeAirline: "United Airlines",
    alliance: "star_alliance",
    priority: 1,
    status: "researching_direct",
    why: "United pricing plus broad Star Alliance partner awards.",
  },
  {
    id: "air_canada_aeroplan",
    loyaltyProgram: "Air Canada Aeroplan",
    homeAirline: "Air Canada",
    alliance: "star_alliance",
    priority: 1,
    status: "researching_direct",
    why: "Strong Star Alliance coverage and many additional partners.",
  },
  {
    id: "avianca_lifemiles",
    loyaltyProgram: "Avianca LifeMiles",
    homeAirline: "Avianca",
    alliance: "star_alliance",
    priority: 1,
    status: "researching_direct",
    why: "Alternative Star Alliance pricing with frequent purchase promotions.",
  },
  {
    id: "singapore_krisflyer",
    loyaltyProgram: "Singapore KrisFlyer",
    homeAirline: "Singapore Airlines",
    alliance: "star_alliance",
    priority: 2,
    status: "researching_direct",
    why: "Required for some Singapore premium-cabin inventory.",
  },
  {
    id: "ana_mileage_club",
    loyaltyProgram: "ANA Mileage Club",
    homeAirline: "ANA",
    alliance: "star_alliance",
    priority: 2,
    status: "researching_direct",
    why: "Distinct round-trip pricing and Star Alliance availability.",
  },
  {
    id: "delta_skymiles",
    loyaltyProgram: "Delta SkyMiles",
    homeAirline: "Delta Air Lines",
    alliance: "skyteam",
    priority: 1,
    status: "researching_direct",
    why: "Delta pricing and selected SkyTeam partner awards.",
  },
  {
    id: "air_france_flying_blue",
    loyaltyProgram: "Air France-KLM Flying Blue",
    homeAirline: "Air France and KLM",
    alliance: "skyteam",
    priority: 1,
    status: "researching_direct",
    why: "Core SkyTeam search path and monthly promotional awards.",
  },
  {
    id: "virgin_atlantic_flying_club",
    loyaltyProgram: "Virgin Atlantic Flying Club",
    homeAirline: "Virgin Atlantic",
    alliance: "skyteam",
    priority: 1,
    status: "researching_direct",
    why: "Virgin Atlantic and partner-specific redemption opportunities.",
  },
  {
    id: "emirates_skywards",
    loyaltyProgram: "Emirates Skywards",
    homeAirline: "Emirates",
    alliance: "independent",
    priority: 1,
    status: "researching_direct",
    why: "Primary path for Emirates awards and upgrades.",
  },
  {
    id: "etihad_guest",
    loyaltyProgram: "Etihad Guest",
    homeAirline: "Etihad Airways",
    alliance: "independent",
    priority: 1,
    status: "researching_direct",
    why: "Etihad awards plus a distinct set of bilateral partners.",
  },
  {
    id: "virgin_australia_velocity",
    loyaltyProgram: "Virgin Australia Velocity",
    homeAirline: "Virgin Australia",
    alliance: "independent",
    priority: 2,
    status: "researching_direct",
    why: "Virgin Australia plus bilateral partners including Qatar and United.",
  },
];

export const CONNECTOR_STRATEGY = {
  availableAdapters: ["demo", "pointsyeah"],
  directConnectorCount: LOYALTY_CONNECTOR_PLAN.length,
  principle:
    "Ruffi owns the contract and combines sanctioned provider APIs with program-specific connectors. No provider owns the wallet, watch logic, ranking, or agent interface.",
};
