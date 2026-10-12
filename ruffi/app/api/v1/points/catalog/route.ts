// @steered SNARE-2 2026-09-29

import { getPointsPlatformCatalog } from "../../../../../packages/points/src/service.ts";
import { noStoreJson, requireAuthorization } from "../../_shared/http.ts";

export async function GET(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  return noStoreJson(getPointsPlatformCatalog());
}
