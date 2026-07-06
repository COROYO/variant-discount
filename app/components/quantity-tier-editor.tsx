import type { RuleQuantityTier, RuleValueType } from "../models/rules.server";
import { AppActionButton } from "./app-action-button";
import styles from "../styles/quantity-tier-editor.module.css";

type QuantityTierEditorProps = {
  tiers: RuleQuantityTier[];
  onChange: (tiers: RuleQuantityTier[]) => void;
};

function readValue(event: Event): string {
  const target = event.currentTarget as HTMLInputElement | null;
  return target?.value ?? "";
}

export function QuantityTierEditor({ tiers, onChange }: QuantityTierEditorProps) {
  const updateTier = (index: number, patch: Partial<RuleQuantityTier>) => {
    onChange(
      tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    );
  };

  const addTier = () => {
    const lastMin = tiers.length > 0 ? tiers[tiers.length - 1].minQuantity : 1;
    onChange([
      ...tiers,
      {
        minQuantity: lastMin + 1,
        valueType: "percentage",
        value: 10,
      },
    ]);
  };

  const removeTier = (index: number) => {
    if (tiers.length <= 1) return;
    onChange(tiers.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.root}>
      <s-text color="subdued">
        Lege Mengenstufen fest. Ab der jeweiligen Mindestmenge gilt der
        zugehörige Rabatt pro Stück. Die höchste passende Stufe gewinnt.
      </s-text>

      <div className={styles.tierList}>
        {tiers.map((tier, index) => (
          <div key={index} className={styles.tierRow}>
            <s-number-field
              label="Ab Menge"
              name={`tier-min-${index}`}
              value={String(tier.minQuantity)}
              min={1}
              onChange={(event: Event) =>
                updateTier(index, {
                  minQuantity: Math.max(1, Number(readValue(event)) || 1),
                })
              }
            />
            <s-select
              label="Rabattart"
              name={`tier-type-${index}`}
              value={tier.valueType}
              onChange={(event: Event) =>
                updateTier(index, {
                  valueType: readValue(event) as RuleValueType,
                })
              }
            >
              <s-option value="percentage">Prozentual (%)</s-option>
              <s-option value="fixedAmount">Fester Betrag pro Stück</s-option>
            </s-select>
            <s-number-field
              label={
                tier.valueType === "percentage" ? "Rabatt in %" : "Rabatt pro Stück"
              }
              name={`tier-value-${index}`}
              value={String(tier.value)}
              min={0}
              {...(tier.valueType === "percentage" ? { max: 100 } : {})}
              onChange={(event: Event) =>
                updateTier(index, {
                  value: Math.max(0, Number(readValue(event)) || 0),
                })
              }
            />
            <div className={styles.removeCell}>
              <AppActionButton
                variant="tertiary"
                tone="critical"
                onAction={() => removeTier(index)}
                {...(tiers.length <= 1 ? { disabled: true } : {})}
              >
                Entfernen
              </AppActionButton>
            </div>
          </div>
        ))}
      </div>

      <AppActionButton variant="tertiary" onAction={addTier}>
        Stufe hinzufügen
      </AppActionButton>
    </div>
  );
}
