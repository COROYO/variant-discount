import { adminGraphql, type AdminGraphqlClient } from "./admin-graphql.server";

const SEARCH_PRODUCTS_WITH_VARIANTS = `#graphql
  query SearchProductsWithVariants($query: String!, $cursor: String) {
    products(first: 25, query: $query, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        featuredImage {
          url
        }
        variants(first: 100) {
          nodes {
            id
            title
          }
        }
      }
    }
  }
`;

type SearchProductsPage = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      title: string;
      featuredImage: { url: string } | null;
      variants: { nodes: Array<{ id: string; title: string }> };
    }>;
  };
};

export type ProductWithVariants = {
  id: string;
  title: string;
  image?: string;
  variants: Array<{ id: string; title: string }>;
};

export function formatVariantLabel(
  productTitle: string,
  variantTitle: string,
): string {
  const product = productTitle.trim();
  const variant = variantTitle.trim();
  if (product && variant) return `${product} · ${variant}`;
  return product || variant;
}

/** Search products and return them with variant rows for the picker UI. */
export async function searchProductsWithVariants(
  admin: AdminGraphqlClient,
  query: string,
): Promise<{ products: ProductWithVariants[]; truncated: boolean }> {
  const products: ProductWithVariants[] = [];
  let cursor: string | undefined;
  let truncated = false;

  for (;;) {
    const page: SearchProductsPage = await adminGraphql<SearchProductsPage>(
      admin,
      SEARCH_PRODUCTS_WITH_VARIANTS,
      cursor ? { query, cursor } : { query },
    );

    for (const product of page.products.nodes) {
      products.push({
        id: product.id,
        title: product.title,
        ...(product.featuredImage?.url
          ? { image: product.featuredImage.url }
          : {}),
        variants: product.variants.nodes.map((variant) => ({
          id: variant.id,
          title: variant.title,
        })),
      });
    }

    if (products.length >= 25) {
      truncated =
        page.products.pageInfo.hasNextPage ||
        page.products.nodes.length > 0;
      break;
    }

    if (!page.products.pageInfo.hasNextPage) break;
    cursor = page.products.pageInfo.endCursor ?? undefined;
  }

  return { products, truncated };
}
