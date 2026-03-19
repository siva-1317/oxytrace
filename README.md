# OxyTrace

Hospital oxygen cylinder management system with real-time monitoring, alerts, analytics, and AI summaries.

## Tech stack

- Frontend: React 18 + Vite, Tailwind CSS, Framer Motion, Recharts
- Backend: Node.js + Express
- Auth + DB: Supabase (PostgreSQL + Google OAuth)
- AI: Google Gemini API

## Project structure

```
D:\\oxytrace
├── client
└── server
```

## 1) Supabase setup

1. Create a Supabase project
2. Enable Google OAuth in Supabase Auth
3. Run the SQL schema in the Supabase SQL editor (from your spec)
4. In Supabase dashboard:
   - Add Redirect URLs for local dev, e.g. `http://localhost:5173`
   - Ensure Realtime is enabled for `sensor_readings` and `alerts`

## 2) Environment variables

Create these files:

- `D:\\oxytrace\\server\\.env` (copy from `D:\\oxytrace\\server\\.env.example`)
- `D:\\oxytrace\\client\\.env` (copy from `D:\\oxytrace\\client\\.env.example`)

Notes:
- Keep `SUPABASE_SERVICE_KEY` on the server only (service role key must never be exposed to the client).
- The AI key can be set as `GEMINI_API_KEY` on the server. The UI also allows an optional per-browser override stored in `localStorage` (sent as `x-gemini-key` header).

## 3) Install + run

From the repo root:

```bash
npm install
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`

## 4) ESP32 firmware configuration

- Endpoint: `POST http://localhost:4000/api/readings/ingest`
- Required header: `x-esp32-secret: <ESP32_SECRET>`
- JSON body example:

```json
{
  "esp32_device_id": "esp32-ward-a-01",
  "gas_weight_kg": 31.2,
  "leakage_ppm": 12,
  "valve_open": true,
  "gas_level_pct": 66.4
}
```

The ingest route will:
- Insert a new row into `sensor_readings`
- Auto-create an alert when leakage is dangerous (>= 200ppm) or gas is low (< 20%)

## 5) Production notes

- Put the server behind HTTPS and restrict CORS to your client domain.
- Consider Supabase Row Level Security (RLS) for any client-side direct queries (this app uses server-side service role for most data access).
- Treat AI output as advisory; always validate against clinical/safety protocols.

