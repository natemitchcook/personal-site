// @steered SNARE-2 2026-09-29

import { readPointsState } from "../../../../../lib/storage/pointsStore.ts";
import {
  createAwardWatch,
  createAwardWatchFromIntent,
  deleteAwardWatch,
  setAwardWatchEnabled,
} from "../../../../../packages/points/src/watches.ts";
import type { SearchIntent } from "../../../../../packages/points/src/types.ts";
import { AwardProviderError } from "../../../../../packages/points/src/providers/provider.ts";
import {
  apiError,
  noStoreJson,
  readJson,
  requireAuthorization,
  requireRateLimit,
} from "../../_shared/http.ts";

export async function GET(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  const state = await readPointsState();
  return noStoreJson({ watches: state.watches });
}

export async function POST(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  const rateLimited = requireRateLimit(request, "create-watch", 10, 60_000);
  if (rateLimited) return rateLimited;
  try {
    const body = await readJson(request);
    if (!body || typeof body !== "object") throw new Error("A watch request is required.");
    const input = body as Record<string, unknown>;
    const name = typeof input.name === "string" ? input.name : undefined;
    const watch =
      input.intent && typeof input.intent === "object"
        ? await createAwardWatchFromIntent(input.intent as SearchIntent, name)
        : typeof input.query === "string"
          ? await createAwardWatch(input.query, name)
          : undefined;
    if (!watch) throw new Error("A natural-language query or structured intent is required.");
    return noStoreJson({ watch }, { status: 201 });
  } catch (error) {
    return apiError(error, error instanceof AwardProviderError ? error.status : 400);
  }
}

export async function PATCH(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await readJson(request);
    if (!body || typeof body !== "object") throw new Error("A watch update is required.");
    const input = body as Record<string, unknown>;
    if (typeof input.id !== "string" || typeof input.enabled !== "boolean") {
      throw new Error("Watch id and enabled status are required.");
    }
    const watch = await setAwardWatchEnabled(input.id, input.enabled);
    if (!watch) return apiError(new Error("Watch not found."), 404);
    return noStoreJson({ watch });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError(new Error("Watch id is required."));
  const deleted = await deleteAwardWatch(id);
  return deleted ? noStoreJson({ deleted: true }) : apiError(new Error("Watch not found."), 404);
}
