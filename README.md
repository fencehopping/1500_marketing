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

## Multi-app admin image platform

The admin UI is available at `/admin`.

Required Vite environment variables:

```bash
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com
VITE_ADMIN_API_BASE_URL=https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
VITE_PUBLIC_IMAGES_BASE_URL=https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images
VITE_PUBLIC_IMAGES_ROOT_URL=https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev
```

The Google sign-in gate remains in place. The app switcher currently supports:

- `1500`
- `jetstream`
- `duxbeach`
- `ticktalk`
- `bunkr`

By default, all apps allow `nickholroyd@gmail.com`. Override frontend app config with `VITE_ADMIN_APP_CONFIGS` when an app needs different admin emails, bucket bindings, prefixes, or public URLs:

```bash
VITE_ADMIN_APP_CONFIGS='[{"id":"jetstream","allowedAdminEmails":["admin@example.com"],"publicImagesBaseUrl":"https://pub.example.com/jetstream/images"}]'
```

### Cloudflare Worker API

The Worker in `worker/admin-api.mjs` handles secure R2 listing, uploads, and deletes. It verifies the Google ID token server-side, resolves the requested app, and validates that the signed-in email is allowed for that app.

API calls accept `appId` as a query parameter:

```text
GET /images?appId=jetstream
POST /images?appId=jetstream
DELETE /images?appId=jetstream&key=jetstream/images/example.png
GET /admin/export/taxonomy.csv
POST /admin/download-links?appId=jetstream
GET /admin/download/images.zip?appId=jetstream&token=ONE_TIME_TOKEN
```

For backward compatibility, missing `appId` defaults to `1500`.

The taxonomy CSV export is admin-only and uses the same Google ID-token authorization as the image API. It exports an import-friendly `prepper-taxonomy.csv` with stable recursive browse ordering and the columns expected by Supabase import flows.

The image zip flow is also admin-only when creating the link. The generated download URL itself is unauthenticated, expires after 1 hour, and is deleted from R2 before the zip response is streamed so it can only be used once.

Storage paths:

- 1500: `images/<keyword-slug>.<ext>`
- New apps: `<app-id>/images/<keyword-slug>.<ext>`

Default app config:

| App | Display name | R2 prefix | Bucket binding | Public URL |
| --- | --- | --- | --- | --- |
| `1500` | 1500 | `images/` | `IMAGES_BUCKET` | `PUBLIC_IMAGES_BASE_URL` |
| `jetstream` | JetStream | `jetstream/images/` | `IMAGES_BUCKET` | `JETSTREAM_PUBLIC_IMAGES_BASE_URL` or `PUBLIC_IMAGES_ROOT_URL/jetstream/images` |
| `duxbeach` | DuxBeach | `duxbeach/images/` | `IMAGES_BUCKET` | `DUXBEACH_PUBLIC_IMAGES_BASE_URL` or `PUBLIC_IMAGES_ROOT_URL/duxbeach/images` |
| `ticktalk` | TickTalk | `ticktalk/images/` | `IMAGES_BUCKET` | `TICKTALK_PUBLIC_IMAGES_BASE_URL` or `PUBLIC_IMAGES_ROOT_URL/ticktalk/images` |
| `bunkr` | Bunkr | `bunkr/images/` | `IMAGES_BUCKET` | `BUNKR_PUBLIC_IMAGES_BASE_URL` or `PUBLIC_IMAGES_ROOT_URL/bunkr/images` |

Worker variables:

```toml
[vars]
ALLOWED_ADMIN_EMAIL = "nickholroyd@gmail.com"
ALLOWED_ORIGINS = "https://1500cal.app,http://localhost:5173"
GOOGLE_CLIENT_ID = "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
PUBLIC_IMAGES_BASE_URL = "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images"
PUBLIC_IMAGES_ROOT_URL = "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev"
SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
SUPABASE_TAXONOMY_TABLE = "prep_taxonomy"
```

Set `SUPABASE_SERVICE_ROLE_KEY` as a Worker secret so the taxonomy export can read all taxonomy rows server-side without exposing the key to the browser:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Use `ADMIN_APP_CONFIGS` to override per-app allowed admin emails, bucket bindings, prefixes, or public image URLs:

```toml
ADMIN_APP_CONFIGS = "[{\"id\":\"jetstream\",\"allowedAdminEmails\":[\"admin@example.com\"],\"bucketBinding\":\"IMAGES_BUCKET\",\"r2Prefix\":\"jetstream/images/\"}]"
```

### Bulk image uploads

For large batches, upload directly to the configured Cloudflare R2 bucket with Wrangler. Filenames become image keywords, so `grilled-chicken-breast.png` uploads to `images/grilled-chicken-breast.png`.

Preview the upload plan:

```bash
npm run upload:images -- ../Images --dry-run
```

Upload the batch:

```bash
npm run upload:images -- ../Images
```

Use `--recursive` if the source directory has nested folders.

Setup:

```bash
cp wrangler.toml.example wrangler.toml
```

Then update `wrangler.toml` with the real R2 bucket name, Google OAuth client ID, allowed origins, and public image URLs.

Deploy:

```bash
npm run build
npm run test:worker
node --check worker/admin-api.mjs
npx wrangler deploy
```
