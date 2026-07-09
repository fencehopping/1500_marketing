import assert from "node:assert/strict";
import worker from "../worker/admin-api.mjs";

const originalFetch = globalThis.fetch;

const taxonomyRows = [
  row("cat-food", "food", "Food", "", 1, 2),
  row("cat-water", "water", "Water", "", 1, 1),
  row("water-storage", "storage", "Storage", "cat-water", 2, 2),
  row("water-filters", "filters", "Filters", "cat-water", 2, 1, {
    description: "Filters, pumps, and purifier bottles",
  }),
  row("gravity-filter", "gravity-filter", "Gravity Filter", "water-filters", 3, 1, {
    description: "Handles commas, \"quotes\", and\nline breaks",
    image_asset_id: "water-filtration-gravity-water-filter-bag",
    affiliate_query: "gravity water filter",
  }),
  row("rice-bag", "rice-bag", "Rice Bag", "cat-food", 2, 1),
];

const env = {
  ALLOWED_ORIGINS: "https://fifteenhundred.app,http://localhost:5173",
  ALLOWED_ADMIN_EMAIL: "nickholroyd@gmail.com",
  GOOGLE_CLIENT_ID: "test-client-id",
  IMAGES_BUCKET: createFakeBucket({
    "images/apple.png": {
      body: new Uint8Array([137, 80, 78, 71, 1]),
      customMetadata: { keyword: "apple" },
    },
    "images/banana.jpg": {
      body: new Uint8Array([255, 216, 255, 2]),
      customMetadata: { keyword: "banana" },
    },
  }),
  PUBLIC_IMAGES_BASE_URL: "https://cdn.example.test/images",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  TAXONOMY_TABLE_NAME: "prep_taxonomy",
};

try {
  await rejectsMissingAuth();
  await exportsCsv();
  await createsOneTimeImageZipLink();
  console.log("admin-api smoke tests passed");
} finally {
  globalThis.fetch = originalFetch;
}

async function rejectsMissingAuth() {
  const response = await worker.fetch(new Request("https://worker.test/admin/export/taxonomy.csv"), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Missing Google token." });
}

async function exportsCsv() {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return Response.json({
        email: "nickholroyd@gmail.com",
        email_verified: "true",
        aud: "test-client-id",
      });
    }
    if (requestUrl.startsWith("https://example.supabase.co/rest/v1/prep_taxonomy")) {
      return Response.json(taxonomyRows);
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  const response = await worker.fetch(
    new Request("https://worker.test/admin/export/taxonomy.csv", {
      headers: {
        Authorization: "Bearer valid-google-token",
        Origin: "https://fifteenhundred.app",
      },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="prepper-taxonomy.csv"');

  const csv = await response.text();
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(
    lines[0],
    "id,slug,title,parent_id,parent_slug,level,sort_order,description,icon_asset_id,image_asset_id,affiliate_query,is_active,created_at,updated_at",
  );
  assert.equal(lines[1].split(",")[0], "cat-water");
  assert.equal(lines[2].split(",")[0], "water-filters");
  assert.equal(lines[3].split(",")[0], "gravity-filter");
  assert.equal(lines[4].split(",")[0], "water-storage");
  assert.equal(lines[5].split(",")[0], "cat-food");
  assert.match(csv, /gravity-filter,gravity-filter,Gravity Filter,water-filters,filters,3,1,/);
  assert.match(csv, /"Handles commas, ""quotes"", and\nline breaks"/);
  assert.match(csv, /water-filtration-gravity-water-filter-bag,gravity water filter,true,/);
}

async function createsOneTimeImageZipLink() {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return Response.json({
        email: "nickholroyd@gmail.com",
        email_verified: "true",
        aud: "test-client-id",
      });
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  const linkResponse = await worker.fetch(
    new Request("https://worker.test/admin/download-links?appId=1500", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-google-token",
        Origin: "https://fifteenhundred.app",
      },
    }),
    env,
  );

  assert.equal(linkResponse.status, 201);
  const link = await linkResponse.json();
  assert.equal(link.filename, "1500-images.zip");
  assert.match(link.url, /^https:\/\/worker\.test\/admin\/download\/images\.zip\?appId=1500&token=/);

  const zipResponse = await worker.fetch(
    new Request(link.url, {
      headers: {
        Origin: "https://fifteenhundred.app",
      },
    }),
    env,
  );

  assert.equal(zipResponse.status, 200);
  assert.equal(zipResponse.headers.get("Content-Type"), "application/zip");
  assert.equal(zipResponse.headers.get("Content-Disposition"), 'attachment; filename="1500-images.zip"');

  const zip = new Uint8Array(await zipResponse.arrayBuffer());
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const zipText = new TextDecoder().decode(zip);
  assert.match(zipText, /apple\.png/);
  assert.match(zipText, /banana\.jpg/);

  const usedResponse = await worker.fetch(
    new Request(link.url, {
      headers: {
        Origin: "https://fifteenhundred.app",
      },
    }),
    env,
  );
  assert.equal(usedResponse.status, 410);
  assert.deepEqual(await usedResponse.json(), {
    error: "This download link has already been used or does not exist.",
  });
}

function row(id, slug, title, parentId, level, sortOrder, overrides = {}) {
  return {
    id,
    slug,
    title,
    parent_id: parentId || null,
    level,
    sort_order: sortOrder,
    description: "",
    icon_asset_id: "",
    image_asset_id: "",
    affiliate_query: "",
    is_active: true,
    created_at: "2026-06-08T00:00:00Z",
    updated_at: "2026-06-08T00:00:00Z",
    ...overrides,
  };
}

function createFakeBucket(initialObjects) {
  const objects = new Map(
    Object.entries(initialObjects).map(([key, value]) => [
      key,
      {
        body: value.body,
        customMetadata: value.customMetadata ?? {},
        httpMetadata: value.httpMetadata ?? {},
        uploaded: new Date("2026-06-08T00:00:00Z"),
      },
    ]),
  );

  return {
    async list({ prefix = "" }) {
      return {
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({
            key,
            size: value.body.byteLength,
            customMetadata: value.customMetadata,
            uploaded: value.uploaded,
          })),
        truncated: false,
      };
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) {
        return null;
      }
      return {
        customMetadata: object.customMetadata,
        uploaded: object.uploaded,
        async arrayBuffer() {
          return object.body.buffer.slice(object.body.byteOffset, object.body.byteOffset + object.body.byteLength);
        },
        async text() {
          return new TextDecoder().decode(object.body);
        },
      };
    },
    async put(key, value, options = {}) {
      const body =
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value);
      objects.set(key, {
        body,
        customMetadata: options.customMetadata ?? {},
        httpMetadata: options.httpMetadata ?? {},
        uploaded: new Date("2026-06-08T00:00:00Z"),
      });
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
