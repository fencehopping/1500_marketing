# Fifteen Hundred Marketing Page

One-page creator partnership landing page for the Fifteen Hundred iOS app.

## Run locally

```bash
npm install
npm run dev
```

## Hosted images

Images are loaded from Cloudflare R2:

`https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images`

The page is static and can be deployed to Vercel or Netlify with `npm run build`.

## Admin image library

The admin UI is available at `/admin`.

Required Vite environment variables:

```bash
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com
VITE_ADMIN_API_BASE_URL=https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
VITE_PUBLIC_IMAGES_BASE_URL=https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images
```

The UI only unlocks write actions for `nickholroyd@gmail.com`.

### Cloudflare Worker API

The Worker in `worker/admin-api.mjs` handles secure R2 listing and uploads. It verifies the Google ID token server-side, then writes uploads to:

`images/<keyword-slug>.<ext>`

Setup:

```bash
cp wrangler.toml.example wrangler.toml
```

Then update `wrangler.toml` with the real R2 bucket name, Google OAuth client ID, and allowed origins.

Deploy:

```bash
npx wrangler deploy
```
