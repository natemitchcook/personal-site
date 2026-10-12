// @steered SNARE-2 2026-09-29

import { bankProgramFromProviderName, pointProgram, pointProgramByProviderCode } from "./catalog.ts";
import type { AwardOffer, FundingPlan, RankedAwardOffer, WalletBalance } from "./types.ts";

function balanceFor(balances: WalletBalance[], programId: string): number {
  return balances.find((balance) => balance.programId === programId)?.balance ?? 0;
}

export function buildFundingPlan(
  offer: AwardOffer,
  travelers: number,
  balances: WalletBalance[]
): FundingPlan {
  const requiredPoints = offer.pointsPerTraveler * travelers;
  const airlineProgram = pointProgramByProviderCode(offer.loyaltyProgramCode);
  const directBalance = airlineProgram ? balanceFor(balances, airlineProgram.id) : 0;
  const directPoints = Math.min(requiredPoints, directBalance);
  const remaining = requiredPoints - directPoints;

  const candidates = offer.transferOptions
    .map((transfer) => {
      const bank = pointProgram(transfer.programId) ?? bankProgramFromProviderName(transfer.programName);
      if (!bank) return undefined;
      const balance = balanceFor(balances, bank.id);
      const multiplier = 1 + Math.max(0, transfer.bonusPercentage) / 100;
      return { bank, balance, needed: Math.ceil(remaining / multiplier), bonus: transfer.bonusPercentage };
    })
    .filter(Boolean)
    .sort((left, right) => left!.needed - right!.needed || right!.balance - left!.balance);

  const funded = candidates.find((candidate) => candidate!.balance >= candidate!.needed);
  const steps: FundingPlan["steps"] = [];
  if (directPoints > 0 && airlineProgram) {
    steps.push({
      programId: airlineProgram.id,
      programName: airlineProgram.shortName,
      points: directPoints,
      action: "use",
    });
  }

  if (remaining === 0) {
    return {
      covered: true,
      requiredPoints,
      availablePoints: directBalance,
      shortfall: 0,
      steps,
      summary: `Book with ${requiredPoints.toLocaleString()} ${offer.loyaltyProgramName} points already in your account.`,
    };
  }

  if (funded) {
    steps.push({
      programId: funded.bank.id,
      programName: funded.bank.shortName,
      points: funded.needed,
      action: "transfer",
      destinationProgram: offer.loyaltyProgramName,
      bonusPercentage: funded.bonus,
    });
    return {
      covered: true,
      requiredPoints,
      availablePoints: directBalance + funded.balance,
      shortfall: 0,
      steps,
      summary: directPoints > 0
        ? `Use ${directPoints.toLocaleString()} existing points, then transfer ${funded.needed.toLocaleString()} from ${funded.bank.shortName}.`
        : `Transfer ${funded.needed.toLocaleString()} points from ${funded.bank.shortName} to ${offer.loyaltyProgramName}.`,
    };
  }

  const candidate = candidates[0];
  const shortfall = Math.max(0, (candidate?.needed ?? remaining) - (candidate?.balance ?? 0));
  return {
    covered: false,
    requiredPoints,
    availablePoints: directBalance + (candidate?.balance ?? 0),
    shortfall,
    steps,
    summary: candidate
      ? `You are about ${shortfall.toLocaleString()} ${candidate.bank.shortName} points short.`
      : "No compatible transfer balance is in your wallet yet.",
  };
}

export function rankAwardOffers(
  offers: AwardOffer[],
  travelers: number,
  balances: WalletBalance[]
): RankedAwardOffer[] {
  return offers
    .map((offer) => {
      const totalPoints = offer.pointsPerTraveler * travelers;
      const totalTaxes = offer.taxesPerTraveler * travelers;
      const funding = buildFundingPlan(offer, travelers, balances);
      const cabinPenalty = { first: 0, business: 500, premium_economy: 1500, economy: 2500 }[offer.cabin];
      const score =
        totalPoints +
        cabinPenalty +
        (funding.covered ? 0 : 100_000 + funding.shortfall) +
        offer.stops * 7_500 +
        Math.round(totalTaxes * 20) +
        (offer.taxesKnown === false ? 2_500 : 0) +
        (offer.live ? 0 : 3_000);
      const reasons = [
        funding.covered ? "Your wallet can cover this redemption." : funding.summary,
        offer.stops === 0 ? "Nonstop itinerary." : `${offer.stops} stop${offer.stops === 1 ? "" : "s"}.`,
      ];
      if ((offer.premiumCabinPercentage ?? 100) < 100) {
        reasons.push(`${offer.premiumCabinPercentage}% is in the requested premium cabin.`);
      }
      return { ...offer, totalPoints, totalTaxes, funding, score, reasons };
    })
    .sort((left, right) => left.score - right.score);
}
