export type AdminAppConfig = {
  id: string;
  displayName: string;
  allowedAdminEmails: string[];
  r2Prefix: string;
  bucketBinding: string;
  publicImagesBaseUrl: string;
};

const defaultAdminEmail = "nickholroyd@gmail.com";
const legacyPublicImagesBaseUrl =
  "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images";

const publicImagesRootUrl = trimTrailingSlash(import.meta.env.VITE_PUBLIC_IMAGES_ROOT_URL);

const defaultAdminApps: AdminAppConfig[] = [
  {
    id: "1500",
    displayName: "1500",
    allowedAdminEmails: [defaultAdminEmail],
    r2Prefix: "images/",
    bucketBinding: "IMAGES_BUCKET",
    publicImagesBaseUrl:
      trimTrailingSlash(import.meta.env.VITE_PUBLIC_IMAGES_BASE_URL) ??
      legacyPublicImagesBaseUrl,
  },
  {
    id: "jetstream",
    displayName: "JetStream",
    allowedAdminEmails: [defaultAdminEmail],
    r2Prefix: "jetstream/images/",
    bucketBinding: "IMAGES_BUCKET",
    publicImagesBaseUrl:
      trimTrailingSlash(import.meta.env.VITE_JETSTREAM_PUBLIC_IMAGES_BASE_URL) ??
      buildPublicImagesBaseUrl(publicImagesRootUrl, "jetstream/images"),
  },
  {
    id: "duxbeach",
    displayName: "DuxBeach",
    allowedAdminEmails: [defaultAdminEmail],
    r2Prefix: "duxbeach/images/",
    bucketBinding: "IMAGES_BUCKET",
    publicImagesBaseUrl:
      trimTrailingSlash(import.meta.env.VITE_DUXBEACH_PUBLIC_IMAGES_BASE_URL) ??
      buildPublicImagesBaseUrl(publicImagesRootUrl, "duxbeach/images"),
  },
  {
    id: "ticktalk",
    displayName: "TickTalk",
    allowedAdminEmails: [defaultAdminEmail],
    r2Prefix: "ticktalk/images/",
    bucketBinding: "IMAGES_BUCKET",
    publicImagesBaseUrl:
      trimTrailingSlash(import.meta.env.VITE_TICKTALK_PUBLIC_IMAGES_BASE_URL) ??
      buildPublicImagesBaseUrl(publicImagesRootUrl, "ticktalk/images"),
  },
  {
    id: "bunkr",
    displayName: "Bunkr",
    allowedAdminEmails: [defaultAdminEmail],
    r2Prefix: "bunkr/images/",
    bucketBinding: "IMAGES_BUCKET",
    publicImagesBaseUrl:
      trimTrailingSlash(import.meta.env.VITE_BUNKR_PUBLIC_IMAGES_BASE_URL) ??
      buildPublicImagesBaseUrl(publicImagesRootUrl, "bunkr/images"),
  },
];

export const adminApps = mergeAdminAppOverrides(defaultAdminApps);
export const defaultAdminApp = adminApps[0];

function mergeAdminAppOverrides(defaults: AdminAppConfig[]) {
  const rawConfig = import.meta.env.VITE_ADMIN_APP_CONFIGS;
  if (!rawConfig) {
    return defaults;
  }

  try {
    const overrides = JSON.parse(rawConfig) as Partial<AdminAppConfig>[];
    if (!Array.isArray(overrides)) {
      return defaults;
    }

    return defaults.map((app) => {
      const override = overrides.find((candidate) => candidate.id === app.id);
      return override ? { ...app, ...override } : app;
    });
  } catch {
    return defaults;
  }
}

function buildPublicImagesBaseUrl(rootUrl: string | undefined, prefix: string) {
  return rootUrl ? `${rootUrl}/${prefix.replace(/\/$/, "")}` : "";
}

function trimTrailingSlash(value: string | undefined) {
  return value?.replace(/\/+$/, "");
}
