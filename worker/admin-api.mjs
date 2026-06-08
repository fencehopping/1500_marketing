const allowedMethods = "GET,POST,DELETE,OPTIONS";
const allowedHeaders = "Authorization,Content-Type";
const defaultAdminEmail = "nickholroyd@gmail.com";
const legacyPublicImagesBaseUrl = "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images";

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
