// @steered SNARE-2 2026-09-29

import { localApiAuthorization } from "./api/v1/_shared/http";
import PointsApp from "./points/PointsApp";

export const dynamic = "force-dynamic";

export default function Home() {
  return <PointsApp authorization={localApiAuthorization()} />;
}
