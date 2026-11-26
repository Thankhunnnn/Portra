const PORTRA_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function portraSheetsAuth(params) {
  const json = (value) => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  try {
    const config = portraSheetsOAuthConfig();
    const account = portraFirebaseAccount(params.idToken, config.apiKey);
    if (!account) return json({ error: "sign_in_required" });
    const props = PropertiesService.getScriptProperties();
    const credentialKey = "PORTRA_SHEETS_GRANT_" + account.uid;
    if (params.sheetsAuth === "begin") {
      const state = Utilities.getUuid() + Utilities.getUuid();
      const verifier = Utilities.getUuid() + Utilities.getUuid();
      const challenge = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier)).replace(/=+$/, "");
      // One pending OAuth attempt per signed-in user. A new attempt supersedes the previous one.
      const attemptKey = "PORTRA_SHEETS_PENDING_" + account.uid;
      const lock = LockService.getScriptLock();
      lock.waitLock(3000);
      try {
        const old = props.getProperty(attemptKey);
        if (old) props.deleteProperty("PORTRA_SHEETS_STATE_" + old);
        props.setProperty(attemptKey, state);
        props.setProperty("PORTRA_SHEETS_STATE_" + state, JSON.stringify({ ...account, verifier, expires: Date.now() + 600000 }));
      } finally { lock.releaseLock(); }
      return json({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?" + portraOAuthForm({
        client_id: config.clientId, redirect_uri: config.redirect, response_type: "code", scope: "openid " + PORTRA_SHEETS_SCOPE,
        access_type: "offline", prompt: "consent", login_hint: account.googleId,
        state, code_challenge: challenge, code_challenge_method: "S256",
      }) });
    }
    const saved = JSON.parse(props.getProperty(credentialKey) || "null");
    if (params.sheetsAuth === "disconnect") {
      if (saved?.googleId === account.googleId) props.deleteProperty(credentialKey);
      return json({ ok: true });
    }
    if (params.sheetsAuth !== "token") return json({ error: "invalid_action" });
    if (!saved || saved.googleId !== account.googleId) return json({ error: "connect_required" });
    const reply = portraGoogleToken(config, { grant_type: "refresh_token", refresh_token: saved.refreshToken });
    if (reply.error === "invalid_grant") return json({ error: "connect_required" });
    if (!reply.access_token || !(reply.expires_in > 0)) return json({ error: "unavailable" });
    return json({ accessToken: reply.access_token, expiresIn: reply.expires_in });
  } catch {
    return json({ error: "unavailable" });
  }
}

function doGet(event) {
  const { state, code } = event?.parameter || {};
  let connected = false;
  try {
    const config = portraSheetsOAuthConfig();
    if (!/^[a-f0-9-]{72}$/i.test(state || "")) return portraSheetsResult(false);
    const props = PropertiesService.getScriptProperties();
    const lock = LockService.getScriptLock();
    const stateKey = "PORTRA_SHEETS_STATE_" + state;
    let attempt;
    lock.waitLock(3000);
    try {
      attempt = JSON.parse(props.getProperty(stateKey) || "null");
      if (attempt) {
        props.deleteProperty(stateKey);
        const pendingKey = "PORTRA_SHEETS_PENDING_" + attempt.uid;
        if (props.getProperty(pendingKey) === state) props.deleteProperty(pendingKey);
      }
    } finally { lock.releaseLock(); }
    if (!code || !attempt || Date.now() > attempt.expires) return portraSheetsResult(false);
    const reply = portraGoogleToken(config, {
      grant_type: "authorization_code", code, redirect_uri: config.redirect, code_verifier: attempt.verifier,
    });
    if (!reply.refresh_token || !reply.access_token || !String(reply.scope || "").split(" ").includes(PORTRA_SHEETS_SCOPE)) return portraSheetsResult(false);
    const user = UrlFetchApp.fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + reply.access_token }, muteHttpExceptions: true,
    });
    if (user.getResponseCode() === 200 && JSON.parse(user.getContentText()).sub === attempt.googleId) {
      props.setProperty("PORTRA_SHEETS_GRANT_" + attempt.uid, JSON.stringify({ googleId: attempt.googleId, refreshToken: reply.refresh_token }));
      connected = true;
    }
  } catch {
    // OAuth codes and tokens must never be written to execution logs.
  }
  return portraSheetsResult(connected);
}

function portraSheetsResult(connected) {
  const message = connected ? "Google Sheets connected. Portra can renew its read access automatically."
    : "Connection was not saved. Return to Portra and try again with the same Google account.";
  return HtmlService.createHtmlOutput('<meta name="referrer" content="no-referrer"><p>' + message
    + '</p><a target="_top" rel="noreferrer" href="https://thankhunnnn.github.io/Portra/settings/">Return to Portra</a>');
}

function portraSheetsOAuthConfig() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty("PORTRA_SHEETS_OAUTH_CLIENT_ID");
  const clientSecret = props.getProperty("PORTRA_SHEETS_OAUTH_CLIENT_SECRET");
  const redirect = props.getProperty("PORTRA_SHEETS_OAUTH_REDIRECT");
  const apiKey = props.getProperty("PORTRA_FIREBASE_WEB_API_KEY");
  if (!clientId || !clientSecret || !redirect || !apiKey) throw new Error("Google Sheets OAuth is not configured");
  return { clientId, clientSecret, redirect, apiKey };
}

function portraFirebaseAccount(idToken, apiKey) {
  if (typeof idToken !== "string" || idToken.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken)) return null;
  const response = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey), {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken }), muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) return null;
  const users = JSON.parse(response.getContentText()).users || [];
  const user = users[0];
  const googleId = user?.providerUserInfo?.find((provider) => provider.providerId === "google.com")?.rawId;
  return user && !user.disabled && /^[A-Za-z0-9_-]{1,128}$/.test(user.localId) && googleId ? { uid: user.localId, googleId } : null;
}

function portraGoogleToken(config, fields) {
  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post", contentType: "application/x-www-form-urlencoded",
    payload: portraOAuthForm({ ...fields, client_id: config.clientId, client_secret: config.clientSecret }), muteHttpExceptions: true,
  });
  return JSON.parse(response.getContentText());
}

function portraOAuthForm(fields) {
  return Object.entries(fields).map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value)).join("&");
}
