// @steered SNARE-2 2026-09-29

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 64 * 1024;
const TOKEN_SYMBOL = Symbol.for("ruffi.localApiToken");
const RATE_LIMIT_SYMBOL = Symbol.for("ruffi.rateLimits");

type RateBucket = { count: number; resetsAt: number };
type RuffiGlobals = typeof globalThis & {
  [TOKEN_SYMBOL]?: string;
  [RATE_LIMIT_SYMBOL]?: Map<string, RateBucket>;
};

function localToken(): string {
  const globals = globalThis as RuffiGlobals;
  globals[TOKEN_SYMBOL] ??= randomBytes(32).toString("base64url");
  return globals[TOKEN_SYMBOL];
}

export function localApiAuthorization(): string {
  return `Bearer ${localToken()}`;
}

export function authorized(request: Request): boolean {
  const expected = localToken();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireAuthorization(request: Request): NextResponse | undefined {
  if (authorized(request)) return undefined;
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Use a valid Ruffi API bearer token." } },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
  );
}

export function requireRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMilliseconds: number
): NextResponse | undefined {
  const globals = globalThis as RuffiGlobals;
  globals[RATE_LIMIT_SYMBOL] ??= new Map();
  const buckets = globals[RATE_LIMIT_SYMBOL];
  const authorization = request.headers.get("authorization") ?? "";
  const caller = createHash("sha256").update(authorization).digest("hex").slice(0, 20);
  const key = `${scope}:${caller}`;
  const now = Date.now();
  const existing = buckets.get(key);
  const bucket =
    !existing || existing.resetsAt <= now
      ? { count: 0, resetsAt: now + windowMilliseconds }
      : existing;
  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > 1000) {
    for (const [candidate, value] of buckets) {
      if (value.resetsAt <= now) buckets.delete(candidate);
    }
  }
  if (bucket.count <= limit) return undefined;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetsAt - now) / 1000));
  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: "Ruffi is searching too quickly. Try again in a moment.",
      },
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error("Request body is too large.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    throw new Error("Request body is too large.");
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function apiError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  return NextResponse.json(
    { error: { code: status >= 500 ? "provider_error" : "invalid_request", message } },
    { status }
  );
}

export function noStoreJson(value: unknown, init?: ResponseInit) {
  const response = NextResponse.json(value, init);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
