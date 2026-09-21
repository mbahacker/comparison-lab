FROM node:24-bookworm-slim
WORKDIR /app/worker
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
COPY worker/package*.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium && chmod -R a+rX /opt/ms-playwright
COPY worker/ ./
COPY rubric/ /app/rubric/
RUN groupadd --gid 1001 evaluator && useradd --uid 1001 --gid evaluator --create-home evaluator \
    && mkdir -p /data /app/worker/.cache && chown -R evaluator:evaluator /data /app/worker/.cache
USER evaluator
ENV WORKER_DATA_DIR=/data RUBRIC_CACHE_DIR=/data/reference-cache
CMD ["node", "index.mjs"]
