# Frontend Vercel Deploy

This project is a Next.js frontend living inside the monorepo at `frontend/`.

## Current production assumptions

- Backend API: `https://api.gatesync.in`
- Frontend app domain target: `gatesync.in`

The frontend code already points to the live backend domain, so no extra API env vars are required for the current setup.

## Pre-deploy checklist

1. Backend API should already be live:
   - `https://api.gatesync.in/api/health`
2. Frontend production build should pass:
   - `npm run build`

## Vercel dashboard deploy

1. Open Vercel Dashboard
2. Create a new project from the GitHub repo:
   - `vmehta0387/GateSync`
3. Set the project Root Directory to:
   - `frontend`
4. Keep framework preset as:
   - `Next.js`
5. Build settings:
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: leave default
6. Deploy

## Why Root Directory matters

This repo is a monorepo. Vercel must build only the `frontend/` app, not the whole repository root.

`next.config.ts` already includes a Turbopack root setting so the build is stable in Vercel.

## Custom domain setup

Recommended:

- Apex domain: `gatesync.in`
- Optional redirect/secondary domain: `www.gatesync.in`

Typical Vercel DNS targets:

- Apex domain A record -> `76.76.21.21`
- `www` CNAME -> `cname.vercel-dns.com`

Always confirm the exact required records in the Vercel project domain settings before applying DNS.

## Post-deploy checks

1. Open the Vercel preview/production URL
2. Verify landing page loads
3. Verify login works
4. Verify admin pages can reach:
   - `https://api.gatesync.in`
5. Verify visitor approval page works:
   - `/visitor-approval`

## Local build command

Run from `frontend/`:

```bash
npm run build
```

## Notes

- If the frontend domain changes later, update the hardcoded web/API URLs in `src/`
- If you want environment-based URLs later, migrate these domains into `NEXT_PUBLIC_*` vars
