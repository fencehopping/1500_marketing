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
GET /admin/ai-food-catalog
GET /admin/export/ai-food-catalog.csv
GET /admin/catalog/recipes
POST /admin/catalog/recipes
GET /admin/catalog/recipes/:id
PATCH /admin/catalog/recipes/:id
POST /admin/catalog/recipes/:id/classify
PUT /admin/catalog/recipes/:id/tags
POST /admin/catalog/recipes/:id/image
GET /admin/catalog/tags
POST /admin/catalog/recipes/generate
POST /admin/download-links?appId=jetstream
GET /admin/download/images.zip?appId=jetstream&token=ONE_TIME_TOKEN
```

For backward compatibility, missing `appId` defaults to `1500`.

The taxonomy CSV export is admin-only and uses the same Google ID-token authorization as the image API. It exports an import-friendly `prepper-taxonomy.csv` with stable recursive browse ordering and the columns expected by Supabase import flows.

The accepted AI food catalog is also admin-only. It reads confirmed `ai_meal_estimate` food variants from Supabase, groups duplicates without returning owner IDs, and provides a searchable JSON list plus `1500-ai-food-catalog.csv` with suggested image keywords and filenames.

The 1500 recipe catalog is managed from the 1500 app in `/admin`. Recipes can start from a public URL, pasted text, a manual draft, or an AI prompt. Every recipe can be classified against the controlled tag taxonomy, reviewed, given a standardized image, and published to the iOS app. Publishing requires reviewed source rights, meal types, nutrition, ingredients, instructions, tagging, and an image.

Apply `../supabase/migrations/20260903000000_catalog_recipes.sql` before enabling the catalog endpoints. The migration creates the recipe, tag, collection, version-history, and public feed objects, seeds the initial taxonomy, enables RLS, and exposes only published recipes through `catalog_recipe_feed`.

The iOS recipe importer calls `POST /recipe/image` after the user reviews an imported recipe. The endpoint generates a standardized square food image from the edited recipe title only; the OpenAI key remains in the Worker and is never shipped in the app.

During import, `POST /recipe/nutrition` can suggest calories, protein, carbohydrates, fiber, sugar, and fat per serving from the current recipe title, servings, ingredients, and instructions. The result uses a strict numeric schema and remains fully editable before the recipe is saved.

Public X recipe videos use `POST /recipe/import/social/metadata` to resolve the post and a medium-resolution video, then `POST /recipe/import/social/analyze` to combine locally sampled frames, the post caption, and a narration transcript into an editable recipe. The phone never uploads the full video, and the OpenAI key remains in the Worker.

The flexible importer uses `POST /recipe/import/analyze` for pasted text, up to five public recipe links, and normalized recipe photos or screenshots. The Worker extracts readable page and structured recipe copy, combines it with image OCR/vision, and returns structured ingredients, steps, a batch portion count, a human-readable one-portion description, and nutrition per portion. Public-link fetching validates every redirect and blocks local/private network targets.

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
ALLOWED_ORIGINS = "https://fifteenhundred.app,http://localhost:5173"
GOOGLE_CLIENT_ID = "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
PUBLIC_IMAGES_BASE_URL = "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images"
PUBLIC_IMAGES_ROOT_URL = "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev"
SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
SUPABASE_TAXONOMY_TABLE = "prep_taxonomy"
```

Set `SUPABASE_SERVICE_ROLE_KEY` as a Worker secret so the taxonomy export and recipe catalog admin can read and write server-side without exposing the key to the browser:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Set the OpenAI project key as a Worker secret for recipe import, structured generation, classification, and image generation:

```bash
npx wrangler secret put OPENAI_API_KEY
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
