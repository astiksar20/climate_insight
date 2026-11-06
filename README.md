# Bharat Climate Twin

Click any spot in India and get its full climate picture: what's happening now, what's coming (hours to 16 days), how the climate has behaved since 1991, where it's heading to 2050, and which hazards to watch — with animated storm, tornado, lightning, rain-radar and wind visualisations.

```
climate_insight/
├── frontend/   TanStack Start + React app (map, panels, charts, animations)
│   └── src/lib/climate/   shared climate engine (used by both frontend and backend)
└── backend/    Node API: aggregates, cleans, fuses and caches the datasets
```

## Run with Docker (easiest)

Needs Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux).

```bash
docker compose up --build        # first run builds both images (~2–4 min)
```

- App: <http://localhost:8080/dashboard/live-map>
- API: <http://localhost:8787/api/health>

Stop with `Ctrl+C` or `docker compose down`. The frontend container proxies `/api` to the backend container, and waits for the backend's health check before starting.

| File | Purpose |
|---|---|
| `docker-compose.yml` | runs `backend` (port 8787) + `frontend` (port 8080) |
| `backend/Dockerfile` | built from the repo root because it shares `frontend/src/lib/climate` |
| `frontend/Dockerfile` | two-stage: `npm ci` + `vite build`, then serves the SSR app |

To deploy the frontend somewhere the backend lives at a different address, build it with `--build-arg VITE_API_URL=https://api.example.com` (the backend already sends CORS headers).

## Run without Docker

```bash
# 1. backend (port 8787)
cd backend && npm install && npm run dev

# 2. frontend (port 8080) — /api is proxied to the backend
cd frontend && npm install && npm run dev
```

Open <http://localhost:8080/dashboard/live-map>.

The backend is optional: if `/api/health` isn't reachable (e.g. on Lovable hosting), the frontend fetches the same sources straight from the browser. To point a deployed frontend at a hosted backend, set `VITE_API_URL=https://your-backend.example.com`. For `vite dev`, `BACKEND_URL` overrides the proxy target.

## Backend API

| Endpoint | Returns |
|---|---|
| `GET /api/health` | service status |
| `GET /api/profile?lat=&lon=` | NDJSON stream of `{profile, status, final}`: synthetic baseline → fast live tier → final (ERA5 + CMIP6) |
| `GET /api/summary?lat=&lon=` | final profile + every characteristic + alerts, as one JSON |
| `GET /api/hotspots[?force=1]` | 12-hour hazard scan of 81 stations across all states/UTs |

Profiles are cached for 15 minutes per point and in-flight requests are shared, so many users clicking the same place cost one upstream fetch.

## Datasets combined

| Section | Live source | Notes |
|---|---|---|
| Hourly / daily forecast (16 days) | Open-Meteo best-match NWP (ECMWF IFS, GFS, ICON…) | temperature, humidity, rain, wind, gusts, pressure, visibility, UV, CAPE, lifted index, CIN, freezing level, 925/500 hPa winds, soil moisture, snow |
| Last 92 days | Open-Meteo analysis | drought index, departures |
| Climate normals | ERA5 1991–2020 + NASA POWER (MERRA-2/CERES) | temperature & rain from ERA5; humidity, wind, solar from POWER |
| History 1991–last year | ECMWF ERA5 reanalysis | trends, extremes, warming stripes, monsoon onset/withdrawal |
| Projections 2015–2050 | CMIP6 HighResMIP (EC-Earth3P-HR, MRI-AGCM3-2-S) | delta bias-corrected to observed baseline, 5-yr smoothing, model spread |
| Air quality | CAMS global | PM2.5, PM10, NO₂, SO₂, O₃, CO, dust, AOD → CPCB AQI |
| River flow | GloFAS v4 | 30-day forecast + 2000–present return levels (P50/P90/P99) |
| Sea state | MFWAM / ECMWF WAM | coastal points only |
| Terrain / place | Copernicus DEM, BigDataCloud / OSM Nominatim | |
| Radar loop | RainViewer | animated past 2 h + nowcast |

### Cleaning & gap filling

Every live series is: coerced to numbers → sentinel (−999) and physically impossible values dropped → short gaps (≤ 6 steps) linearly interpolated → anything still missing filled from a **synthetic climate model for India**, so no field ever shows "not available". The synthetic model is built from regional climatology (lapse rate, latitude/continentality, SW and NE monsoon timing, western disturbances, IGP winter smog/fog…), seeded per location so it's stable.

Every section is tagged **Live**, **Live + filled** or **Synthetic** in the UI, and alerts driven by synthetic data are labelled *simulated*.

## What's computed

- **Characteristics (45+)**: Köppen–Geiger class, aridity index, ET₀, hottest/coldest months, diurnal range, ≥40 °C days, cold nights, records, SW/NE monsoon share, onset/withdrawal, rainfall variability, heavy-rain days, SPI-90 drought, humidity, wind, solar resource, wet-bulb, warming and rainfall trends, projected warming by 2030/2050, dominant hazards, AQI, river flow, soil moisture, rain-fed growing months.
- **Severe weather per hour**: thunderstorm probability, storm life-cycle stage (cumulus → towering cumulus → thunderstorm → severe → tornadic), a Significant-Tornado-Parameter-style index (CAPE, LCL, 0–1 km and 0–6 km shear, CIN), hail, squall, fog, heat index, wet-bulb, and **storm build-up detection**.
- **IMD-style colour-coded alerts** (green/yellow/orange/red): thunderstorm & lightning, tornado, hail, squall, cyclonic conditions, heavy/very heavy/extremely heavy rain, heat wave and cold wave (departure-based), humid heat, fog, UV, air pollution, river flood, drought, fire weather, rough sea, snowfall.

> Not an official warning service — always follow IMD and NDMA advisories.

Map tiles © OpenStreetMap contributors © CARTO. Weather data by Open-Meteo (CC BY 4.0), NASA POWER, Copernicus/ECMWF, RainViewer.
