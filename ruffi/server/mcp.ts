#!/usr/bin/env node
// @steered SNARE-2 2026-09-29

import readline from "node:readline";
import { readPointsState, sanitizePreferenceNotes, sanitizeWallet, updatePointsState } from "../lib/storage/pointsStore.ts";
import {
  getPointsPlatformCatalog,
  interpretNaturalLanguageSearch,
  searchNaturalLanguage,
} from "../packages/points/src/service.ts";
import type { SearchIntent } from "../packages/points/src/types.ts";
import { checkAwardWatches, createAwardWatch } from "../packages/points/src/watches.ts";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2024-11-05"] as const;
const PROTOCOL_VERSION = PROTOCOL_VERSIONS[0];

const tools = [
  {
    name: "ruffi_get_catalog",
    description: "List point programs, current award data adapters, and Ruffi's planned direct loyalty connectors.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ruffi_get_wallet",
    description: "Read the user's locally stored home airports and manually entered point balances.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ruffi_update_wallet",
    description: "Replace the user's home airports and manual point balances.",
    inputSchema: {
      type: "object",
      required: ["homeAirports", "balances"],
      properties: {
        homeAirports: { type: "array", items: { type: "string" }, maxItems: 8 },
        preferenceNotes: { type: "string", maxLength: 2000 },
        balances: {
          type: "array",
          items: {
            type: "object",
            required: ["programId", "balance"],
            properties: { programId: { type: "string" }, balance: { type: "integer", minimum: 0 } },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "ruffi_parse_search",
    description:
      "Use local Ollama with deterministic fallback to parse or refine a natural-language award request without running provider search.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", maxLength: 500 },
        previousIntent: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "ruffi_search_awards",
    description: "Search and rank award-flight options against the user's point wallet.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", maxLength: 500 },
        previousIntent: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "ruffi_create_watch",
    description: "Create a recurring award-availability watch from a natural-language request.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string", maxLength: 500 }, name: { type: "string", maxLength: 100 } },
      additionalProperties: false,
    },
  },
  {
    name: "ruffi_list_watches",
    description: "List award watches and recent alerts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ruffi_check_watches",
    description: "Check due watches, or force an immediate check, and return any material award improvements.",
    inputSchema: {
      type: "object",
      properties: { force: { type: "boolean", default: false } },
      additionalProperties: false,
    },
  },
];

type RequestMessage = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function output(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: RequestMessage["id"], value: unknown) {
  output({ jsonrpc: "2.0", id, result: value });
}

function error(id: RequestMessage["id"], code: number, message: string) {
  output({ jsonrpc: "2.0", id, error: { code, message } });
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "ruffi_get_catalog") return getPointsPlatformCatalog();
  if (name === "ruffi_get_wallet") {
    const state = await readPointsState();
    return { wallet: state.wallet, preferenceNotes: state.preferenceNotes };
  }
  if (name === "ruffi_update_wallet") {
    const wallet = sanitizeWallet(args);
    const preferenceNotes =
      args.preferenceNotes === undefined
        ? undefined
        : sanitizePreferenceNotes(args.preferenceNotes);
    const state = await updatePointsState((current) => ({
      ...current, wallet, preferenceNotes: preferenceNotes ?? current.preferenceNotes,
    }));
    return { wallet: state.wallet };
  }
  if (name === "ruffi_parse_search") {
    if (typeof args.query !== "string") throw new Error("query is required");
    const state = await readPointsState();
    const previousIntent =
      args.previousIntent && typeof args.previousIntent === "object"
        ? (args.previousIntent as SearchIntent)
        : undefined;
    const interpreted = await interpretNaturalLanguageSearch(
      args.query,
      state.wallet.homeAirports,
      previousIntent
    );
    return { ...interpreted, preferenceNotes: state.preferenceNotes };
  }
  if (name === "ruffi_search_awards") {
    if (typeof args.query !== "string") throw new Error("query is required");
    const state = await readPointsState();
    const previousIntent =
      args.previousIntent && typeof args.previousIntent === "object"
        ? (args.previousIntent as SearchIntent)
        : undefined;
    return searchNaturalLanguage(
      args.query,
      state.wallet,
      state.preferenceNotes,
      undefined,
      previousIntent
    );
  }
  if (name === "ruffi_create_watch") {
    if (typeof args.query !== "string") throw new Error("query is required");
    return {
      watch: await createAwardWatch(args.query, typeof args.name === "string" ? args.name : undefined),
    };
  }
  if (name === "ruffi_list_watches") {
    const state = await readPointsState();
    return { watches: state.watches, alerts: state.alerts };
  }
  if (name === "ruffi_check_watches") {
    return checkAwardWatches(args.force === true);
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message: RequestMessage) {
  if (message.method === "initialize") {
    const requestedVersion = message.params?.protocolVersion;
    const negotiatedVersion =
      typeof requestedVersion === "string" &&
      PROTOCOL_VERSIONS.includes(requestedVersion as (typeof PROTOCOL_VERSIONS)[number])
        ? requestedVersion
        : PROTOCOL_VERSION;
    result(message.id, {
      protocolVersion: negotiatedVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ruffi-points", version: "0.1.0", title: "Ruffi Points" },
      instructions:
        "Use Ruffi to inspect a manual points wallet, search award flights, and create watches. Never claim demo inventory is live, and tell the user to verify availability before transferring points.",
    });
    return;
  }
  if (message.method === "ping") {
    result(message.id, {});
    return;
  }
  if (message.method === "tools/list") {
    result(message.id, { tools });
    return;
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments;
    if (typeof name !== "string") {
      error(message.id, -32602, "Tool name is required.");
      return;
    }
    try {
      const value = await callTool(
        name,
        args && typeof args === "object" ? (args as Record<string, unknown>) : {}
      );
      result(message.id, textResult(value));
    } catch (toolError) {
      result(message.id, {
        content: [
          {
            type: "text",
            text: toolError instanceof Error ? toolError.message : "Tool call failed.",
          },
        ],
        isError: true,
      });
    }
    return;
  }
  if (message.id !== undefined) error(message.id, -32601, `Method not found: ${message.method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
input.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const message = JSON.parse(trimmed) as RequestMessage;
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      error(message.id, -32600, "Invalid JSON-RPC request.");
      return;
    }
    void handle(message).catch((failure) => {
      error(message.id, -32603, failure instanceof Error ? failure.message : "Internal error.");
    });
  } catch {
    error(null, -32700, "Parse error.");
  }
});
