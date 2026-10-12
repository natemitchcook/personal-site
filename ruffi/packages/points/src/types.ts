// @steered SNARE-2 2026-09-29

export const CABINS = [
  "economy",
  "premium_economy",
  "business",
  "first",
] as const;

export type Cabin = (typeof CABINS)[number];

export type PointProgram = {
  id: string;
  name: string;
  shortName: string;
  kind: "bank" | "airline";
  providerCodes: string[];
};

export type WalletBalance = {
  programId: string;
  balance: number;
};

export type Wallet = {
  homeAirports: string[];
  balances: WalletBalance[];
};

export type SearchLocation = {
  kind: "airports" | "continent";
  values: string[];
  label: string;
};

export type DepartureTimeWindow = {
  earliestMinutes: number;
  latestMinutes: number;
  label: string;
};

export type SearchIntent = {
  rawQuery: string;
  origins: SearchLocation;
  destinations: SearchLocation;
  startDate: string;
  endDate: string;
  cabins: Cabin[];
  travelers: number;
  maxStops?: number;
  maxPoints?: number;
  sources?: string[];
  carriers?: string[];
  departureTime?: DepartureTimeWindow;
  tripType: "one_way" | "round_trip";
  assumptions: string[];
};

export type TransferOption = {
  programId: string;
  programName: string;
  bonusPercentage: number;
  sourceUrl?: string;
};

export type AwardOffer = {
  id: string;
  provider: string;
  live: boolean;
  loyaltyProgramCode: string;
  loyaltyProgramName: string;
  origin: string;
  originCity?: string;
  destination: string;
  destinationCity?: string;
  departureDate: string;
  cabin: Cabin;
  pointsPerTraveler: number;
  taxesPerTraveler: number;
  taxesKnown?: boolean;
  currency: string;
  seats: number;
  seatCountKnown?: boolean;
  stops: number;
  durationMinutes?: number;
  premiumCabinPercentage?: number;
  departureTime?: string;
  arrivalTime?: string;
  flightNumbers?: string[];
  carriers?: string[];
  lastSeenAt: string;
  bookingUrl?: string;
  transferOptions: TransferOption[];
};

export type FundingPlan = {
  covered: boolean;
  requiredPoints: number;
  availablePoints: number;
  shortfall: number;
  steps: Array<{
    programId: string;
    programName: string;
    points: number;
    action: "use" | "transfer";
    destinationProgram?: string;
    bonusPercentage?: number;
  }>;
  summary: string;
};

export type RankedAwardOffer = AwardOffer & {
  totalPoints: number;
  totalTaxes: number;
  funding: FundingPlan;
  score: number;
  reasons: string[];
};

export type IntentInterpretation = {
  engine: "ollama" | "deterministic";
  model?: string;
  refinement: boolean;
  message: string;
};

export type SearchResult = {
  intent: SearchIntent;
  offers: RankedAwardOffer[];
  provider: {
    id: string;
    name: string;
    live: boolean;
    message: string;
  };
  searchedAt: string;
  interpretation?: IntentInterpretation;
  decisioning?: {
    engine: "deterministic" | "jev";
    selectedOfferId?: string;
    confidence?: number;
    needsReview?: boolean;
    message: string;
  };
};

export type AwardWatch = {
  id: string;
  name: string;
  enabled: boolean;
  intent: SearchIntent;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  nextCheckAt: string;
  lastError?: string;
  lastBest?: {
    offerId: string;
    fingerprint: string;
    totalPoints: number;
    totalTaxes: number;
    seats: number;
    checkedAt: string;
  };
};

export type WatchAlert = {
  id: string;
  watchId: string;
  kind:
    | "availability_found"
    | "points_dropped"
    | "taxes_dropped"
    | "more_seats";
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
  offer?: RankedAwardOffer;
};

export type NotificationPreferences = {
  browser: boolean;
  emailEnabled: boolean;
  email?: string;
  smsEnabled: boolean;
  phone?: string;
};

export type RuffiPointsState = {
  schemaVersion: 1;
  wallet: Wallet;
  notifications: NotificationPreferences;
  preferenceNotes: string;
  watches: AwardWatch[];
  alerts: WatchAlert[];
  updatedAt: string;
};
