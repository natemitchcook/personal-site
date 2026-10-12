# Ruffi

Ruffi searches award availability, ranks options against a points wallet, and creates alerts for meaningful improvements.

This directory intentionally contains only the points product. The earlier Gmail and broad travel-concierge experiments remain in the archived `travel-agent` repository.

## Run locally

From the personal-site repository:

```bash
npm install --prefix ruffi
npm run dev
```

Open `http://localhost:3000/ruffi`.

The local app uses:

- Seats.aero for cached award availability
- deterministic TypeScript for validation, funding math, filters, watches and alerts
- local Ollama for optional natural-language intent refinement
- TypeSafe Jev for optional preference-aware ranking

Local credentials live in `ruffi/.data/credentials.txt`, which is ignored by Git and must use owner-only permissions. This credential-file path is not for deployment. A hosted version will retrieve vendor credentials from a managed secret store.

## Checks

```bash
npm run test:ruffi
npm run build:ruffi
```

## Project guidance

The installed TypeSafe skill is in `.agents/skills/typesafe-ai`. Read it and the live TypeSafe documentation before changing Jev integration behavior.
