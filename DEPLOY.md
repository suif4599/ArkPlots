# Static deployment (deploy branch)

This branch turns ArkPlots into a **pure static site** — no Python backend — for hosting on Cloudflare Pages, while **never modifying any file that exists upstream**. Everything lives in additive files (`scripts/`, `DEPLOY.md`) plus changes to the gitignored build output, so rebasing this branch onto upstream `main` never conflicts.

## How it works

The frontend talks to the local Python server (`server.py`) through exactly three calls in `web/src/api.ts`: `GET /api/plots`, `GET /api/records`, `PUT /api/records`. On this branch those calls never leave the browser:

1. The normal frontend build runs first and produces `web/dist` exactly as upstream does.
2. [scripts/build-static.mjs](scripts/build-static.mjs) then post-processes that build output:
   - writes `web/dist/static-api.js` — the full `Plotline.json` payload (inlined at build time, so data updates in git flow into deploys automatically) followed by the fetch interceptor [scripts/static-api-shim.js](scripts/static-api-shim.js);
   - injects `<script src="/static-api.js" defer></script>` into `web/dist/index.html` immediately before the first `<script>` tag. Deferred scripts execute in document order, so the shim is guaranteed to run — and patch `window.fetch` — before the app bundle.
3. The shim monkey-patches `window.fetch` and answers the three endpoints in-page:
   - `GET /api/plots` → the inlined `Plotline.json`;
   - `GET /api/records` → `localStorage["arkplots.records"]`, seeding every plot id missing from storage with `"未读"` (fill-missing, never prune — same semantics as `ensure_read_record()` in `server.py`);
   - `PUT /api/records` → keys and values coerced to strings and persisted to the same localStorage key (same semantics as `do_PUT` in `server.py`);
   - anything else is passed through to the real `fetch`.

Consequences: reading progress is stored **per browser** (no cross-device sync — the local server never provided that either). The upstream dev workflow (`python server.py` + `cd web && npm run dev` via the Vite proxy) is untouched, and a plain `npm run build` still produces the upstream, backend-expected bundle — the shim is only added when `build-static.mjs` runs.

## Cloudflare Pages setup (one-time, dashboard)

Connect the GitHub fork with **Workers & Pages → Create → Pages → Connect to Git**:

| Setting | Value |
| --- | --- |
| Production branch | `deploy` |
| Root directory | *(empty — repository root)* |
| Build command | `cd web && npm install && npm run build && node ../scripts/build-static.mjs` |
| Build output directory | `web/dist` |

No environment variables are needed: the build image's default Node 22 satisfies Vite 8. Because the output contains no `404.html`, Cloudflare Pages automatically serves `index.html` for unmatched paths (SPA fallback).

## Local preview of the static build

```sh
cd web
npm install
npm run build
node ../scripts/build-static.mjs
npm run preview
```

## Maintenance notes

- If upstream changes the endpoints, payloads, or shapes in `web/src/api.ts`, mirror the change in `scripts/static-api-shim.js` (still an additive-file edit — no rebase conflict).
- `scripts/build-static.mjs` is idempotent and fails loudly (non-zero exit) if `web/dist` is missing or `index.html` has no injectable script tag, so a broken build shows up in the Cloudflare deploy log instead of shipping a half-patched site.
