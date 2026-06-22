import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { pruneProductVariants, shopHasTagRules, syncAllRules } from "../models/rules.server";

// When a product changes, drop any selected variants that no longer exist so the
// live discount never references a deleted variant, then resync the config.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const product = payload as {
    id?: number | string;
    variants?: Array<{ id: number | string }>;
  };

  if (product?.id != null && Array.isArray(product.variants)) {
    const productGid = `gid://shopify/Product/${product.id}`;
    const keepVariantIds = new Set(
      product.variants.map(
        (variant) => `gid://shopify/ProductVariant/${variant.id}`,
      ),
    );
    const changed = await pruneProductVariants(shop, productGid, keepVariantIds);
    const hasTagRules = await shopHasTagRules(shop);
    if (admin && (changed || hasTagRules)) {
      await syncAllRules(admin, shop);
    }
  }

  return new Response();
};
