// @steered SNARE-2 2026-09-29

import { DemoAwardProvider } from "./demo.ts";
import { PointsYeahProvider } from "./pointsYeah.ts";
import { SeatsAeroProvider } from "./seatsAero.ts";
import type { AwardSearchProvider } from "./provider.ts";

export function configuredAwardProvider(): AwardSearchProvider {
  const requested = process.env.RUFFI_AWARD_PROVIDER?.trim().toLowerCase();

  if (requested === "demo") return new DemoAwardProvider();
  if (requested === "seats_aero" || requested === "seats" || requested === "seats.aero") {
    return new SeatsAeroProvider();
  }
  if (requested === "pointsyeah") return new PointsYeahProvider();

  return new SeatsAeroProvider();
}
