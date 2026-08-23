# Masjid OS — Backend

Node.js API for the Masjid OS mosque management platform.

**No web framework.** The router, middleware chain, request context and lifecycle are
written and owned by this project on `node:http`
([ADR-0009](../docs/10-architecture/adr/0009-pure-node-http-server.md)).

**No ORM.** Hand-written SQL behind repository interfaces, over `oracledb` in Thin mode
([ADR-0002](../docs/10-architecture/adr/0002-oracle-with-portable-repository-layer.md)).

Frontend: [`frontend`](../frontend) — separate repository.
Design documentation: [`docs`](../docs).

## Getting started

```bash
pnpm install
cp .env.example .env        # set ORACLE_PASSWORD and JWT_SECRET
pnpm db:up                  # first Oracle start takes several minutes
pnpm migrate
pnpm dev
```

Watch the first database start with `docker compose logs -f oracle` and wait for
`DATABASE IS READY TO USE`. That is expected, not a hang.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Run the API with reload |
| `pnpm test` | Unit tests |
| `pnpm test:int` | Integration tests (needs Oracle running) |
| `pnpm migrate` | Apply pending migrations |
| `pnpm openapi` | Regenerate `openapi.json` — the frontend's contract |
| `pnpm typecheck` / `pnpm lint` | Static checks |

## Contract

`openapi.json` is generated from the route table and Zod schemas, and **committed**. The
frontend generates its API types from it. A contract change is therefore a visible diff
here, and a required `contract:sync` there ([ADR-0011](../docs/10-architecture/adr/0011-separate-repositories.md)).
