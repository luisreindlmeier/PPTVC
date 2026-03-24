/**
 * Cloudflare Worker — Gedonus GitHub App Token Service
 *
 * Endpoints:
 *   GET  /install-url            → { url }            — GitHub App install page
 *   POST /connect  { repo }      → { installationId } — find installation for a repo
 *   POST /token { installationId } → { token }        — fresh installation access token
 *
 * Secrets (wrangler secret put <NAME>):
 *   GITHUB_APP_ID          — numeric App ID (e.g. "12345678")
 *   GITHUB_APP_PRIVATE_KEY — PKCS#8 PEM key
 *                            Convert from GitHub's downloaded .pem:
 *                            openssl pkcs8 -topk8 -inform PEM -outform PEM \
 *                              -in app.pem -out app-pkcs8.pem -nocrypt
 *                            Then: wrangler secret put GITHUB_APP_PRIVATE_KEY < app-pkcs8.pem
 *   GITHUB_APP_NAME        — App slug used in install URL (e.g. "gedonus")
 */

const GH_API = "https://api.github.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // ── GET /install-url ──────────────────────────────────────
      if (request.method === "GET" && url.pathname === "/install-url") {
        if (!env.GITHUB_APP_NAME) return err("Worker not configured", 503, origin);
        return ok(
          { url: `https://github.com/apps/${env.GITHUB_APP_NAME}/installations/new` },
          origin
        );
      }

      // ── POST /connect ─────────────────────────────────────────
      // Finds the installation ID for a given repo (call after user installs the app)
      if (request.method === "POST" && url.pathname === "/connect") {
        const body = await request.json().catch(() => null);
        const repo = body?.repo;
        if (typeof repo !== "string" || !repo.includes("/")) {
          return err("Missing or invalid repo (expected owner/repo)", 400, origin);
        }
        const jwt = await createAppJWT(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
        const res = await ghRequest(`${GH_API}/repos/${repo}/installation`, "GET", null, jwt);
        if (res.status === 404) return err("App not installed on this repo", 404, origin);
        if (!res.ok) return err(`GitHub API error ${res.status}`, 502, origin);
        const data = await res.json();
        return ok({ installationId: data.id }, origin);
      }

      // ── POST /token ───────────────────────────────────────────
      // Returns a fresh installation access token (valid ~1 hour)
      if (request.method === "POST" && url.pathname === "/token") {
        const body = await request.json().catch(() => null);
        const installationId = body?.installationId;
        if (typeof installationId !== "number") {
          return err("Missing or invalid installationId", 400, origin);
        }
        const jwt = await createAppJWT(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
        const res = await ghRequest(
          `${GH_API}/app/installations/${installationId}/access_tokens`,
          "POST",
          null,
          jwt
        );
        if (!res.ok) return err(`GitHub API error ${res.status}`, 502, origin);
        const data = await res.json();
        return ok({ token: data.token }, origin);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      return err(e instanceof Error ? e.message : "Internal error", 500, origin);
    }
  },
};

// ── GitHub App JWT ────────────────────────────────────────────

async function createAppJWT(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60, // 60s back for clock skew tolerance
    exp: now + 540, // 9 minutes (max allowed: 10m)
    iss: String(appId),
  };

  const encode = (obj) => {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBytes = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${signingInput}.${sig}`;
}

function pemToDer(pem) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ── Helpers ───────────────────────────────────────────────────

function ghRequest(url, method, body, token) {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function ok(data, origin) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function err(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function corsHeaders(origin) {
  const allow = origin.startsWith("https://") ? origin : "https://localhost:3000";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
