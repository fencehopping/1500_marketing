const allowedMethods = "GET,POST,DELETE,OPTIONS";
const allowedHeaders = "Authorization,Content-Type";
const defaultAdminEmail = "nickholroyd@gmail.com";
const legacyPublicImagesBaseUrl = "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images";
const taxonomyExportPath = "/admin/export/taxonomy.csv";
const taxonomyCsvFilename = "prepper-taxonomy.csv";
const downloadLinksPath = "/admin/download-links";
const imageZipDownloadPath = "/admin/download/images.zip";
const downloadTokenPrefix = "_admin/download-tokens/";
const downloadTokenTtlSeconds = 60 * 60;
const taxonomyCsvColumns = [
  "id",
  "slug",
  "title",
  "parent_id",
  "parent_slug",
  "level",
  "sort_order",
  "description",
  "icon_asset_id",
  "image_asset_id",
  "affiliate_query",
  "is_active",
  "created_at",
  "updated_at",
];

const defaultApps = [
  {
    id: "1500",
    displayName: "1500",
    allowedAdminEmails: [defaultAdminEmail],
    bucketBinding: "IMAGES_BUCKET",
    r2Prefix: "images/",
    publicImagesBaseUrlEnv: "PUBLIC_IMAGES_BASE_URL",
    fallbackPublicImagesBaseUrl: legacyPublicImagesBaseUrl,
  },
  {
    id: "jetstream",
    displayName: "JetStream",
    allowedAdminEmails: [defaultAdminEmail],
    bucketBinding: "IMAGES_BUCKET",
    r2Prefix: "jetstream/images/",
    publicImagesBaseUrlEnv: "JETSTREAM_PUBLIC_IMAGES_BASE_URL",
  },
  {
    id: "duxbeach",
    displayName: "DuxBeach",
    allowedAdminEmails: [defaultAdminEmail],
    bucketBinding: "IMAGES_BUCKET",
    r2Prefix: "duxbeach/images/",
    publicImagesBaseUrlEnv: "DUXBEACH_PUBLIC_IMAGES_BASE_URL",
  },
  {
    id: "ticktalk",
    displayName: "TickTalk",
    allowedAdminEmails: [defaultAdminEmail],
    bucketBinding: "IMAGES_BUCKET",
    r2Prefix: "ticktalk/images/",
    publicImagesBaseUrlEnv: "TICKTALK_PUBLIC_IMAGES_BASE_URL",
  },
  {
    id: "bunkr",
    displayName: "Bunkr",
    allowedAdminEmails: [defaultAdminEmail],
    bucketBinding: "IMAGES_BUCKET",
    r2Prefix: "bunkr/images/",
    publicImagesBaseUrlEnv: "BUNKR_PUBLIC_IMAGES_BASE_URL",
  },
];

export default {
  async fetch(request, env) {
    const corsHeaders = cors(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    if (url.pathname === taxonomyExportPath) {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405, {
          ...corsHeaders,
          Allow: "GET,OPTIONS",
        });
      }
      return exportTaxonomyCsv(request, env, corsHeaders);
    }

    if (url.pathname === downloadLinksPath) {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, {
          ...corsHeaders,
          Allow: "POST,OPTIONS",
        });
      }
      return createImageZipDownloadLink(request, env, corsHeaders);
    }

    if (url.pathname === imageZipDownloadPath) {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405, {
          ...corsHeaders,
          Allow: "GET,OPTIONS",
        });
      }
      return downloadImageZip(request, env, corsHeaders);
    }

    if (url.pathname !== "/images") {
      return json({ error: "Not found" }, 404, corsHeaders);
    }

    const appResult = await resolveApp(request, env);
    if (!appResult.ok) {
      return json({ error: appResult.error }, appResult.status, corsHeaders);
    }

    const auth = await authorize(request, env, appResult.app);
    if (!auth.ok) {
      return json({ error: auth.error }, auth.status, corsHeaders);
    }

    if (request.method === "GET") {
      return listImages(env, corsHeaders, appResult.app);
    }

    if (request.method === "POST") {
      return uploadImage(request, env, corsHeaders, auth.email, appResult.app);
    }

    if (request.method === "DELETE") {
      return deleteImage(request, env, corsHeaders, appResult.app);
    }

    return json({ error: "Method not allowed" }, 405, {
      ...corsHeaders,
      Allow: allowedMethods,
    });
  },
};

