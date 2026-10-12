// @steered SNARE-2 2026-09-29

import { readPointsState, sanitizeNotifications, sanitizePreferenceNotes, sanitizeWallet, updatePointsState } from "../../../../../lib/storage/pointsStore.ts";
import { apiError, noStoreJson, readJson, requireAuthorization } from "../../_shared/http.ts";

export async function GET(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  return noStoreJson(await readPointsState());
}

export async function PUT(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  try {
    const value = await readJson(request);
    if (!value || typeof value !== "object") throw new Error("State changes are required.");
    const input = value as Record<string, unknown>;
    const state = await updatePointsState((current) => ({
      ...current,
      wallet: input.wallet === undefined ? current.wallet : sanitizeWallet(input.wallet),
      notifications:
        input.notifications === undefined
          ? current.notifications
          : sanitizeNotifications(input.notifications),
      preferenceNotes:
        input.preferenceNotes === undefined
          ? current.preferenceNotes
          : sanitizePreferenceNotes(input.preferenceNotes),
    }));
    return noStoreJson(state);
  } catch (error) {
    return apiError(error);
  }
}
