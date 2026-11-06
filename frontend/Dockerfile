# Frontend (TanStack Start SSR). Build from the frontend/ folder:
#   docker build -t bct-frontend ./frontend
# /api is proxied to BACKEND_URL (default http://backend:8787 in docker-compose).
# To call a backend on another host directly from the browser instead, pass
#   --build-arg VITE_API_URL=https://api.example.com

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    BACKEND_URL=http://backend:8787
COPY --from=build --chown=node:node /app /app
EXPOSE 8080
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "8080", "--strictPort"]
