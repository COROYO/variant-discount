import { useMemo, useState } from "react";
import type { TagMatchedProduct, RuleVariant } from "../models/rules.server";
import styles from "../styles/tag-product-list.module.css";

type TagProductListProps = {
  products: TagMatchedProduct[];
  excludedVariants: RuleVariant[];
  onExcludedVariantsChange: (variants: RuleVariant[]) => void;
};

function formatVariantCount(included: number, total: number): string {
  if (included === 0) return "0/" + total;
  if (included === total) return String(total);
  return `${included}/${total}`;
}

export function TagProductList({
  products,
  excludedVariants,
  onExcludedVariantsChange,
}: TagProductListProps) {
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(
    () => new Set(),
  );

  const excludedIds = useMemo(
    () => new Set(excludedVariants.map((variant) => variant.id)),
    [excludedVariants],
  );

  const toggleExpanded = (productId: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleVariantExclusion = (
    product: TagMatchedProduct,
    variant: { id: string; title: string },
  ) => {
    if (excludedIds.has(variant.id)) {
      onExcludedVariantsChange(
        excludedVariants.filter((entry) => entry.id !== variant.id),
      );
      return;
    }

    onExcludedVariantsChange([
      ...excludedVariants,
      {
        id: variant.id,
        productId: product.id,
        title: `${product.title} · ${variant.title}`,
        ...(product.image ? { image: product.image } : {}),
      },
    ]);
  };

  return (
    <div className={styles.list}>
      {products.map((product) => {
        const expanded = expandedProductIds.has(product.id);
        const includedCount = product.variants.filter(
          (variant) => !excludedIds.has(variant.id),
        ).length;

        return (
          <div key={product.id} className={styles.productRow}>
            <button
              type="button"
              className={styles.productHeader}
              onClick={() => toggleExpanded(product.id)}
              aria-expanded={expanded}
            >
              {product.image ? (
                <img
                  src={product.image}
                  alt=""
                  className={styles.thumb}
                />
              ) : (
                <span className={styles.thumbPlaceholder} aria-hidden="true" />
              )}
              <span className={styles.productTitle}>{product.title}</span>
              <span className={styles.meta}>
                {formatVariantCount(includedCount, product.variants.length)} Var.
              </span>
              <span className={styles.chevron} aria-hidden="true">
                {expanded ? "▾" : "▸"}
              </span>
            </button>

            {expanded ? (
              <div className={styles.variantList}>
                {product.variants.map((variant) => {
                  const isExcluded = excludedIds.has(variant.id);
                  return (
                    <div key={variant.id} className={styles.variantRow}>
                      <span
                        className={
                          isExcluded
                            ? styles.variantTitleExcluded
                            : styles.variantTitle
                        }
                      >
                        {variant.title}
                      </span>
                      <button
                        type="button"
                        className={
                          isExcluded
                            ? styles.linkButton
                            : styles.linkButtonCritical
                        }
                        onClick={() =>
                          toggleVariantExclusion(product, variant)
                        }
                      >
                        {isExcluded ? "Einbeziehen" : "Ausschließen"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
