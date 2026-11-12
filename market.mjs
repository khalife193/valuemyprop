// Serves the latest market data uploaded by the nightly job.
// Falls back to the bundled public/data/market.json if the store is empty.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  try {
    const json = await getStore("market").get("latest");
    if (json) {
      return new Response(json, {
        headers: {
          "content-type": "application/json",
          // browsers cache 1h, Netlify CDN caches 1h and serves stale while refreshing
          "cache-control": "public, max-age=3600",
          "netlify-cdn-cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }
  } catch (e) { /* fall through */ }
  return Response.redirect(new URL("/data/market.json", req.url), 302);
};

export const config = { path: "/api/market" };