async function listImages(env, headers, app) {
  const bucket = bucketFor(env, app);
  const objects = [];
  let cursor;

  do {
    const listed = await bucket.list({
      prefix: app.r2Prefix,
      cursor,
      limit: 1000,
    });
    objects.push(...listed.objects);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  const images = objects
    .filter((object) => !object.key.endsWith("/"))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((object) => toImageRecord(object, app));

  return json({ images }, 200, headers);
}

async function uploadImage(request, env, headers, email, app) {
  const bucket = bucketFor(env, app);
  const form = await request.formData();
  const keyword = String(form.get("keyword") ?? "").trim();
  const file = form.get("file");

  if (!keyword) {
    return json({ error: "Keyword is required." }, 400, headers);
  }
  if (!(file instanceof File)) {
    return json({ error: "Image file is required." }, 400, headers);
  }
  if (!file.type.startsWith("image/")) {
    return json({ error: "Only image uploads are allowed." }, 400, headers);
  }

  const extension = extensionFor(file);
  const name = slugify(keyword);
  const key = `${app.r2Prefix}${name}.${extension}`;
  const body = await file.arrayBuffer();

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: file.type || `image/${extension}`,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      keyword,
      originalName: file.name,
      uploadedBy: email,
    },
  });

  return json(
    {
      image: {
        key,
        name,
        keyword,
        url: `${app.publicImagesBaseUrl}/${name}.${extension}`,
        size: file.size,
        uploaded: new Date().toISOString(),
      },
    },
    201,
    headers,
  );
}

async function deleteImage(request, env, headers, app) {
  const bucket = bucketFor(env, app);
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return json({ error: "Image key is required." }, 400, headers);
  }
  if (!key.startsWith(app.r2Prefix) || key.endsWith("/")) {
    return json({ error: "Image key is outside this app." }, 400, headers);
  }

  await bucket.delete(key);
  return json({ ok: true, key }, 200, headers);
}

async function createImageZipDownloadLink(request, env, headers) {
  const appResult = await resolveApp(request, env);
  if (!appResult.ok) {
    return json({ error: appResult.error }, appResult.status, headers);
  }

  const auth = await authorize(request, env, appResult.app);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, headers);
  }

  const bucket = bucketFor(env, appResult.app);
  const token = await randomToken();
  const expiresAt = new Date(Date.now() + downloadTokenTtlSeconds * 1000).toISOString();
  const tokenRecord = {
    appId: appResult.app.id,
    createdBy: auth.email,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  await bucket.put(downloadTokenKey(token), JSON.stringify(tokenRecord), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store",
    },
  });

  const url = new URL(request.url);
  url.pathname = imageZipDownloadPath;
  url.search = "";
  url.searchParams.set("appId", appResult.app.id);
  url.searchParams.set("token", token);

  return json(
    {
      url: url.toString(),
      expiresAt,
      filename: imageZipFilename(appResult.app),
    },
    201,
    headers,
  );
}

