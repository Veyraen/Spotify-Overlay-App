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
          response.writeHead(400);
          response.end("Invalid state");
          server.close();
          reject(new Error("Invalid Spotify auth state"));
          return;
        }

        const error = callbackUrl.searchParams.get("error");

        if (error) {
          response.writeHead(400);
          response.end("Spotify authorization failed");
          server.close();
          reject(new Error(error));
          return;
        }

        const code = callbackUrl.searchParams.get("code");

        response.writeHead(200, {
          "Content-Type": "text/html",
        });
        response.end(
          "<h1>Spotify connected</h1><p>You can return to Supra.</p>",
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
