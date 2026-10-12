// @steered SNARE-2 2026-09-29

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CREDENTIAL_PATH = path.join(process.cwd(), ".data", "credentials.txt");

type CredentialMap = Map<string, string>;

let cache:
  | {
      path: string;
      loadedAt: number;
      values: CredentialMap;
    }
  | undefined;

function credentialPath(): string {
  const configured = process.env.RUFFI_LOCAL_CREDENTIAL_FILE?.trim();
  const resolved = path.resolve(configured || DEFAULT_CREDENTIAL_PATH);
  const home = path.resolve(os.homedir());
  if (resolved !== home && !resolved.startsWith(`${home}${path.sep}`)) {
    throw new Error("The local credential file must be inside your home directory.");
  }
  return resolved;
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCredentialFile(contents: string): CredentialMap {
  const values = new Map<string, string>();
  const trimmed = contents.trim();
  if (!trimmed) return values;

  if (trimmed.startsWith("{")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The local credential file must contain an object or labeled lines.");
    }
    for (const [label, value] of Object.entries(parsed)) {
      if (typeof value === "string") values.set(normalizeLabel(label), value.trim());
    }
    return values;
  }

  for (const line of contents.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate || candidate.startsWith("#")) continue;
    const separator = candidate.search(/[:=]/);
    if (separator < 1) continue;
    const label = normalizeLabel(candidate.slice(0, separator));
    const value = candidate.slice(separator + 1).trim();
    if (label && value) values.set(label, value);
  }
  return values;
}

async function credentials(): Promise<CredentialMap> {
  const filePath = credentialPath();
  if (cache && cache.path === filePath && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.values;
  }

  let details;
  try {
    details = await stat(filePath);
  } catch {
    cache = { path: filePath, loadedAt: Date.now(), values: new Map() };
    return cache.values;
  }
  if (!details.isFile() || details.size > MAX_CREDENTIAL_FILE_BYTES) {
    throw new Error("The local credential file is invalid or too large.");
  }
  if ((details.mode & 0o077) !== 0) {
    throw new Error("Protect the local credential file with chmod 600 before using it.");
  }

  const values = parseCredentialFile(await readFile(filePath, "utf8"));
  cache = { path: filePath, loadedAt: Date.now(), values };
  return values;
}

const ALIASES: Record<string, string[]> = {
  seats_aero_api_key: [
    "seats_aero_api_key",
    "seats_api_key",
    "seats_aero_key",
    "seats_key",
  ],
  pointsyeah_api_key: ["pointsyeah_api_key", "points_yeah_api_key"],
  typesafe_api_key: ["typesafe_api_key", "jev_api_key"],
  resend_api_key: ["resend_api_key"],
  twilio_account_sid: ["twilio_account_sid"],
  twilio_auth_token: ["twilio_auth_token"],
};

export async function getLocalCredential(name: keyof typeof ALIASES): Promise<string | undefined> {
  const values = await credentials();
  for (const alias of ALIASES[name]) {
    const value = values.get(alias);
    if (value && value.length >= 8 && value.length <= 4096 && !/^<.*>$/.test(value)) {
      return value;
    }
  }
  return undefined;
}

export function localCredentialFileConfigured(): boolean {
  return existsSync(credentialPath());
}

export function resetLocalCredentialsCacheForTests(): void {
  cache = undefined;
}