async function downloadImageZip(request, env, headers) {
  const appResult = await resolveApp(request, env);
  if (!appResult.ok) {
    return json({ error: appResult.error }, appResult.status, headers);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!/^[a-zA-Z0-9_-]{24,}$/.test(token)) {
    return json({ error: "Invalid download token." }, 400, headers);
  }

  const bucket = bucketFor(env, appResult.app);
  const key = downloadTokenKey(token);
  const tokenObject = await bucket.get(key);
  if (!tokenObject) {
    return json({ error: "This download link has already been used or does not exist." }, 410, headers);
  }

  let tokenRecord;
  try {
    tokenRecord = JSON.parse(await tokenObject.text());
  } catch {
    await bucket.delete(key);
    return json({ error: "Invalid download token." }, 400, headers);
  }

  await bucket.delete(key);

  if (tokenRecord.appId !== appResult.app.id) {
    return json({ error: "This download link is for a different app." }, 403, headers);
  }
  if (Date.parse(tokenRecord.expiresAt) <= Date.now()) {
    return json({ error: "This download link has expired." }, 410, headers);
  }

  const objects = await listImageObjects(bucket, appResult.app);
  const zip = await buildZip(bucket, objects, appResult.app);

  return new Response(zip, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${imageZipFilename(appResult.app)}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function exportTaxonomyCsv(request, env, headers) {
  const app = adminAuthApp(env, "bunkr");
  const auth = await authorize(request, env, app);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, headers);
  }

  try {
    const rows = await loadTaxonomyRows(env);
    const orderedRows = browseOrderedTaxonomyRows(rows);
    const csv = taxonomyRowsToCsv(orderedRows, env);

    return new Response(csv, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${taxonomyCsvFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Could not export taxonomy." },
      500,
      headers,
    );
  }
}

async function listImageObjects(bucket, app) {
  const objects = [];
  let cursor;

  do {
    const listed = await bucket.list({
      prefix: app.r2Prefix,
      cursor,
      limit: 1000,
    });
    objects.push(...listed.objects.filter((object) => !object.key.endsWith("/")));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return objects.sort((a, b) => a.key.localeCompare(b.key));
}

async function buildZip(bucket, objects, app) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  for (const object of objects) {
    const storedObject = await bucket.get(object.key);
    if (!storedObject) {
      continue;
    }

    const body = new Uint8Array(await storedObject.arrayBuffer());
    const filename = zipEntryFilename(object.key, app);
    const filenameBytes = new TextEncoder().encode(filename);
    const crc = crc32(body);
    const localHeader = zipLocalHeader(filenameBytes, crc, body.length);
    chunks.push(localHeader, body);
    centralDirectory.push(zipCentralDirectoryHeader(filenameBytes, crc, body.length, offset));
    offset += localHeader.length + body.length;
  }

  const centralDirectoryOffset = offset;
  for (const entry of centralDirectory) {
    chunks.push(entry);
    offset += entry.length;
  }

  chunks.push(zipEndOfCentralDirectory(centralDirectory.length, offset - centralDirectoryOffset, centralDirectoryOffset));

  const zip = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    zip.set(chunk, cursor);
    cursor += chunk.length;
  }

  return zip;
}

