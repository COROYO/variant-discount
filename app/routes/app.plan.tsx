import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

/**
 * Shopify App Pricing (formerly Managed Pricing): Shopify hosts the native
 * plan-selection page. We send the merchant there, escaping the embedded iframe
 * via the Admin `redirect` helper (target "_top"). Plans, prices and the welcome
 * link are configured in the Partner Dashboard, not in code.
 *
 * The store handle is derived from the shop domain; the app handle defaults to
 * the app name and can be overridden with SHOPIFY_APP_HANDLE if it differs in
 * the Partner Dashboard.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect, session } = await authenticate.admin(request);

  const appHandle = process.env.SHOPIFY_APP_HANDLE || "variant-discounts";
  const storeHandle = session.shop.replace(/\.myshopify\.com$/, "");

  return redirect(
    `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`,
    { target: "_top" },
  );
};

export default function PlanRedirect() {
  // Normally never rendered — the loader redirects to Shopify's hosted page.
  return (
    <s-page heading="Plan & Preise">
      <s-section>
        <s-paragraph>
          Du wirst zur Plan-Auswahl von Shopify weitergeleitet …
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
