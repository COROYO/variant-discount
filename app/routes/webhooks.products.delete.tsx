import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { pruneProductVariants, shopHasTagRules, syncAllRules } from "../models/rules.server";

// When a product is deleted, remove all of its variants from every rule and
// resync, so the discount config can't point at a non-existent product.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const productId = (payload as { id?: number | string })?.id;
  if (productId != null) {
    const productGid = `gid://shopify/Product/${productId}`;
    const changed = await pruneProductVariants(shop, productGid, null);
    const hasTagRules = await shopHasTagRules(shop);
    if (admin && (changed || hasTagRules)) {
      await syncAllRules(admin, shop);
    }
  }

  return new Response();
};
