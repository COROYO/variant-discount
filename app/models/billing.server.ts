/**
 * URL of Shopify's hosted plan-selection page (Shopify App Pricing / Managed
 * Pricing) for this app. Redirecting the merchant here — with the Admin
 * `redirect` helper and target "_top" — escapes the embedded iframe cleanly and
 * lets Shopify handle plan selection, approval, upgrades and cancellation.
 *
 * The store handle is derived from the shop domain; the app handle defaults to
 * the app name and can be overridden with SHOPIFY_APP_HANDLE if it differs in
 * the Partner Dashboard.
 */
export function getShopifyAppPricingPlansUrl(
  shop: string,
  appHandle = process.env.SHOPIFY_APP_HANDLE || "variant-discounts",
): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}
