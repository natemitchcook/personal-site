// @steered SNARE-2 2026-09-29

import type { AwardOffer, SearchIntent } from "../types.ts";

export type AwardProviderResult = {
  offers: AwardOffer[];
  provider: {
    id: string;
    name: string;
    live: boolean;
    message: string;
  };
};

export interface AwardSearchProvider {
  id: string;
  name: string;
  live: boolean;
  search(intent: SearchIntent): Promise<AwardProviderResult>;
}

export class AwardProviderError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "AwardProviderError";
    this.status = status;
  }
}
