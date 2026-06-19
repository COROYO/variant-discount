/**
 * URL of the Shopify App Pricing (formerly "Managed Pricing") plan selection
 * page for this app. Shopify hosts this page; redirecting the merchant here —
 * with the Admin `redirect` helper and target "_top" — escapes the embedded
 * iframe cleanly and lets Shopify handle plan selection, approval, upgrades,
 * downgrades and cancellation.
 *
 * Shopify App Pricing is mandatory for App Store apps: the Billing API
 * (`appSubscriptionCreate`) is blocked for these apps ("Managed Pricing Apps
 * cannot use the Billing API").
 *
 * Two requirements for this URL to resolve (otherwise it 404s):
 *   1. The app must have an `app_handle` — set via `handle` in shopify.app.toml
 *      (or overridden here with SHOPIFY_APP_HANDLE).
 *   2. At least one plan must be configured under Shopify App Pricing in the
 *      Partner Dashboard.
 *
 * The store handle is derived from the shop domain.
 */
export function getShopifyAppPricingPlansUrl(
  shop: string,
  appHandle = process.env.SHOPIFY_APP_HANDLE || "variant-discounts",
): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}
