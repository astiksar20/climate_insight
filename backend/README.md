# Backend — Bharat Climate Twin API

Zero-dependency Node HTTP service (run with `tsx`) that reuses the shared climate engine in `../frontend/src/lib/climate`.

```bash
npm install
npm run dev          # http://localhost:8787, reloads on change
PORT=9000 npm start  # production-style
```

Endpoints: `/api/health`, `/api/profile?lat=&lon=` (NDJSON stream), `/api/summary?lat=&lon=`, `/api/hotspots`. See the root README for details.
