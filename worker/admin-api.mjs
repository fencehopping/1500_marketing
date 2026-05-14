const allowedMethods = "GET,POST,OPTIONS";
const allowedHeaders = "Authorization,Content-Type";

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

    const auth = await authorize(request, env);
    if (!auth.ok) {
      return json({ error: auth.error }, auth.status, corsHeaders);
    }

    if (request.method === "GET") {
      return listImages(env, corsHeaders);
    }

    if (request.method === "POST") {
      return uploadImage(request, env, corsHeaders, auth.email);
    }

    return json({ error: "Method not allowed" }, 405, {
      ...corsHeaders,
      Allow: allowedMethods,
    });
  },
};

async function listImages(env, headers) {
  const listed = await env.IMAGES_BUCKET.list({ prefix: "images/" });
  const images = listed.objects
    .filter((object) => !object.key.endsWith("/"))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((object) => toImageRecord(object, env));

  return json({ images }, 200, headers);
}

async function uploadImage(request, env, headers, email) {
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
  const key = `images/${name}.${extension}`;
  const body = await file.arrayBuffer();

  await env.IMAGES_BUCKET.put(key, body, {
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
        url: `${env.PUBLIC_IMAGES_BASE_URL}/${name}.${extension}`,
        size: file.size,
        uploaded: new Date().toISOString(),
      },
    },
    201,
    headers,
  );
}

async function authorize(request, env) {
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
  const allowedEmail = env.ALLOWED_ADMIN_EMAIL ?? "nickholroyd@gmail.com";
  if (payload.email !== allowedEmail || payload.email_verified !== "true") {
    return { ok: false, status: 403, error: "This Google account is not allowed." };
  }
  if (env.GOOGLE_CLIENT_ID && payload.aud !== env.GOOGLE_CLIENT_ID) {
    return { ok: false, status: 403, error: "Google token audience does not match this app." };
  }

  return { ok: true, email: payload.email };
}

function toImageRecord(object, env) {
  const filename = object.key.split("/").pop() ?? object.key;
  const name = filename.replace(/\.[^.]+$/, "");
  return {
    key: object.key,
    name,
    keyword: object.customMetadata?.keyword ?? name.replaceAll("-", " "),
    url: `${env.PUBLIC_IMAGES_BASE_URL}/${filename}`,
    size: object.size,
    uploaded: object.uploaded?.toISOString(),
  };
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
