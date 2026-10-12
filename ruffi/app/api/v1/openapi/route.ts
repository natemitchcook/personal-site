// @steered SNARE-2 2026-09-29

import { noStoreJson, requireAuthorization } from "../_shared/http.ts";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Ruffi Points API",
    version: "0.1.0",
    description:
      "Provider-neutral award search, wallet optimization, and award watch API for the local Ruffi session.",
  },
  servers: [{ url: "http://localhost:3000/ruffi", description: "Local Ruffi" }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/v1/points/catalog": {
      get: {
        operationId: "getPointsCatalog",
        summary: "List supported point programs and planned loyalty connectors",
        responses: { "200": { description: "Points catalog" } },
      },
    },
    "/api/v1/points/state": {
      get: {
        operationId: "getPointsState",
        summary: "Read the local wallet, watches, notification preferences, and alerts",
        responses: { "200": { description: "Current state" } },
      },
      put: {
        operationId: "updatePointsState",
        summary: "Update the manual wallet or notification preferences",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  wallet: { $ref: "#/components/schemas/Wallet" },
                  notifications: { $ref: "#/components/schemas/NotificationPreferences" },
                  preferenceNotes: { type: "string", maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated state" } },
      },
    },
    "/api/v1/points/search": {
      post: {
        operationId: "searchAwardFlights",
        summary: "Search award availability using natural language or a structured intent",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    example: "Two business class seats from New York to Europe in July",
                  },
                  previousIntent: { $ref: "#/components/schemas/SearchIntent" },
                  intent: { $ref: "#/components/schemas/SearchIntent" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Ranked award offers" } },
      },
    },
    "/api/v1/points/watches": {
      get: {
        operationId: "listAwardWatches",
        summary: "List award watches",
        responses: { "200": { description: "Award watches" } },
      },
      post: {
        operationId: "createAwardWatch",
        summary: "Create a watch from a natural-language request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["query"],
                properties: { query: { type: "string" }, name: { type: "string" } },
              },
            },
          },
        },
        responses: { "201": { description: "Created watch" } },
      },
    },
    "/api/v1/points/watches/check": {
      post: {
        operationId: "checkAwardWatches",
        summary: "Check due watches and emit alerts for material improvements",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { force: { type: "boolean", default: false } },
              },
            },
          },
        },
        responses: { "200": { description: "Watch check results" } },
      },
    },
    "/api/v1/points/alerts": {
      get: {
        operationId: "listAwardAlerts",
        summary: "List generated award alerts",
        responses: { "200": { description: "Award alerts" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
    schemas: {
      Wallet: {
        type: "object",
        required: ["homeAirports", "balances"],
        properties: {
          homeAirports: { type: "array", items: { type: "string", pattern: "^[A-Z]{3}$" } },
          balances: {
            type: "array",
            items: {
              type: "object",
              required: ["programId", "balance"],
              properties: {
                programId: { type: "string" },
                balance: { type: "integer", minimum: 0 },
              },
            },
          },
        },
      },
      NotificationPreferences: {
        type: "object",
        properties: {
          browser: { type: "boolean" },
          emailEnabled: { type: "boolean" },
          email: { type: "string", format: "email" },
          smsEnabled: { type: "boolean" },
          phone: { type: "string", description: "E.164 phone number" },
        },
      },
      SearchIntent: {
        type: "object",
        required: ["rawQuery", "origins", "destinations", "startDate", "endDate", "cabins", "travelers", "tripType", "assumptions"],
        properties: {
          rawQuery: { type: "string" },
          origins: { type: "object" },
          destinations: { type: "object" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          cabins: { type: "array", items: { enum: ["economy", "premium_economy", "business", "first"] } },
          travelers: { type: "integer", minimum: 1, maximum: 9 },
          maxStops: { type: "integer", minimum: 0 },
          maxPoints: { type: "integer", minimum: 0 },
          sources: { type: "array", items: { type: "string" }, maxItems: 20 },
          carriers: {
            type: "array",
            items: { type: "string", pattern: "^[A-Z0-9]{2,3}$" },
            maxItems: 20,
          },
          departureTime: {
            type: "object",
            required: ["earliestMinutes", "latestMinutes", "label"],
            properties: {
              earliestMinutes: { type: "integer", minimum: 0, maximum: 1439 },
              latestMinutes: { type: "integer", minimum: 0, maximum: 1439 },
              label: { type: "string" },
            },
          },
          tripType: { enum: ["one_way", "round_trip"] },
          assumptions: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export async function GET(request: Request) {
  const unauthorized = requireAuthorization(request);
  if (unauthorized) return unauthorized;
  return noStoreJson(spec);
}
