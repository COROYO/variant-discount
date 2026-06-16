import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { FirestoreSessionStorage } from "./firestore-session-storage.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new FirestoreSessionStorage(db),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

/**
 * Firebase App Hosting / Cloud Run rewrites incoming User-Agent headers to
 * "Google" for traffic that goes through their edge (load balancer + CDN).
 * shopify-app-react-router runs `respondToBotRequest()` on every authenticated
 * request, which calls `isbot()` on the User-Agent and throws a 410 Gone for
 * anything bot-shaped. Real Shopify Admin iframe requests therefore fail with
 * 410 even though they originate from a real browser.
 *
 * We unblock them by replacing the rewritten User-Agent with a harmless
 * browser string when the request clearly originates from the Shopify Admin
 * (carries Shopify-specific query parameters or referrer). The bot check still
 * runs for everything else, so true crawlers continue to be rejected.
 */
function patchEdgeUserAgent(request: Request): Request {
  const ua = request.headers.get("user-agent") ?? "";
  if (ua && !/^Google(bot)?$/i.test(ua)) return request;

  const url = new URL(request.url);
  const looksLikeShopify =
    url.searchParams.has("id_token") ||
    url.searchParams.has("hmac") ||
    url.searchParams.has("shop") ||
    (request.headers.get("referer") ?? "").includes("admin.shopify.com");
  if (!looksLikeShopify) return request;

  const headers = new Headers(request.headers);
  headers.set(
    "user-agent",
    "Mozilla/5.0 (compatible; Shopify-Embedded-App; +https://shopify.dev)",
  );
  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
    // Node's fetch requires `duplex: 'half'` when forwarding a streaming body.
    // @ts-expect-error – RequestInit type doesn't yet include `duplex`.
    duplex: "half",
  });
}

const baseAuthenticate = shopify.authenticate;
const baseUnauthenticated = shopify.unauthenticated;

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate: typeof baseAuthenticate = {
  ...baseAuthenticate,
  admin: ((request: Request) =>
    baseAuthenticate.admin(patchEdgeUserAgent(request))) as typeof baseAuthenticate.admin,
  webhook: ((request: Request) =>
    baseAuthenticate.webhook(patchEdgeUserAgent(request))) as typeof baseAuthenticate.webhook,
  public: Object.fromEntries(
    Object.entries(baseAuthenticate.public).map(([key, fn]) => [
      key,
      ((request: Request) =>
        (fn as (req: Request) => unknown)(patchEdgeUserAgent(request))) as typeof fn,
    ]),
  ) as typeof baseAuthenticate.public,
};
export const unauthenticated = baseUnauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
