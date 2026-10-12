// @steered SNARE-2 2026-09-29

import { checkAwardWatches } from "../../../../../../packages/points/src/watches.ts";
import {
  apiError,
  noStoreJson,
  readJson,
  requireAuthorization,
  requireRateLimit,
} from "../../../_shared/http.ts";

export async function POST(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  const rateLimited = requireRateLimit(request, "check-watches", 4, 60_000);
  if (rateLimited) return rateLimited;
  try {
    const body = await readJson(request);
    const force = Boolean(body && typeof body === "object" && (body as Record<string, unknown>).force === true);
    return noStoreJson(await checkAwardWatches(force));
  } catch (error) {
    return apiError(error, 502);
  }
}
