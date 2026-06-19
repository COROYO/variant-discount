/**
 * Billing helpers for the Shopify Billing API.
 *
 * Subscriptions are created with the Admin API (`appSubscriptionCreate`, via
 * the `billing.request` context helper) and the merchant is sent to Shopify's
 * hosted charge-approval page. This works without any Partner-Dashboard "App
 * Pricing" / Managed Pricing configuration — which is what previously 404'd
 * when selecting a paid plan.
 */

/** Minimal shape of the Admin GraphQL client returned by `authenticate.admin`. */
type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/**
 * Whether the shop is a Shopify development store. Development stores can't be
 * charged real money, so subscriptions there must be created as test charges.
 */
export async function isDevelopmentStore(
  admin: AdminGraphqlClient,
): Promise<boolean> {
  const response = await admin.graphql(`#graphql
    query ShopPlan {
      shop {
        plan {
          partnerDevelopment
        }
      }
    }
  `);
  const result = (await response.json()) as {
    data?: { shop?: { plan?: { partnerDevelopment?: boolean } } };
  };
  return result.data?.shop?.plan?.partnerDevelopment === true;
}

/**
 * Resolve whether a charge should be a Shopify *test* charge.
 *
 * Defaults to test charges so installs — including Shopify's App Store review —
 * are never billed real money. Only when `BILLING_TEST=false` is set explicitly
 * do we issue real charges, and even then only on live (non-development) stores.
 */
export async function resolveBillingIsTest(
  admin: AdminGraphqlClient,
): Promise<boolean> {
  if (process.env.BILLING_TEST !== "false") return true;
  return isDevelopmentStore(admin);
}