async function loadTaxonomyRows(env) {
  const supabaseURL = trimTrailingSlash(env.SUPABASE_URL ?? env.SUPABASE_PROJECT_URL);
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLIC_ANON_KEY;
  const tableName = env.TAXONOMY_TABLE_NAME ?? env.SUPABASE_TAXONOMY_TABLE ?? "prep_taxonomy";

  if (!supabaseURL) {
    throw new Error("Missing SUPABASE_URL for taxonomy export.");
  }
  if (!apiKey) {
    throw new Error("Missing Supabase API key for taxonomy export.");
  }

  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const url = new URL(`${supabaseURL}/rest/v1/${encodeURIComponent(tableName)}`);
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Could not load taxonomy rows: ${await response.text()}`);
    }

    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error("Supabase taxonomy response was not an array.");
    }

    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return rows;
}

function browseOrderedTaxonomyRows(rows) {
  const normalizedRows = rows.map(normalizeTaxonomyRow);
  const byParentId = new Map();

  for (const row of normalizedRows) {
    const parentId = nullableString(row.parent_id);
    const siblings = byParentId.get(parentId) ?? [];
    siblings.push(row);
    byParentId.set(parentId, siblings);
  }

  for (const siblings of byParentId.values()) {
    siblings.sort(compareTaxonomyRows);
  }

  const ordered = [];
  const visited = new Set();

  function visit(parentId) {
    const siblings = byParentId.get(parentId) ?? [];
    for (const row of siblings) {
      if (visited.has(row.id)) {
        continue;
      }
      visited.add(row.id);
      ordered.push(row);
      visit(row.id);
    }
  }

  visit(null);

  if (ordered.length < normalizedRows.length) {
    const remaining = normalizedRows.filter((row) => !visited.has(row.id)).sort(compareTaxonomyRows);
    for (const row of remaining) {
      if (visited.has(row.id)) {
        continue;
      }
      visited.add(row.id);
      ordered.push(row);
      visit(row.id);
    }
  }

  const byId = new Map(ordered.map((row) => [row.id, row]));
  return ordered.map((row) => ({
    ...row,
    parent_slug: nullableString(row.parent_slug) ?? byId.get(nullableString(row.parent_id))?.slug ?? "",
  }));
}

function normalizeTaxonomyRow(row) {
  const slug = valueFor(row, ["slug"]) || slugify(valueFor(row, ["title", "name", "label"]));
  const id = valueFor(row, ["id"]) || slug;
  const title = valueFor(row, ["title", "name", "label"]);
  const parentId = nullableString(valueFor(row, ["parent_id", "parentId"]));
  const levelValue = valueFor(row, ["level"]);
  const sortOrderValue = valueFor(row, ["sort_order", "sortOrder", "position", "display_order"]);

  return {
    id,
    slug,
    title,
    parent_id: parentId ?? "",
    parent_slug: valueFor(row, ["parent_slug", "parentSlug"]),
    level: levelValue === "" ? "" : String(levelValue),
    sort_order: sortOrderValue === "" ? "" : String(sortOrderValue),
    description: valueFor(row, ["description"]),
    icon_asset_id: valueFor(row, ["icon_asset_id", "iconAssetId", "icon_key", "iconKey"]),
    image_asset_id: valueFor(row, ["image_asset_id", "imageAssetId", "image_key", "imageKey"]),
    affiliate_query: valueFor(row, ["affiliate_query", "affiliateQuery"]),
    is_active: booleanString(valueFor(row, ["is_active", "isActive"], true)),
    created_at: valueFor(row, ["created_at", "createdAt"]),
    updated_at: valueFor(row, ["updated_at", "updatedAt"]),
  };
}

function taxonomyRowsToCsv(rows, env = {}) {
  const lines = [
    taxonomyCsvColumns.join(","),
    ...rows.map((row) => taxonomyCsvColumns.map((column) => csvCell(row[column])).join(",")),
  ];
  const body = lines.join("\r\n") + "\r\n";
  return env.TAXONOMY_CSV_UTF8_BOM === "true" ? `\uFEFF${body}` : body;
}

function csvCell(value) {
  const stringValue = value == null ? "" : String(value);
  if (!/[",\r\n]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function compareTaxonomyRows(a, b) {
  return (
    compareSortOrder(a.sort_order, b.sort_order) ||
    String(a.title).localeCompare(String(b.title), "en", { sensitivity: "base" }) ||
    String(a.slug).localeCompare(String(b.slug), "en", { sensitivity: "base" }) ||
    String(a.id).localeCompare(String(b.id), "en", { sensitivity: "base" })
  );
}

function compareSortOrder(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftValid = Number.isFinite(leftNumber);
  const rightValid = Number.isFinite(rightNumber);
  if (leftValid && rightValid && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }
  return 0;
}

function valueFor(row, keys, fallback = "") {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return fallback;
}

function nullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function booleanString(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return String(value);
}

async function authorize(request, env, app) {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) {
    return { ok: false, status: 401, error: "Missing Google token." };
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!response.ok) {
    return { ok: false, status: 401, error: "Invalid Google token." };
  }

  const payload = await response.json();
  const email = String(payload.email ?? "");
  if (!app.allowedAdminEmails.includes(email) || payload.email_verified !== "true") {
    return { ok: false, status: 403, error: `This Google account is not allowed for ${app.displayName}.` };
  }
  if (env.GOOGLE_CLIENT_ID && payload.aud !== env.GOOGLE_CLIENT_ID) {
    return { ok: false, status: 403, error: "Google token audience does not match this app." };
  }

  return { ok: true, email };
}

function toImageRecord(object, app) {
  const filename = object.key.split("/").pop() ?? object.key;
  const name = filename.replace(/\.[^.]+$/, "");
  return {
    key: object.key,
    name,
    keyword: object.customMetadata?.keyword ?? name.replaceAll("-", " "),
    url: `${app.publicImagesBaseUrl}/${filename}`,
    size: object.size,
    uploaded: object.uploaded?.toISOString(),
  };
}

async function resolveApp(request, env) {
  const url = new URL(request.url);
  let appId = url.searchParams.get("appId")?.trim().toLowerCase();

  if (!appId && request.method === "POST") {
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return { ok: false, status: 400, error: "Multipart form data is required." };
    }
    appId = "1500";
  }

  const app = appConfigs(env).find((candidate) => candidate.id === (appId || "1500"));
  if (!app) {
    return { ok: false, status: 404, error: "Unknown app." };
  }
  if (!bucketFor(env, app)) {
    return { ok: false, status: 500, error: `Missing R2 bucket binding ${app.bucketBinding}.` };
  }
  if (!app.publicImagesBaseUrl) {
    return { ok: false, status: 500, error: `Missing public images base URL for ${app.displayName}.` };
  }

  return { ok: true, app };
}

function appConfigs(env) {
  const overrides = parseAppConfigOverrides(env.ADMIN_APP_CONFIGS);
  const legacyAllowedAdminEmail = env.ALLOWED_ADMIN_EMAIL;

  return defaultApps.map((app) => {
    const override = overrides.find((candidate) => candidate.id === app.id) ?? {};
    const publicImagesBaseUrl =
      trimTrailingSlash(env[override.publicImagesBaseUrlEnv ?? app.publicImagesBaseUrlEnv]) ??
      trimTrailingSlash(override.publicImagesBaseUrl) ??
      trimTrailingSlash(app.fallbackPublicImagesBaseUrl) ??
      buildPublicImagesBaseUrl(env.PUBLIC_IMAGES_ROOT_URL, override.r2Prefix ?? app.r2Prefix);

    return {
      ...app,
      ...override,
      id: app.id,
      allowedAdminEmails:
        override.allowedAdminEmails ??
        (legacyAllowedAdminEmail ? [legacyAllowedAdminEmail] : app.allowedAdminEmails),
      r2Prefix: normalizePrefix(override.r2Prefix ?? app.r2Prefix),
      bucketBinding: override.bucketBinding ?? app.bucketBinding,
      publicImagesBaseUrl,
    };
  });
}

function parseAppConfigOverrides(rawConfig) {
  if (!rawConfig) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawConfig);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function bucketFor(env, app) {
  return env[app.bucketBinding];
}

function adminAuthApp(env, appId) {
  const app = appConfigs(env).find((candidate) => candidate.id === appId) ?? defaultApps[0];
  const legacyAllowedAdminEmail = env.ALLOWED_ADMIN_EMAIL;
  return {
    ...app,
    allowedAdminEmails: legacyAllowedAdminEmail ? [legacyAllowedAdminEmail] : app.allowedAdminEmails,
  };
}

function buildPublicImagesBaseUrl(rootUrl, prefix) {
  const cleanRoot = trimTrailingSlash(rootUrl);
  if (!cleanRoot) {
    return "";
  }
  return `${cleanRoot}/${prefix.replace(/\/$/, "")}`;
}

function normalizePrefix(prefix) {
  return `${String(prefix ?? "").replace(/^\/+|\/+$/g, "")}/`;
}

function trimTrailingSlash(value) {
  return typeof value === "string" && value ? value.replace(/\/+$/, "") : undefined;
}

function cors(request, env) {
  const requestOrigin = request.headers.get("Origin") ?? "";
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(value, status, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function downloadTokenKey(token) {
  return `${downloadTokenPrefix}${token}.json`;
}

function imageZipFilename(app) {
  return `${slugify(app.displayName || app.id)}-images.zip`;
}

function zipEntryFilename(key, app) {
  const filename = key.slice(app.r2Prefix.length).replace(/^\/+/, "");
  return filename || key.split("/").pop() || "image";
}

function zipLocalHeader(filenameBytes, crc, size) {
  const header = new Uint8Array(30 + filenameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, filenameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(filenameBytes, 30);
  return header;
}

function zipCentralDirectoryHeader(filenameBytes, crc, size, offset) {
  const header = new Uint8Array(46 + filenameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, filenameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  header.set(filenameBytes, 46);
  return header;
}

function zipEndOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return header;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function extensionFor(file) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";

  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : "png";
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
