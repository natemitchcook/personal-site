// @steered SNARE-2 2026-09-29

import { getLocalCredential } from "./providers/localCredentials.ts";
import type { RankedAwardOffer, SearchIntent, SearchResult } from "./types.ts";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" ? (value as UnknownRecord) : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 200 ? value : undefined;
}

function offerDescription(offer: RankedAwardOffer): string {
  return [
    `${offer.loyaltyProgramName} from ${offer.origin} to ${offer.destination} on ${offer.departureDate}`,
    `${offer.cabin}, ${offer.stops} stops, ${offer.seats} seats`,
    `${offer.totalPoints} total points and ${offer.totalTaxes} ${offer.currency} taxes`,
    `funding: ${offer.funding.summary}`,
    offer.premiumCabinPercentage === undefined
      ? undefined
      : `${offer.premiumCabinPercentage}% in requested premium cabin`,
  ]
    .filter(Boolean)
    .join("; ");
}

export async function applyPreferenceDecision(
  offers: RankedAwardOffer[],
  intent: SearchIntent,
  preferenceNotes: string
): Promise<{
  offers: RankedAwardOffer[];
  decisioning: NonNullable<SearchResult["decisioning"]>;
}> {
  const apiKey = await getLocalCredential("typesafe_api_key");
  const baseUrl = process.env.TYPESAFE_BASE_URL?.trim() || "https://api.typesafe.ai";
  const model = process.env.JEV_MODEL?.trim() || "jev-latest";

  if (!apiKey || offers.length < 2 || preferenceNotes.trim().length < 3) {
    return {
      offers,
      decisioning: {
        engine: "deterministic",
        message: apiKey
          ? "Deterministic ranking used because no preference profile was provided."
          : "Deterministic ranking used. Add typesafe_api_key to the protected Ruffi credential file to enable Jev preference matching.",
      },
    };
  }

  const candidates = offers.slice(0, 8);
  const criteria = Object.fromEntries([
    ...candidates.map((offer, index) => [`offer_${index + 1}`, offerDescription(offer)]),
    ["none_of_the_above", "No candidate clearly fits the stated request and preferences."],
  ]);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        state: {
          request: intent.rawQuery,
          user_preferences: preferenceNotes.slice(0, 2000),
          candidates: candidates.map((offer, index) => ({
            id: `offer_${index + 1}`,
            description: offerDescription(offer),
          })),
        },
        questions: {
          best_offer: {
            type: "choice",
            instructions:
              "Choose the candidate that best matches the user's stated preferences. Respect the supplied facts, do not invent benefits, and use none_of_the_above when the preference evidence is insufficient.",
            criteria,
          },
          needs_review: {
            type: "noul",
            instructions:
              "Does selecting a best candidate require an important assumption not supported by the request, preferences, or candidate facts?",
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Jev returned ${response.status}.`);
    const responseBody = await response.text();
    if (Buffer.byteLength(responseBody, "utf8") > 64 * 1024) {
      throw new Error("Jev returned too much data.");
    }
    const payload = record(JSON.parse(responseBody));
    const answers = record(payload?.answers);
    const bestAnswer = record(answers?.best_offer);
    const reviewAnswer = record(answers?.needs_review);
    const selected = text(bestAnswer?.choice);
    const confidence = number(bestAnswer?.confidence);
    const needsReviewProbability = number(reviewAnswer?.noul);
    const selectedIndex = selected?.match(/^offer_([1-8])$/)?.[1];
    const selectedOffer = selectedIndex ? candidates[Number(selectedIndex) - 1] : undefined;
    const shouldApply = Boolean(
      selectedOffer &&
        confidence !== undefined &&
        confidence >= 0.7 &&
        (needsReviewProbability ?? 0) < 0.65
    );

    if (!shouldApply || !selectedOffer) {
      return {
        offers,
        decisioning: {
          engine: "jev",
          confidence,
          needsReview: (needsReviewProbability ?? 0) >= 0.65,
          message: "Jev did not find a confident preference-based reason to override deterministic ranking.",
        },
      };
    }

    const reranked = [
      { ...selectedOffer, reasons: ["Jev matched this option to your stated preferences.", ...selectedOffer.reasons] },
      ...offers.filter((offer) => offer.id !== selectedOffer.id),
    ];
    return {
      offers: reranked,
      decisioning: {
        engine: "jev",
        selectedOfferId: selectedOffer.id,
        confidence,
        needsReview: false,
        message: "Jev selected the top option from Ruffi's deterministically eligible candidates.",
      },
    };
  } catch {
    return {
      offers,
      decisioning: {
        engine: "deterministic",
        message: "Jev was unavailable, so Ruffi kept the deterministic ranking.",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
