# Backend API. Build from the REPO ROOT (it shares the climate engine in frontend/src/lib/climate):
#   docker build -f backend/Dockerfile -t bct-backend .
FROM node:22-slim

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY backend/ ./
COPY frontend/src/lib/climate /app/frontend/src/lib/climate

ENV NODE_ENV=production \
    PORT=8787
EXPOSE 8787
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "src/server.ts"]
