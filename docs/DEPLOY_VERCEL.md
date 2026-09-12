# Deploying Fantasy Phishing

This app is two pieces, and they deploy to two places:

| Piece | What it is | Where it goes | Why |
| --- | --- | --- | --- |
| `apps/mobile` | Expo Router web app (`expo export` → static SPA) | **Vercel** | Static files; Vercel serves them perfectly. |
| `apps/api` | Fastify server: Socket.IO, JSON/Mongo storage, background deadline workers, SMTP | **An always-on host** (Render / Railway / Fly.io) | Persistent websockets, on-disk/DB state, and timers do not fit Vercel's serverless model. |

So: **the frontend goes on Vercel, the backend does not.** The frontend talks to the
backend over HTTPS via the build-time variable `EXPO_PUBLIC_API_ORIGIN`.

Do it in this order — the frontend needs the API's URL at build time.

## 1. Deploy the API (backend) first

### Option A — Render (blueprint included)

1. Push this repo to GitHub (already done for the demo).
2. Render → **New +** → **Blueprint** → select this repo. It reads `render.yaml`.
3. After the first deploy, copy the service URL (e.g. `https://fantasy-phishing-api.onrender.com`)
   and set these env vars on the service, then redeploy:
   - `API_ORIGIN` = that same API URL
   - `APP_ORIGIN` = your Vercel URL from step 2 (this is the CORS allow-origin)
   - `GEMINI_API_KEY` = your key (optional; without it the app uses approved fixtures)
   - `MONGODB_URI` = a MongoDB Atlas replica-set URI **if you want state to survive
     redeploys** — the free plan has no persistent disk, so the JSON store is ephemeral.
4. Check `https://<api>/health` returns `{"ok":true,...}`.

### Option B — any container host (Dockerfile included)

`docker build -t fp-api .` then run it with `PORT`, `HOST=0.0.0.0`, `API_ORIGIN`,
`APP_ORIGIN`, and optionally `MONGODB_URI` / `GEMINI_API_KEY`. Fly.io: `fly launch` picks
up the `Dockerfile` automatically.

## 2. Deploy the web app (frontend) to Vercel

The repo root has `vercel.json`, which tells Vercel to build only the Expo web export:

```json
buildCommand:     npm run build -w @fp/mobile
outputDirectory:  apps/mobile/dist
```

1. Vercel → import this repo (or reuse the existing project). No framework preset — the
   `vercel.json` drives it. Set the Node version to **22.x** in Project Settings.
2. Add these **Environment Variables** (they are inlined into the web bundle at build time,
   so they must be set *before* the build, and a change needs a redeploy):
   - `EXPO_PUBLIC_API_ORIGIN` = your API URL from step 1
   - `EXPO_PUBLIC_MODE` = `demo`
   - Auth0 (only if you use hosted login): `EXPO_PUBLIC_AUTH0_DOMAIN`,
     `EXPO_PUBLIC_AUTH0_CLIENT_ID` (or `EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID`),
     `EXPO_PUBLIC_AUTH0_AUDIENCE`
3. Deploy. Vercel runs `npm install` (workspaces) then the Expo export, and serves
   `apps/mobile/dist` with an SPA fallback so client-side routes resolve.

## 3. Connect the two

Set the API's `APP_ORIGIN` to the Vercel URL (CORS) and the frontend's
`EXPO_PUBLIC_API_ORIGIN` to the API URL, then redeploy whichever side changed. Load the
Vercel URL; it should reach the API and open sockets.

## Notes

- **Node 22.13+** is required (root `package.json` `engines`). Select Node 22 on both hosts.
- **`EXPO_PUBLIC_*` are build-time and public** — they end up in the browser bundle. Never
  put secrets there. Real secrets (`GEMINI_API_KEY`, `SMTP_*`, `TOKEN_SECRET`,
  `MONGODB_URI`, Auth0 client secret) live only on the API host.
- **Real email/SMS/voice** are off by default and are not needed for a Vercel demo; see
  `EMAIL_DEMO_SETUP.md` and `INTEGRATIONS.md` if you later want live delivery. Those modes
  bind to loopback and are not for public hosting as-is.
- **Why not run the API on Vercel:** it holds Socket.IO connections open, writes durable
  state to disk or Mongo, and runs background workers that settle matches at deadlines.
  Vercel functions are request-scoped and stateless, so those would silently break. An
  always-on host is the right tool.
