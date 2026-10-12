// @steered SNARE-2 2026-09-29

import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { CompactEncrypt, compactDecrypt } from "jose";
import { DEFAULT_WALLET_PROGRAM_IDS, POINT_PROGRAMS } from "../../packages/points/src/catalog.ts";
import type { NotificationPreferences, RuffiPointsState, Wallet } from "../../packages/points/src/types.ts";

const DATA_DIRECTORY = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIRECTORY, "ruffi-points.v1.jwe");
const KEY_PATH = path.join(DATA_DIRECTORY, "ruffi-points.v1.key");
const MAX_PLAINTEXT_BYTES = 2 * 1024 * 1024;
let writeQueue = Promise.resolve();

function defaultState(): RuffiPointsState {
  return {
    schemaVersion: 1,
    wallet: {
      homeAirports: ["JFK", "EWR"],
      balances: DEFAULT_WALLET_PROGRAM_IDS.map((programId) => ({ programId, balance: 0 })),
    },
    notifications: {
      browser: true,
      emailEnabled: false,
      smsEnabled: false,
    },
    watches: [],
    alerts: [],
    updatedAt: new Date().toISOString(),
    preferenceNotes: "",
  };
}

async function encryptionKey(): Promise<Uint8Array> {
  await mkdir(DATA_DIRECTORY, { recursive: true, mode: 0o700 });
  try {
    const details = await stat(KEY_PATH);
    if (!details.isFile() || details.size !== 32) throw new Error("Invalid key file");
    return new Uint8Array(await readFile(KEY_PATH));
  } catch {
    const key = randomBytes(32);
    try {
      await writeFile(KEY_PATH, key, { flag: "wx", mode: 0o600 });
    } catch {
      const existing = await readFile(KEY_PATH);
      if (existing.length !== 32) throw new Error("Invalid local points key.");
      return new Uint8Array(existing);
    }
    return new Uint8Array(key);
  }
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validState(value: unknown): value is RuffiPointsState {
  if (!value || typeof value !== "object") return false;
  const state = value as RuffiPointsState;
  return (
    state.schemaVersion === 1 &&
    isIso(state.updatedAt) &&
    Boolean(state.wallet) &&
    Array.isArray(state.wallet.homeAirports) &&
    state.wallet.homeAirports.length <= 8 &&
    state.wallet.homeAirports.every((airport) => /^[A-Z]{3}$/.test(airport)) &&
    Array.isArray(state.wallet.balances) &&
    state.wallet.balances.length <= POINT_PROGRAMS.length &&
    state.wallet.balances.every(
      (balance) =>
        POINT_PROGRAMS.some((program) => program.id === balance.programId) &&
        Number.isSafeInteger(balance.balance) &&
        balance.balance >= 0 &&
        balance.balance <= 100_000_000
    ) &&
    Boolean(state.notifications) &&
    typeof state.notifications.browser === "boolean" &&
    typeof state.notifications.emailEnabled === "boolean" &&
    typeof state.preferenceNotes === "string" &&
    state.preferenceNotes.length <= 2000 &&
    typeof state.notifications.smsEnabled === "boolean" &&
    Array.isArray(state.watches) &&
    state.watches.length <= 100 &&
    Array.isArray(state.alerts) &&
    state.alerts.length <= 500
  );
}

export async function readPointsState(): Promise<RuffiPointsState> {
  try {
    const details = await stat(STORE_PATH);
    if (!details.isFile() || details.size > MAX_PLAINTEXT_BYTES * 2) return defaultState();
    const encrypted = await readFile(STORE_PATH, "utf8");
    const { plaintext, protectedHeader } = await compactDecrypt(encrypted, await encryptionKey(), {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    if (protectedHeader.typ !== "ruffi-points+jwe" || plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
      return defaultState();
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    return validState(value) ? value : defaultState();
  } catch {
    return defaultState();
  }
}

async function writeState(state: RuffiPointsState): Promise<void> {
  const value = { ...state, updatedAt: new Date().toISOString() };
  if (!validState(value)) throw new Error("Refusing to persist invalid points data.");
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error("Points data exceeds the local limit.");
  const encrypted = await new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "ruffi-points+jwe" })
    .encrypt(await encryptionKey());
  const temporaryPath = path.join(DATA_DIRECTORY, `ruffi-points.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, encrypted, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, STORE_PATH);
    await chmod(STORE_PATH, 0o600);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function updatePointsState(
  updater: (state: RuffiPointsState) => RuffiPointsState | Promise<RuffiPointsState>
): Promise<RuffiPointsState> {
  let result: RuffiPointsState | undefined;
  const operation = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await readPointsState();
      result = await updater(current);
      await writeState(result);
    });
  writeQueue = operation.catch(() => undefined);
  await operation;
  return result!;
}

export function sanitizeWallet(value: unknown): Wallet {
  if (!value || typeof value !== "object") throw new Error("A wallet is required.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.homeAirports) || !Array.isArray(input.balances)) {
    throw new Error("Wallet airports and balances are required.");
  }
  const homeAirports = [...new Set(input.homeAirports)]
    .filter((airport): airport is string => typeof airport === "string")
    .map((airport) => airport.trim().toUpperCase())
    .filter((airport) => /^[A-Z]{3}$/.test(airport))
    .slice(0, 8);
  if (homeAirports.length === 0) throw new Error("Add at least one home airport.");
  const balances = input.balances.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const programId = typeof item.programId === "string" ? item.programId : "";
    const balance = typeof item.balance === "number" ? item.balance : Number(item.balance);
    if (!POINT_PROGRAMS.some((program) => program.id === programId)) return [];
    if (!Number.isSafeInteger(balance) || balance < 0 || balance > 100_000_000) return [];
    return [{ programId, balance }];
  });
  return { homeAirports, balances };
}

export function sanitizeNotifications(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object") throw new Error("Notification preferences are required.");
  const input = value as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase().slice(0, 254) : undefined;
  const phone = typeof input.phone === "string" ? input.phone.trim().slice(0, 20) : undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Use an E.164 phone number such as +12125551212.");
  return {
    browser: input.browser !== false,
    emailEnabled: input.emailEnabled === true && Boolean(email),
    email,
    smsEnabled: input.smsEnabled === true && Boolean(phone),
    phone,
  };
}

export function sanitizePreferenceNotes(value: unknown): string {
  if (typeof value !== "string") throw new Error("Preference notes must be text.");
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 2000);
}
