// @steered SNARE-2 2026-09-29

import { readPointsState } from "../../../../../lib/storage/pointsStore.ts";
import { searchAwards, searchNaturalLanguage, validateIntent } from "../../../../../packages/points/src/service.ts";
import { AwardProviderError } from "../../../../../packages/points/src/providers/provider.ts";
import type { SearchIntent } from "../../../../../packages/points/src/types.ts";
import {
  apiError,
  noStoreJson,
  readJson,
  requireAuthorization,
  requireRateLimit,
} from "../../_shared/http.ts";

export async function POST(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  const rateLimited = requireRateLimit(request, "award-search", 20, 60_000);
  if (rateLimited) return rateLimited;
  try {
    const body = await readJson(request);
    if (!body || typeof body !== "object") throw new Error("A search request is required.");
    const input = body as Record<string, unknown>;
    const state = await readPointsState();
    if (typeof input.query === "string") {
      const previousIntent =
        input.previousIntent && typeof input.previousIntent === "object"
          ? validateIntent(input.previousIntent as SearchIntent)
          : undefined;
      return noStoreJson(
        await searchNaturalLanguage(
          input.query,
          state.wallet,
          state.preferenceNotes,
          undefined,
          previousIntent
        )
      );
    }
    if (input.intent && typeof input.intent === "object") {
      const intent = validateIntent(input.intent as SearchIntent);
      return noStoreJson(await searchAwards(intent, state.wallet, state.preferenceNotes));
    }
    throw new Error("Provide a natural-language query or a structured intent.");
  } catch (error) {
    const status = error instanceof AwardProviderError ? error.status : 400;
    return apiError(error, status);
  }
}
