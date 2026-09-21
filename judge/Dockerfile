FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global --no-audit --no-fund @anthropic-ai/claude-code@2.1.198 \
    && claude --version | grep -F '2.1.198 '
COPY judge/ ./judge/
COPY worker/protocol.mjs worker/verdict-schema.mjs ./worker/
COPY rubric/ ./rubric/
RUN groupadd --gid 1001 evaluator && useradd --uid 1001 --gid evaluator --create-home evaluator
USER evaluator
ENV NODE_ENV=production
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3101/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "judge/server.mjs"]
