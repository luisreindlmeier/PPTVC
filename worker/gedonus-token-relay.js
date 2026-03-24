/**
 * Cloudflare Worker — Gedonus Token Relay
 *
 * Serves the Gedonus GitHub PAT to PPTVC add-ins so commits
 * are attributed to the gedonus account without users needing
 * to configure anything beyond inviting gedonus as a collaborator.
 *
 * Deploy:
 *   1. wrangler secret put GEDONUS_TOKEN   (paste the PAT)
 *   2. wrangler deploy
 *
 * Environment variable:
 *   GEDONUS_TOKEN — fine-grained PAT for github.com/gedonus
 *                   with "Contents: Read and Write" scope
 */

const ALLOWED_ORIGINS = ["https://localhost:3000", "https://appsforoffice.microsoft.com"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const token = env.GEDONUS_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: "not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    return new Response(JSON.stringify({ token }), {
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  },
};

function corsHeaders(origin) {
  // Allow any https origin — Office add-ins run from various Microsoft CDN hosts.
  // The token is scoped to repos where gedonus is explicitly invited, so broad
  // CORS is acceptable here.
  const allowed =
    origin.startsWith("https://") || ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}
