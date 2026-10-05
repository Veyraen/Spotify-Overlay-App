const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");
const { shell } = require("electron");

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const REDIRECT_PORT = 4387;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPES = ["user-read-currently-playing", "user-read-playback-state"];

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function renderCallbackPage({ ok, title, message }) {
  const accent = ok ? "#7c5cff" : "#ff5a5f"; // swap for Supra's accent color
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Supra</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 0%, #1b1b2b, #0b0b12 70%);
    color: #fff; font-family: "Segoe UI", system-ui, sans-serif;
  }
  .card {
    width: min(420px, 90vw); padding: 40px 32px; text-align: center;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px; backdrop-filter: blur(20px);
  }
  .icon {
    width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 50%;
    display: grid; place-items: center; font-size: 30px;
    background: ${accent}22; color: ${accent}; border: 2px solid ${accent};
  }
  h1 { margin: 0 0 8px; font-size: 24px; }
  p  { margin: 0; color: rgba(255,255,255,0.65); line-height: 1.5; }
  .brand { margin-top: 28px; font-size: 12px; letter-spacing: 3px;
           text-transform: uppercase; color: rgba(255,255,255,0.35); }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? "✓" : "!"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="brand">Supra</div>
  </div>
</body>
</html>`;
}

function createCodeVerifier() {
  return base64Url(crypto.randomBytes(64));
}

function createCodeChallenge(codeVerifier) {
  return base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
}

class SpotifyAuth {
  constructor({ userDataPath, clientId = "" }) {
    this.clientId = process.env.SPOTIFY_CLIENT_ID || clientId || "";

    this.tokenPath = path.join(userDataPath, "spotify-token.json");

    this.token = null;
  }

  isConfigured() {
    return Boolean(this.clientId);
  }

  isTokenExpiringSoon() {
    return !this.token?.expiresAt || Date.now() > this.token.expiresAt - 60_000;
  }

  async loadToken() {
    try {
      const tokenJson = await fs.readFile(this.tokenPath, "utf8");

      this.token = JSON.parse(tokenJson);
    } catch {
      this.token = null;
    }

    return this.token;
  }

  async saveToken(token) {
    this.token = {
      ...token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };

    await fs.mkdir(path.dirname(this.tokenPath), {
      recursive: true,
    });

    await fs.writeFile(this.tokenPath, JSON.stringify(this.token, null, 2));

    return this.token;
  }

  async clearToken() {
    this.token = null;

    try {
      await fs.rm(this.tokenPath, {
        force: true,
      });
    } catch {
      // Best effort: an absent or locked token file still leaves memory clean.
    }
  }

  async authenticate() {
    if (!this.isConfigured()) {
      throw new Error("Missing Spotify Client ID. Add it in settings.");
    }

    const state = base64Url(crypto.randomBytes(18));

    const codeVerifier = createCodeVerifier();

    const codeChallenge = createCodeChallenge(codeVerifier);

    const code = await this.waitForAuthorizationCode(state, codeChallenge);

    const token = await this.requestToken({
      code,
      codeVerifier,
    });

    return this.saveToken(token);
  }

  waitForAuthorizationCode(state, codeChallenge) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        const callbackUrl = new URL(request.url, REDIRECT_URI);

        if (callbackUrl.pathname !== "/callback") {
          response.writeHead(404);
          response.end("Not found");
          return;
        }

        if (callbackUrl.searchParams.get("state") !== state) {
          response.writeHead(400, {
            "Content-Type": "text/html; charset=utf-8",
          });
          response.end(
            renderCallbackPage({
              ok: false,
              title: "Something went wrong",
              message:
                "The login request didn't match. Close this tab and try again from Supra.",
            }),
          );
          server.close();
          reject(new Error("Invalid Spotify auth state"));
          return;
        }

        const error = callbackUrl.searchParams.get("error");

        if (error) {
          response.writeHead(400, {
            "Content-Type": "text/html; charset=utf-8",
          });
          response.end(
            renderCallbackPage({
              ok: false,
              title: "Authorization failed",
              message:
                "Spotify didn't approve the login. Close this tab and try again from Supra.",
            }),
          );
          server.close();
          reject(new Error(error));
          return;
        }

        const code = callbackUrl.searchParams.get("code");

        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
        });
        response.end(
          renderCallbackPage({
            ok: true,
            title: "You're connected",
            message:
              "Spotify is linked to Supra. You can close this tab and return to the app.",
          }),
        );

        server.close();
        resolve(code);
      });

      server.listen(REDIRECT_PORT, "127.0.0.1", () => {
        const authorizationUrl = new URL(AUTH_URL);

        authorizationUrl.searchParams.set("client_id", this.clientId);
        authorizationUrl.searchParams.set("response_type", "code");
        authorizationUrl.searchParams.set("redirect_uri", REDIRECT_URI);
        authorizationUrl.searchParams.set("scope", SCOPES.join(" "));
        authorizationUrl.searchParams.set("state", state);
        authorizationUrl.searchParams.set("code_challenge_method", "S256");
        authorizationUrl.searchParams.set("code_challenge", codeChallenge);

        shell.openExternal(authorizationUrl.toString());
      });

      server.on("error", reject);
    });
  }

  async requestToken({ code, codeVerifier }) {
    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Spotify token request failed: ${response.status}`);
    }

    return response.json();
  }

  async refreshToken() {
    await this.loadToken();

    if (!this.token?.refresh_token) {
      return null;
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: "refresh_token",
      refresh_token: this.token.refresh_token,
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        await this.clearToken();
      }

      throw new Error(`Spotify token refresh failed: ${response.status}`);
    }

    const nextToken = await response.json();

    const refreshedToken = await this.saveToken({
      ...this.token,
      ...nextToken,
      refresh_token: nextToken.refresh_token || this.token.refresh_token,
    });

    console.log("Spotify token refreshed");

    return refreshedToken;
  }

  async getAccessToken() {
    await this.loadToken();

    if (!this.token) {
      return null;
    }

    if (this.isTokenExpiringSoon()) {
      try {
        await this.refreshToken();
      } catch {
        return null;
      }
    }

    return this.token?.access_token || null;
  }
}

module.exports = SpotifyAuth;
