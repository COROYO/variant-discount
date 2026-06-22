import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  normalizeTagsForPreview,
  resolveTagsToProducts,
} from "../models/rules.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const body = (await request.json()) as {
    tags?: unknown;
    excludedVariantIds?: unknown;
  };

  const tags = normalizeTagsForPreview(body.tags);
  const excludedVariantIds = new Set(
    Array.isArray(body.excludedVariantIds)
      ? body.excludedVariantIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [],
  );

  if (tags.length === 0) {
    return { products: [], truncated: false };
  }

  return resolveTagsToProducts(admin, tags, excludedVariantIds);
};
