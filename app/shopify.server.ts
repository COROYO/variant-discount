import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { FirestoreSessionStorage } from "./firestore-session-storage.server";
import { verifyWebhookHmacAndRebuild } from "./utils/verify-webhook-hmac.server";
import { PLANS } from "./config/plans.shared";

/** Billing plan key. Must equal the Shopify subscription name that
 * `planFromSubscriptionName()` maps to the "pro" plan (PLANS.pro.name). */
export const PRO_PLAN = "Pro" as const;

/** Use Shopify test charges outside production so dev installs aren't billed. */
export const BILLING_TEST = process.env.NODE_ENV !== "production";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new FirestoreSessionStorage(db),
  distribution: AppDistribution.AppStore,
  billing: {
    [PRO_PLAN]: {
      lineItems: [
        {
          amount: PLANS.pro.priceMonthly,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
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
  const referer = request.headers.get("referer") ?? "";

  // Client-side navigations in React Router (e.g. `/app/rules/new.data`) don't
  // carry Shopify query params on the request URL itself, but the referer is
  // the embedded app page, which still has `id_token` / `shop` / `hmac`.
  let refererCarriesShopifyParams = false;
  try {
    if (referer) {
      const refererUrl = new URL(referer);
      refererCarriesShopifyParams =
        refererUrl.searchParams.has("id_token") ||
        refererUrl.searchParams.has("hmac") ||
        refererUrl.searchParams.has("shop");
    }
  } catch {
    // Ignore malformed referer header.
  }

  const looksLikeShopify =
    url.searchParams.has("id_token") ||
    url.searchParams.has("hmac") ||
    url.searchParams.has("shop") ||
    referer.includes("admin.shopify.com") ||
    refererCarriesShopifyParams ||
    // `sec-fetch-site: same-origin` is set by every modern browser on in-page
    // fetches/navigations and never by crawlers, so it's a reliable browser
    // signal even after the edge has wiped the user-agent.
    request.headers.get("sec-fetch-site") === "same-origin";
  if (!looksLikeShopify) return request;

  const headers = new Headers(request.headers);
  // Use a plain browser UA: anything matching isbot's heuristics (e.g. "compatible;",
  // "+https://", or any "bot/crawler/spider" hint) would just trip the same 410.
  headers.set(
    "user-agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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
  webhook: (async (request: Request) => {
    // Explicit HMAC verification before delegating to the library, so that
    // any request with a missing or invalid `X-Shopify-Hmac-Sha256` header is
    // rejected with 401 before it reaches a handler.
    const verified = await verifyWebhookHmacAndRebuild(
      request,
      process.env.SHOPIFY_API_SECRET ?? "",
    );
    if (!verified.ok) {
      console.warn(`Rejected webhook: ${verified.reason}`);
      throw new Response("Unauthorized", { status: 401 });
    }
    return baseAuthenticate.webhook(patchEdgeUserAgent(verified.request));
  }) as typeof baseAuthenticate.webhook,
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
