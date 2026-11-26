import { auth, clearSheetsToken, getStoredToken, storeSheetsToken } from "./firebase";

const endpoint = process.env.NEXT_PUBLIC_SHEETS_AUTH_URL;
export const sheetsConnectionEnabled = Boolean(endpoint);

async function requestSheetsAuth(action: "begin" | "token" | "disconnect", signal?: AbortSignal) {
  const user = auth().currentUser;
  if (!endpoint || !user) throw new Error("Sign in to Portra first.");
  const server = new URL(endpoint);
  if (server.origin !== "https://script.google.com" || !/^\/macros\/s\/[\w-]+\/exec$/.test(server.pathname)) {
    throw new Error("Google Sheets connection is not configured.");
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  const timer = setTimeout(stop, 12000);
  try {
    const idToken = await user.getIdToken();
    const response = await fetch(server, {
      method: "POST", credentials: "omit", body: new URLSearchParams({ sheetsAuth: action, idToken }),
      cache: "no-store", signal: controller.signal,
    });
    if (!response.ok || auth().currentUser?.uid !== user.uid) throw new Error("Could not connect to Google Sheets.");
    const data = await response.json();
    if (data.error && data.error !== "connect_required") throw new Error("Google Sheets connection is unavailable. Try again shortly.");
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

export async function sheetsAccessToken(signal?: AbortSignal): Promise<string | null> {
  const saved = getStoredToken();
  if (saved || !sheetsConnectionEnabled || !auth().currentUser) return saved;
  const result = await requestSheetsAuth("token", signal);
  if (typeof result.accessToken !== "string" || !(result.expiresIn > 0)) return null;
  storeSheetsToken(result.accessToken, result.expiresIn);
  return result.accessToken;
}

export async function connectSheetsInGoogle() {
  const result = await requestSheetsAuth("begin");
  const target = new URL(result.authorizationUrl);
  if (target.origin !== "https://accounts.google.com" || target.pathname !== "/o/oauth2/v2/auth") {
    throw new Error("Google Sheets authorization could not be opened.");
  }
  location.assign(target.href);
}

export async function disconnectSheetsFromGoogle() {
  await requestSheetsAuth("disconnect");
  clearSheetsToken();
}
