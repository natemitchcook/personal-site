// @steered SNARE-2 2026-09-29

import { readPointsState, updatePointsState } from "../../../../../lib/storage/pointsStore.ts";
import { apiError, noStoreJson, readJson, requireAuthorization } from "../../_shared/http.ts";

export async function GET(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  const state = await readPointsState();
  return noStoreJson({ alerts: state.alerts });
}

export async function PATCH(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await readJson(request);
    if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).ids)) {
      throw new Error("Alert ids are required.");
    }
    const ids = new Set(
      ((body as Record<string, unknown>).ids as unknown[])
        .filter((id): id is string => typeof id === "string")
        .slice(0, 500)
    );
    const readAt = new Date().toISOString();
    const state = await updatePointsState((current) => ({
      ...current,
      alerts: current.alerts.map((alert) => (ids.has(alert.id) ? { ...alert, readAt } : alert)),
    }));
    return noStoreJson({ alerts: state.alerts });
  } catch (error) {
    return apiError(error);
  }
}
