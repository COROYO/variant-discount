import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { searchProductsWithVariants } from "../models/variants.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const body = (await request.json()) as { query?: unknown };
  const rawQuery = typeof body.query === "string" ? body.query.trim() : "";
  const query = rawQuery.length > 0 ? rawQuery : "status:active";

  return searchProductsWithVariants(admin, query);
};
