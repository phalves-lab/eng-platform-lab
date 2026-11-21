ARG NODE_IMAGE=node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm run build -w @lab/contracts -w @lab/database -w @lab/flow -w @lab/dora \
      -w @lab/telemetry -w @lab/eng-metrics -w @lab/portal-worker
RUN set -eu; \
    for dir in packages/contracts packages/database packages/flow packages/dora \
               packages/telemetry tools/eng-metrics apps/portal-worker; do \
      mkdir -p "/out/$dir"; cp "$dir/package.json" "/out/$dir/"; cp -r "$dir/dist" "/out/$dir/"; \
    done; \
    cp -r packages/database/migrations /out/packages/database/; \
    cp -r package.json catalog fixtures /out/

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY . .
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund -w @lab/portal-worker \
 && find . -name node_modules -type d -prune | while read -r dir; do \
      mkdir -p "/out/$(dirname "$dir")"; cp -a "$dir" "/out/$dir"; \
    done

FROM ${NODE_IMAGE} AS runtime
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production \
    WORKER_HEARTBEAT_FILE=/tmp/portal-worker.heartbeat
WORKDIR /app
COPY --from=prod-deps /out/ ./
COPY --from=build /out/ ./
WORKDIR /app/apps/portal-worker
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "dist/healthcheck.js"]
CMD ["node", "--conditions=@lab/dist", "--import", "./dist/instrumentation.js", "dist/cli.js"]
