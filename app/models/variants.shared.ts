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
