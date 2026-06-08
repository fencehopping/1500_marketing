import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { adminApps, defaultAdminApp } from "./data/adminApps";
import { knownImageNames } from "./data/imageCatalog";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleUser = {
  email: string;
  name?: string;
  picture?: string;
};

type ImageRecord = {
  key: string;
  name: string;
  keyword: string;
  url: string;
  size?: number;
  uploaded?: string;
  source: "catalog" | "r2";
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          prompt: () => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
        };
      };
    };
  }
}

const googleClientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "534108723063-jj1of74k1snce3e1e7ltahqknhnlsu11.apps.googleusercontent.com";
const adminApiBaseUrl =
  import.meta.env.VITE_ADMIN_API_BASE_URL ??
  "https://fifteenhundred-admin-api.fencehopping.workers.dev";

export default function Admin() {
  const [credential, setCredential] = useState<string | null>(null);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [selectedAppId, setSelectedAppId] = useState(defaultAdminApp.id);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Sign in with Google to manage Cloudflare images.");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const selectedApp = adminApps.find((app) => app.id === selectedAppId) ?? defaultAdminApp;
  const selectedAppRef = useRef(selectedApp);
  const isAllowed = Boolean(user && selectedApp.allowedAdminEmails.includes(user.email));
  const canUseApi = Boolean(adminApiBaseUrl && credential && isAllowed);
  const fallbackImages = useMemo(
    () =>
      selectedApp.id === "1500"
        ? knownImageNames.map((name) => ({
            key: `images/${name}.png`,
            name,
            keyword: name.replace(/-/g, " "),
            url: `${selectedApp.publicImagesBaseUrl}/${name}.png`,
            source: "catalog" as const,
          }))
        : [],
    [selectedApp],
  );
  const filteredImages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return images;
    }

    return images.filter((image) =>
      [image.name, image.keyword, image.key]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [images, query]);

  useEffect(() => {
    selectedAppRef.current = selectedApp;
  }, [selectedApp]);

  useEffect(() => {
    if (!googleClientId) {
      setStatus("Missing VITE_GOOGLE_CLIENT_ID. Admin access is locked until Google auth is configured.");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredential,
      });

      const button = document.getElementById("googleSignIn");
      if (button) {
        button.innerHTML = "";
        window.google?.accounts.id.renderButton(button, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  useEffect(() => {
    setImages([]);
    setQuery("");
    if (canUseApi) {
      void loadImages();
    }
  }, [canUseApi, selectedAppId]);

  function handleCredential(response: GoogleCredentialResponse) {
    if (!response.credential) {
      setStatus("Google did not return a sign-in token.");
      return;
    }

    const decodedUser = decodeGoogleUser(response.credential);
    setCredential(response.credential);
    setUser(decodedUser);

    const credentialApp = selectedAppRef.current;
    if (!credentialApp.allowedAdminEmails.includes(decodedUser.email)) {
      setStatus(`Signed in as ${decodedUser.email}. Admin access is restricted for ${credentialApp.displayName}.`);
      return;
    }

    setStatus(`Signed in. Loading ${credentialApp.displayName} images.`);
  }

  async function loadImages() {
    if (!adminApiBaseUrl || !credential || !isAllowed) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${adminApiBaseUrl}/images?appId=${encodeURIComponent(selectedApp.id)}`, {
        headers: {
          Authorization: `Bearer ${credential}`,
        },
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { images: Omit<ImageRecord, "source">[] };
      setImages(
        data.images.map((image) => ({
          ...image,
          source: "r2",
        })),
      );
      setStatus(`Loaded ${data.images.length} ${selectedApp.displayName} images from Cloudflare R2.`);
    } catch (error) {
      setImages((currentImages) => (currentImages.length === 0 ? fallbackImages : currentImages));
      setStatus(error instanceof Error ? error.message : "Could not load Cloudflare images.");
    } finally {
      setIsLoading(false);
    }
  }

  async function uploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminApiBaseUrl || !credential || !isAllowed) {
      setStatus("Sign in as the admin account and configure VITE_ADMIN_API_BASE_URL before uploading.");
      return;
    }
    if (!file || !keyword.trim()) {
      setStatus("Choose an image and enter the keyword it should match.");
      return;
    }

    const body = new FormData();
    body.append("keyword", keyword);
    body.append("appId", selectedApp.id);
    body.append("file", file);

    setIsUploading(true);
    try {
      const response = await fetch(`${adminApiBaseUrl}/images?appId=${encodeURIComponent(selectedApp.id)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { image: Omit<ImageRecord, "source"> };
      setImages((currentImages) => [{ ...data.image, source: "r2" }, ...currentImages]);
      setKeyword("");
      setFile(null);
      setStatus(`Uploaded ${data.image.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteImage(image: ImageRecord) {
    if (!adminApiBaseUrl || !credential || !isAllowed || image.source !== "r2") {
      setStatus("Only Cloudflare R2 images can be deleted.");
      return;
    }

    const confirmed = window.confirm(`Delete ${image.keyword}? This removes ${image.key} from R2.`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${adminApiBaseUrl}/images?appId=${encodeURIComponent(selectedApp.id)}&key=${encodeURIComponent(image.key)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${credential}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setImages((currentImages) => currentImages.filter((currentImage) => currentImage.key !== image.key));
      setStatus(`Deleted ${image.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  function updateSelectedApp(appId: string) {
    setSelectedAppId(appId);
    const nextApp = adminApps.find((app) => app.id === appId) ?? defaultAdminApp;
    if (user && !nextApp.allowedAdminEmails.includes(user.email)) {
      setStatus(`Signed in as ${user.email}. Admin access is restricted for ${nextApp.displayName}.`);
      return;
    }
    setStatus(`Switched to ${nextApp.displayName}.`);
  }

  if (!isAllowed) {
    return (
      <main className="admin-page admin-login-page">
        <section className="admin-login-card">
          <p className="eyebrow">Admin</p>
          <h1>Food image library</h1>
          <p>Sign in with the authorized Google account to manage Cloudflare food images.</p>
          <div className="admin-login-status">
            <strong>{user ? user.email : "Not signed in"}</strong>
            <span>{status}</span>
          </div>
          <label className="admin-app-select">
            App
            <select value={selectedApp.id} onChange={(event) => updateSelectedApp(event.target.value)}>
              {adminApps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.displayName}
                </option>
              ))}
            </select>
          </label>
          {!user ? <div id="googleSignIn" /> : null}
          {user && !isAllowed ? (
            <p className="admin-denied">Access is restricted for {selectedApp.displayName}.</p>
          ) : null}
          <a className="button button-secondary" href="/">
            Website
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>{selectedApp.id === "1500" ? "Food image library" : `${selectedApp.displayName} image library`}</h1>
          <p>Browse current Cloudflare images, search by keyword, upload new keyword images, and remove old ones.</p>
        </div>
        <a className="button button-secondary" href="/">
          Website
        </a>
      </header>

      <section className="admin-toolbar" aria-label="Admin authentication">
        <div>
          <strong>{user ? user.email : "Not signed in"}</strong>
          <span>{status}</span>
        </div>
        <label className="admin-app-select">
          App
          <select value={selectedApp.id} onChange={(event) => updateSelectedApp(event.target.value)}>
            {adminApps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.displayName}
              </option>
            ))}
          </select>
        </label>
        {user?.picture ? <img src={user.picture} alt="" /> : null}
        {!user ? <div id="googleSignIn" /> : null}
      </section>

      <section className="admin-panel upload-panel">
        <div>
          <p className="eyebrow">Add image</p>
          <h2>Map a keyword to a hosted image.</h2>
        </div>
        <form onSubmit={uploadImage}>
          <label>
            Keyword
            <input
              type="text"
              value={keyword}
              placeholder="ex. grilled chicken breast"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <label>
            Image file
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="button button-primary" type="submit" disabled={isUploading || !canUseApi}>
            {isUploading ? "Uploading..." : "Upload image"}
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="image-list-header">
          <div>
            <p className="eyebrow">Images</p>
            <h2>{filteredImages.length} images</h2>
          </div>
          <div className="image-actions">
            <input
              type="search"
              value={query}
              placeholder="Search keywords"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="button button-secondary" type="button" disabled={!canUseApi || isLoading} onClick={loadImages}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="image-list" role="list">
          {filteredImages.map((image) => (
            <article className="image-row" key={image.key} role="listitem">
              <img src={image.url} alt="" loading="lazy" />
              <div>
                <strong>{image.keyword}</strong>
                <span>{image.key}</span>
              </div>
              <span className="image-source">{image.source === "r2" ? "Cloudflare" : "Catalog"}</span>
              <a className="button button-secondary" href={image.url} target="_blank" rel="noreferrer">
                Open
              </a>
              <button
                className="button button-secondary button-danger"
                type="button"
                disabled={!canUseApi || image.source !== "r2"}
                onClick={() => deleteImage(image)}
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function decodeGoogleUser(credential: string): GoogleUser {
  const payload = credential.split(".")[1];
  const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
  const paddedPayload = normalizedPayload.padEnd(normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4), "=");
  const decodedPayload = JSON.parse(window.atob(paddedPayload)) as GoogleUser;
  return decodedPayload;
}
