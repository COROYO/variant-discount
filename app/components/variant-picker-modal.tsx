import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { RuleVariant } from "../models/rules.server";
import {
  formatVariantLabel,
  type ProductWithVariants,
} from "../models/variants.shared";
import { AppActionButton } from "./app-action-button";
import styles from "../styles/variant-picker-modal.module.css";

type VariantPickerModalProps = {
  open: boolean;
  selectedVariants: RuleVariant[];
  onClose: () => void;
  onConfirm: (variants: RuleVariant[]) => void;
};

function toRuleVariant(
  product: ProductWithVariants,
  variant: { id: string; title: string },
): RuleVariant {
  return {
    id: variant.id,
    productId: product.id,
    title: formatVariantLabel(product.title, variant.title),
    ...(product.image ? { image: product.image } : {}),
  };
}

export function VariantPickerModal({
  open,
  selectedVariants,
  onClose,
  onConfirm,
}: VariantPickerModalProps) {
  const fetcher = useFetcher<{
    products: ProductWithVariants[];
    truncated: boolean;
  }>();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, RuleVariant>>(() => new Map());

  useEffect(() => {
    if (!open) return;
    setSelected(
      new Map(selectedVariants.map((variant) => [variant.id, variant])),
    );
    setSearch("");
  }, [open, selectedVariants]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      fetcher.submit(
        { query: search },
        {
          method: "post",
          action: "/app/rules/variant-search",
          encType: "application/json",
        },
      );
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [open, search]);

  const products = fetcher.data?.products ?? [];
  const isLoading = fetcher.state !== "idle";
  const selectedCount = selected.size;

  const toggleVariant = (
    product: ProductWithVariants,
    variant: { id: string; title: string },
  ) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(variant.id)) {
        next.delete(variant.id);
      } else {
        next.set(variant.id, toRuleVariant(product, variant));
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm([...selected.values()]);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="variant-picker-title"
      >
        <div className={styles.header}>
          <h2 id="variant-picker-title" className={styles.title}>
            Varianten auswählen
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className={styles.searchRow}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Produkte oder Varianten suchen…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            autoFocus
          />
        </div>

        <div className={styles.body}>
          {isLoading && products.length === 0 ? (
            <p className={styles.status}>Produkte werden geladen…</p>
          ) : products.length === 0 ? (
            <p className={styles.status}>Keine Produkte gefunden.</p>
          ) : (
            products.map((product) => (
              <div key={product.id} className={styles.productGroup}>
                <div className={styles.productHeader}>
                  {product.image ? (
                    <img src={product.image} alt="" className={styles.thumb} />
                  ) : (
                    <span className={styles.thumbPlaceholder} aria-hidden="true" />
                  )}
                  <span className={styles.productTitle}>{product.title}</span>
                </div>
                {product.variants.map((variant) => {
                  const checked = selected.has(variant.id);
                  return (
                    <label key={variant.id} className={styles.variantRow}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={checked}
                        onChange={() => toggleVariant(product, variant)}
                      />
                      <span className={styles.variantTitle}>{variant.title}</span>
                    </label>
                  );
                })}
              </div>
            ))
          )}
          {fetcher.data?.truncated ? (
            <p className={styles.status}>
              Es werden maximal 25 Produkte angezeigt. Bitte genauer suchen.
            </p>
          ) : null}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerMeta}>
            {selectedCount} Variante(n) ausgewählt
          </span>
          <AppActionButton variant="tertiary" onAction={onClose}>
            Abbrechen
          </AppActionButton>
          <AppActionButton onAction={handleConfirm}>Übernehmen</AppActionButton>
        </div>
      </div>
    </div>
  );
}
