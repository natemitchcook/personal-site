// @steered SNARE-2 2026-09-29

import { randomUUID } from "node:crypto";
import { readPointsState, updatePointsState } from "../../../lib/storage/pointsStore.ts";
import { deliverAlert, type NotificationDelivery } from "./notifications.ts";
import {
  interpretNaturalLanguageSearch,
  offerFingerprint,
  searchAwards,
  validateIntent,
} from "./service.ts";
import type { AwardWatch, RankedAwardOffer, SearchIntent, WatchAlert } from "./types.ts";

function intervalMilliseconds(startDate: string): number {
  const days = (Date.parse(`${startDate}T00:00:00Z`) - Date.now()) / 86_400_000;
  if (days <= 14) return 30 * 60 * 1000;
  if (days <= 90) return 3 * 60 * 60 * 1000;
  return 12 * 60 * 60 * 1000;
}

function nextCheck(startDate: string): string {
  return new Date(Date.now() + intervalMilliseconds(startDate)).toISOString();
}

function snapshot(offer: RankedAwardOffer, checkedAt: string) {
  return {
    offerId: offer.id,
    fingerprint: offerFingerprint(offer),
    totalPoints: offer.totalPoints,
    totalTaxes: offer.totalTaxes,
    seats: offer.seats,
    checkedAt,
  };
}

async function persistAwardWatch(intent: SearchIntent, name?: string): Promise<AwardWatch> {
  const state = await readPointsState();
  const result = await searchAwards(intent, state.wallet, state.preferenceNotes);
  const now = new Date().toISOString();
  const watch: AwardWatch = {
    id: randomUUID(),
    name: name?.trim().slice(0, 100) || `${intent.origins.label} to ${intent.destinations.label}`,
    enabled: true,
    intent,
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: now,
    nextCheckAt: nextCheck(intent.startDate),
    lastBest: result.offers[0] ? snapshot(result.offers[0], now) : undefined,
  };
  await updatePointsState((current) => ({ ...current, watches: [watch, ...current.watches].slice(0, 100) }));
  return watch;
}

export async function createAwardWatch(query: string, name?: string): Promise<AwardWatch> {
  const state = await readPointsState();
  const interpreted = await interpretNaturalLanguageSearch(query, state.wallet.homeAirports);
  return persistAwardWatch(interpreted.intent, name);
}

export async function createAwardWatchFromIntent(
  intent: SearchIntent,
  name?: string
): Promise<AwardWatch> {
  return persistAwardWatch(validateIntent(intent), name);
}

export async function deleteAwardWatch(id: string): Promise<boolean> {
  let deleted = false;
  await updatePointsState((state) => {
    const watches = state.watches.filter((watch) => watch.id !== id);
    deleted = watches.length !== state.watches.length;
    return { ...state, watches };
  });
  return deleted;
}

export async function setAwardWatchEnabled(id: string, enabled: boolean): Promise<AwardWatch | undefined> {
  let result: AwardWatch | undefined;
  await updatePointsState((state) => ({
    ...state,
    watches: state.watches.map((watch) => {
      if (watch.id !== id) return watch;
      result = { ...watch, enabled, updatedAt: new Date().toISOString(), nextCheckAt: nextCheck(watch.intent.startDate) };
      return result;
    }),
  }));
  return result;
}

function detectAlert(watch: AwardWatch, best: RankedAwardOffer | undefined, now: string): WatchAlert | undefined {
  if (!best) return undefined;
  const base = {
    id: randomUUID(),
    watchId: watch.id,
    createdAt: now,
    offer: best,
  };
  if (!watch.lastBest) {
    return {
      ...base,
      kind: "availability_found",
      title: `Ruffi found seats for ${watch.name}`,
      message: `${best.seats} seat${best.seats === 1 ? "" : "s"} at ${best.totalPoints.toLocaleString()} points plus ${best.currency} ${best.totalTaxes.toFixed(0)}.`,
    };
  }
  if (best.totalPoints < watch.lastBest.totalPoints) {
    const savings = watch.lastBest.totalPoints - best.totalPoints;
    return {
      ...base,
      kind: "points_dropped",
      title: `Ruffi found a cheaper redemption for ${watch.name}`,
      message: `The best option dropped by ${savings.toLocaleString()} points to ${best.totalPoints.toLocaleString()} points.`,
    };
  }
  if (best.totalTaxes + 25 < watch.lastBest.totalTaxes) {
    return {
      ...base,
      kind: "taxes_dropped",
      title: `Ruffi found lower fees for ${watch.name}`,
      message: `Taxes and fees dropped from ${watch.lastBest.totalTaxes.toFixed(0)} to ${best.totalTaxes.toFixed(0)} ${best.currency}.`,
    };
  }
  if (best.seats > watch.lastBest.seats) {
    return {
      ...base,
      kind: "more_seats",
      title: `More award seats opened for ${watch.name}`,
      message: `${best.seats} seats are now available at ${best.totalPoints.toLocaleString()} points.`,
    };
  }
  return undefined;
}

export async function checkAwardWatches(force = false): Promise<{
  checked: number;
  alerts: WatchAlert[];
  deliveries: NotificationDelivery[];
}> {
  const state = await readPointsState();
  const due = state.watches
    .filter(
      (watch) => watch.enabled && (force || Date.parse(watch.nextCheckAt) <= Date.now())
    )
    .slice(0, 20);
  const updates = new Map<string, AwardWatch>();
  const alerts: WatchAlert[] = [];

  for (const watch of due) {
    const now = new Date().toISOString();
    try {
      const result = await searchAwards(watch.intent, state.wallet, state.preferenceNotes);
      const best = result.offers[0];
      const alert = result.provider.live ? detectAlert(watch, best, now) : undefined;
      if (alert) alerts.push(alert);
      updates.set(watch.id, {
        ...watch,
        updatedAt: now,
        lastCheckedAt: now,
        nextCheckAt: nextCheck(watch.intent.startDate),
        lastError: undefined,
        lastBest: best ? snapshot(best, now) : watch.lastBest,
      });
    } catch (error) {
      updates.set(watch.id, {
        ...watch,
        updatedAt: now,
        lastCheckedAt: now,
        nextCheckAt: nextCheck(watch.intent.startDate),
        lastError: error instanceof Error ? error.message.slice(0, 300) : "Search failed.",
      });
    }
  }

  if (updates.size > 0 || alerts.length > 0) {
    await updatePointsState((current) => ({
      ...current,
      watches: current.watches.map((watch) => updates.get(watch.id) ?? watch),
      alerts: [...alerts, ...current.alerts].slice(0, 500),
    }));
  }

  const deliveries = (
    await Promise.all(alerts.map((alert) => deliverAlert(alert, state.notifications)))
  ).flat();
  return { checked: due.length, alerts, deliveries };
}
