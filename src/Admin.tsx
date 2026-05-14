import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { knownImageNames, publicImagesBaseUrl } from "./data/imageCatalog";

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

const adminEmail = "nickholroyd@gmail.com";
const googleClientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "534108723063-jj1of74k1snce3e1e7ltahqknhnlsu11.apps.googleusercontent.com";
const adminApiBaseUrl =
  import.meta.env.VITE_ADMIN_API_BASE_URL ??
  "https://fifteenhundred-admin-api.fencehopping.workers.dev";

const fallbackImages: ImageRecord[] = knownImageNames.map((name) => ({
  key: `images/${name}.png`,
  name,
  keyword: name.replace(/-/g, " "),
  url: `${publicImagesBaseUrl}/${name}.png`,
  source: "catalog",
}));

export default function Admin() {
  const [credential, setCredential] = useState<string | null>(null);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Sign in with Google to manage Cloudflare images.");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isAllowed = user?.email === adminEmail;
  const canUseApi = Boolean(adminApiBaseUrl && credential && isAllowed);
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
    if (canUseApi) {
      void loadImages();
    }
  }, [canUseApi]);

  function handleCredential(response: GoogleCredentialResponse) {
    if (!response.credential) {
      setStatus("Google did not return a sign-in token.");
      return;
    }

    const decodedUser = decodeGoogleUser(response.credential);
    setCredential(response.credential);
    setUser(decodedUser);

    if (decodedUser.email !== adminEmail) {
      setStatus(`Signed in as ${decodedUser.email}. Admin access is restricted to ${adminEmail}.`);
      return;
    }

    setStatus("Signed in. Loading Cloudflare images.");
  }

  async function loadImages() {
    if (!adminApiBaseUrl || !credential || !isAllowed) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${adminApiBaseUrl}/images`, {
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
      setStatus(`Loaded ${data.images.length} images from Cloudflare R2.`);
    } catch (error) {
      if (images.length === 0) {
        setImages(fallbackImages);
      }
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
    body.append("file", file);

    setIsUploading(true);
    try {
      const response = await fetch(`${adminApiBaseUrl}/images`, {
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
          {!user ? <div id="googleSignIn" /> : null}
          {user && user.email !== adminEmail ? (
            <p className="admin-denied">Access is restricted to {adminEmail}.</p>
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
          <h1>Food image library</h1>
          <p>Browse current Cloudflare images, search by keyword, and upload new keyword images.</p>
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
