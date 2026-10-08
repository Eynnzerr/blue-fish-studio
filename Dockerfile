FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY src/lib/defaults.ts src/lib/render.ts ./src/lib/
COPY src/types.ts ./src/types.ts
COPY public/stickers.json ./public/stickers.json
COPY public/archive ./public/archive
COPY public/studio ./public/studio
COPY public/fonts ./public/fonts
COPY ASSET_SOURCES.md THIRD_PARTY_NOTICES.md ./

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "--import", "tsx", "server/index.ts"]
