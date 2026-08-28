# syntax=docker/dockerfile:1
#
# Multi-stage build for the OCI ARM VM deployment described in
# docs/40-delivery/02-devops-and-cicd.md §4/§6. Debian slim, not Alpine — argon2 is a
# native module and this avoids any musl-vs-glibc prebuilt-binary surprise on arm64,
# which oracledb's Thin mode (pure JavaScript, no native driver) never risked in the
# first place.

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

# ---- dependencies (cached separately from source so a code-only change doesn't reinstall) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- production dependencies only ----
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
