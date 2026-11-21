ARG NODE_IMAGE=node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm run build -w @lab/contracts -w @lab/handbook -w @lab/database -w @lab/catalog \
      -w @lab/flow -w @lab/dora -w @lab/telemetry -w @lab/llm-usage -w @lab/portal-api
RUN set -eu; \
    for dir in packages/contracts packages/handbook packages/database packages/catalog \
               packages/flow packages/dora packages/telemetry packages/llm-usage apps/portal-api; do \
      mkdir -p "/out/$dir"; cp "$dir/package.json" "/out/$dir/"; cp -r "$dir/dist" "/out/$dir/"; \
    done; \
    cp -r packages/database/migrations /out/packages/database/; \
    cp -r apps/portal-api/prompts /out/apps/portal-api/; \
    cp -r package.json handbook catalog fixtures /out/

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY . .
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund -w @lab/portal-api \
 && find . -name node_modules -type d -prune | while read -r dir; do \
      mkdir -p "/out/$(dirname "$dir")"; cp -a "$dir" "/out/$dir"; \
    done

FROM ${NODE_IMAGE} AS runtime
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    PORT=4100 \
    PORTAL_HANDBOOK_DIR=/app/handbook
WORKDIR /app
COPY --from=prod-deps /out/ ./
COPY --from=build /out/ ./
WORKDIR /app/apps/portal-api
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--import", "./dist/instrumentation.js", "dist/main.js"]
