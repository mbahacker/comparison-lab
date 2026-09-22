FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 HOSTNAME=0.0.0.0 DATA_DIR=/data
RUN groupadd --gid 1001 lab && useradd --uid 1001 --gid lab --create-home lab && mkdir /data && chown lab:lab /data
COPY --from=build --chown=lab:lab /app/.next/standalone ./
COPY --from=build --chown=lab:lab /app/.next/static ./.next/static
COPY --from=build --chown=lab:lab /app/public ./public
COPY --from=build --chown=lab:lab /app/content ./content
COPY --from=build --chown=lab:lab /app/rubric ./rubric
COPY --from=build --chown=lab:lab /app/lib/server ./lib/server
COPY --from=build --chown=lab:lab /app/lib/policy-study.ts ./lib/policy-study.ts
# The operator CLI runs source TypeScript, outside Next's bundled server modules.
COPY --from=build --chown=lab:lab /app/node_modules/zod ./node_modules/zod
COPY --from=build --chown=lab:lab /app/worker/*.mjs ./worker/
COPY --from=build --chown=lab:lab /app/benchmark ./benchmark
USER lab
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
