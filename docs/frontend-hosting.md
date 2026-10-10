# Publishing the Runway testnet frontend

The compiled frontend uses the existing Mezo testnet payment contract. Publishing it does not deploy another contract or require a wallet transaction.

## Current result

The frontend is published at **https://mezo-runway-testnet.vercel.app**. The production build and 12 browser tests passed on October 10, 2026. Deployment `dpl_EqEcUoxwxi7tdj9ca4fixtppdZSh` is READY in team `supunthks-projects`, project `mezo-runway-testnet`, production environment. This was a local tested build; the workspace is not a Git checkout, so no commit SHA applies.

The connector initially rejected project creation with HTTP 403. The mapped CLI fallback completed its sign-in flow and successfully created and published the new project. The existing unrelated project was not modified. Future CLI deployments require a valid local Vercel login; sign in directly rather than pasting tokens or wallet keys into chat.

## Publish the tested static build

From `C:\Projects\MEZO`, run:

```powershell
npm exec --yes --package=pnpm@10.34.6 -- pnpm prepare:hosting
vercel login
vercel deploy --cwd C:/Projects/MEZO/.publish/mezo-runway-testnet --scope supunthks-projects --prod
```

Use project name `mezo-runway-testnet` when asked. The preparation script copies only the compiled public assets and a recipient-route rewrite into `.publish/mezo-runway-testnet`. The build reads the local public Vite configuration before publishing; no `.env` file is uploaded. Rebuild after changing configuration or application code.

## Verify the published site

The unauthenticated production check already passed the homepage, both recipient links, direct-link refresh and mobile layout, with no uncaught page errors. Its report is in `deployments/frontend.check.json`. To rerun it: `node scripts/verify-frontend.mjs`.

Open the HTTPS URL Vercel prints, then directly open and refresh `/schedules/1` and `/schedules/2` on that host. These links should work without a wallet connected:

- Schedule 1: COMPLETED, 1 MUSD claimed, zero claimable.
- Schedule 2: CANCELLED, 0.628333333333333333 MUSD earned and claimed, 0.371666666666666667 MUSD refunded, zero claimable.

Check wallet discovery with Brave or Rabby on the HTTPS site. The browser must allow the wallet to connect to this new site; the localhost connection permission does not automatically transfer. Public recipient links must work for another person without a Vercel login. Source verification, borrowing integration, and a security audit remain separate tasks.

## Deploy from source instead

The root `vercel.json` configures the pnpm build and output directory `apps/web/dist`. For a source build, configure the public `VITE_MUSD_ADDRESS` and `VITE_PAYMENT_CONTRACT_ADDRESS` in the hosting project, along with any RPC overrides. Use the verified values from `.env.example`. No private key is needed. The static-build method above already embeds the public configuration and avoids an additional remote build.
