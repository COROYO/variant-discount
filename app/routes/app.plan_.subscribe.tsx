import type { LoaderFunctionArgs } from "react-router";
import { authenticate, BILLING_TEST, PRO_PLAN } from "../shopify.server";

/**
 * Starts the Pro subscription. Running billing.request inside a loader (reached
 * by a navigation, not a fetcher action) lets the library escape the embedded
 * iframe via the exit-iframe flow and send the merchant to Shopify's native
 * charge-approval page. Uses test charges outside production.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  await billing.request({ plan: PRO_PLAN, isTest: BILLING_TEST });
  return null; // unreachable — billing.request throws a redirect
};
