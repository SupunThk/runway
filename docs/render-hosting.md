# Render backend deployment

Selected October 13, 2026: Vercel frontend → same-origin `/api` reverse proxy → Render Node.js API → MongoDB Atlas.

The root `render.yaml` defines a free Node web service in Singapore. No service has been created by this configuration alone. MongoDB remains hosted in Atlas. Render provides PORT; the API binds to 0.0.0.0 when PORT is set. Local development continues using 127.0.0.1:3001.

## Deploy

1. Publish the reviewed backend changes to a GitHub branch. A main push also deploys the Vercel frontend automatically, so coordinate the frontend proxy change and release.
2. Connect Render to the GitHub repository and create a Blueprint from root `render.yaml`, selecting the intended branch. Alternatively create a Node Web Service with the settings below. Keep Root Directory blank because the workspace lockfile and shared configuration are at repository root.
3. Enter MONGODB_URI directly into Render's environment settings, using the working Atlas URI. Do not put it in GitHub, frontend variables or chat. Set MONGODB_DATABASE to the intended database and APP_ORIGIN to the exact browser-facing frontend origin.
4. Deploy and confirm `https://<actual-service>.onrender.com/api/health` returns status ready and database connected. MongoDB's network access list must permit the service's outbound connections.
5. Once Render assigns the actual URL, run `node scripts/configure-api-proxy.mjs https://<actual-service>.onrender.com`. Review the resulting external rewrite in `vercel.json` and redeploy the frontend. No placeholder URL is active before this step.
6. Verify the public frontend `/api/health`, sign-in signature, Secure/HttpOnly/SameSite cookies, workspace/contractor/invoice persistence across reload, account isolation and logout. No financial transaction is needed for backend verification.

## Service settings

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Node version | 24.16.0 |
| Root Directory | Blank (repository root) |
| Build command | `npm exec --yes --package=pnpm@10.34.6 -- pnpm install --frozen-lockfile --prod=false && npm exec --yes --package=pnpm@10.34.6 -- pnpm --filter @runway/api build` |
| Start command | `node apps/api/src/server.ts` |
| Health check | `/api/health` |
| NODE_ENV | `production` |
| APP_ORIGIN | `https://mezo-runway-testnet.vercel.app` for the existing public frontend |
| MONGODB_DATABASE | `runway`, or the intended environment-specific database |
| MONGODB_URI | Secret Atlas connection string; configure directly in Render |

Install includes dev dependencies for TypeScript build checking. The initial Blueprint specifies free compute and checksPass auto-deployment. Check plan availability and CI status in Render before creating the service. No paid plan is selected automatically.

## Origin and cookies

The frontend continues fetching relative `/api` URLs. Vercel forwards them to Render while the browser sees its frontend origin. The API's cookie has no Domain attribute, uses path `/api`, and becomes Secure when APP_ORIGIN is HTTPS. Render's APP_ORIGIN must therefore be the frontend URL, not the Render API URL. Production startup does not fall back to localhost when APP_ORIGIN is absent.

Do not switch the browser to direct cross-site calls to onrender.com without redesigning CORS and session-cookie handling. The server verifies the browser Origin on mutations. Check that the hosted proxy forwards Origin, Cookie and Set-Cookie correctly before release. Preview frontend testing needs its own APP_ORIGIN and separate backend/database configuration.

Render free web services can sleep after inactivity, causing slow first requests. Keep the UI's unavailable/retry states and verify cold-start behavior before demonstrations. The health endpoint checks MongoDB, so an unavailable database can prevent the deployment from passing its health check.

References: [Render web services](https://render.com/docs/web-services), [Blueprint fields](https://render.com/docs/blueprint-spec), [Node version](https://render.com/docs/node-version), [Vercel external rewrites](https://vercel.com/docs/routing/rewrites).
