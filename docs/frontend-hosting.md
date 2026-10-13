# Publishing the Runway testnet frontend

The compiled frontend uses the existing Mezo testnet payment contract. Publishing it does not deploy another contract or require a wallet transaction.

## Current result

The frontend is published at **https://mezo-runway-testnet.vercel.app**, in team `supunthks-projects`, project `mezo-runway-testnet`. The production build and 12 browser tests passed on October 10, 2026. Its first deployment, `dpl_EqEcUoxwxi7tdj9ca4fixtppdZSh`, used a local tested static build before the Git repository existed.

The existing Vercel project is now connected to [SupunThk/runway](https://github.com/SupunThk/runway), with `main` as the production branch. New pushes to `main` build from GitHub and deploy to the same public URL. Other branches can receive Vercel preview deployments. The GitHub Actions checks also run on pushes and pull requests; they do not currently block Vercel promotion.

The connector initially rejected project creation with HTTP 403. The mapped CLI fallback completed its sign-in flow and successfully created and published the new project. The existing unrelated project was not modified. Future CLI deployments require a valid local Vercel login; sign in directly rather than pasting tokens or wallet keys into chat.

## Normal workflow: deploy through GitHub

The October 13 increment also includes a MongoDB API, now selected for Render hosting. Configure server-only MONGODB_URI, MONGODB_DATABASE and exact frontend HTTPS APP_ORIGIN in Render. After Render assigns its actual URL, use `scripts/configure-api-proxy.mjs` to add Vercel's external `/api` rewrite. See [Render hosting](render-hosting.md). Verify `/api/health`, login/cookies and workspace persistence through the hosted frontend before production. The static fallback below cannot run the API itself.

Commit and push changes to `main`:

```powershell
git add <changed-files>
git commit -m "Describe the change"
git push origin main
```

Vercel's Git integration performs the deployment without exporting a Vercel token to GitHub Actions. Review the build result in the Vercel dashboard and repeat the public-site verification after deployment.

The source-build settings are:

| Setting | Value |
| --- | --- |
| Repository | `SupunThk/runway` |
| Production branch | `main` |
| Root directory | Repository root |
| Node.js | `24.x` |
| Framework | Other |
| Install command | `corepack pnpm install --frozen-lockfile` |
| Build command | `corepack pnpm build` |
| Output directory | `apps/web/dist` |

The project has the five public `VITE_` settings from `.env.example` for production, preview and development. `ENABLE_EXPERIMENTAL_COREPACK=1` selects the repository's pinned pnpm version. These values identify the testnet, RPC, explorer, MUSD token and payment contract; no wallet private key is needed. The ignored local `.env` is not uploaded from GitHub. See [Vercel's Corepack configuration](https://vercel.com/docs/builds/configure-a-build).

## Fallback: publish a local static build

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

## Source configuration

The root `vercel.json` configures the pnpm build, output directory `apps/web/dist`, and `/schedules/:id` fallback. Vercel's project configuration matches it. If contract or network configuration changes, update the public Vercel environment settings and redeploy; changing only your local `.env` does not change a GitHub build. The fallback static-build method embeds the local public configuration and avoids a remote source build.
