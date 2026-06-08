#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const bucket = "fifteenhundred-images";
const publicBaseUrl = "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images";
const cacheControl = "public, max-age=31536000, immutable";
const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const args = process.argv.slice(2);
const options = {
  dryRun: args.includes("--dry-run"),
  recursive: args.includes("--recursive"),
  concurrency: numberOption("--concurrency", 4),
};
const directoryArg = args.find((arg) => !arg.startsWith("--"));

if (!directoryArg) {
  console.error("Usage: npm run upload:images -- <directory> [--dry-run] [--recursive] [--concurrency 4]");
  process.exit(1);
}

const sourceDirectory = path.resolve(process.cwd(), directoryArg);
const files = await imageFiles(sourceDirectory, options.recursive);

if (files.length === 0) {
  console.log(`No supported images found in ${sourceDirectory}`);
  process.exit(0);
}

const uploads = files.map((file) => {
  const parsed = path.parse(file);
  const extension = normalizedExtension(parsed.ext);
  const name = slugify(parsed.name);
  return {
    file,
    name,
    key: `images/${name}.${extension}`,
    contentType: contentTypeFor(extension),
    url: `${publicBaseUrl}/${name}.${extension}`,
  };
});

const invalid = uploads.filter((upload) => !upload.name);
if (invalid.length > 0) {
  console.error("Some files cannot be slugged into valid image names:");
  invalid.slice(0, 20).forEach((upload) => console.error(`- ${upload.file}`));
  process.exit(1);
}

const duplicates = duplicateKeys(uploads);
if (duplicates.length > 0) {
  console.error("Duplicate destination keys would overwrite each other:");
  duplicates.slice(0, 20).forEach((key) => console.error(`- ${key}`));
  process.exit(1);
}

console.log(`${options.dryRun ? "Dry run:" : "Uploading"} ${uploads.length} images from ${sourceDirectory}`);
console.log(`Destination bucket: ${bucket}`);

if (options.dryRun) {
  uploads.slice(0, 30).forEach((upload) => {
    console.log(`${upload.file} -> ${upload.url}`);
  });
  if (uploads.length > 30) {
    console.log(`...and ${uploads.length - 30} more`);
  }
  process.exit(0);
}

let completed = 0;
let failed = 0;
await runPool(uploads, options.concurrency, async (upload) => {
  await putObject(upload);
  completed += 1;
  console.log(`[${completed}/${uploads.length}] ${upload.key}`);
}).catch((error) => {
  failed += 1;
  console.error(error instanceof Error ? error.message : String(error));
});

if (failed > 0) {
  process.exit(1);
}

console.log(`Uploaded ${completed} images.`);

async function imageFiles(directory, recursive) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...(await imageFiles(fullPath, recursive)));
      }
      continue;
    }
    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!supportedExtensions.has(extension)) continue;

    const info = await stat(fullPath);
    if (info.size > 0) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function putObject(upload) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "wrangler",
        "r2",
        "object",
        "put",
        `${bucket}/${upload.key}`,
        "--file",
        upload.file,
        "--content-type",
        upload.contentType,
        "--cache-control",
        cacheControl,
        "--remote",
        "--force",
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed for ${upload.file}\n${stderr.trim()}`));
    });
  });
}

async function runPool(items, concurrency, worker) {
  const executing = new Set();
  for (const item of items) {
    const promise = Promise.resolve().then(() => worker(item));
    executing.add(promise);
    promise.finally(() => executing.delete(promise));
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

function duplicateKeys(uploads) {
  const seen = new Set();
  const duplicates = new Set();
  for (const upload of uploads) {
    if (seen.has(upload.key)) {
      duplicates.add(upload.key);
    }
    seen.add(upload.key);
  }
  return [...duplicates];
}

function normalizedExtension(extension) {
  const clean = extension.toLowerCase().replace(".", "");
  return clean === "jpeg" ? "jpg" : clean;
}

function contentTypeFor(extension) {
  if (extension === "jpg") return "image/jpeg";
  return `image/${extension}`;
}

function numberOption(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
