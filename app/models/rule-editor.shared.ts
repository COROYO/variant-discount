export type RuleDiscountMode = "standard" | "quantity";

export type RuleEditorConfig = {
  discountMode: RuleDiscountMode;
  listPath: string;
  editPath: string;
};

export type RuleListItem = {
  id: string;
  title: string;
  status: string;
  discountType: string;
  discountMode: string;
  selectionMode: string;
  valueType: string;
  value: number;
  quantityTiers: Array<{
    minQuantity: number;
    valueType: string;
    value: number;
  }>;
  variantCount: number;
  tagCount: number;
  excludedCount: number;
  codeCount: number;
  thumbnails: string[];
};

export type RulesListConfig = {
  discountMode: RuleDiscountMode;
  heading: string;
  newRulePath: string;
  editRulePathPrefix: string;
  emptyDescription: string;
};

export function formatRuleValue(rule: {
  discountMode: string;
  valueType: string;
  value: number;
  quantityTiers: Array<{
    minQuantity: number;
    valueType: string;
    value: number;
  }>;
}) {
  if (rule.discountMode === "quantity") {
    if (rule.quantityTiers.length === 0) return "Keine Stufen";
    return rule.quantityTiers
      .map((tier) => {
        const discount =
          tier.valueType === "percentage"
            ? `${tier.value} %`
            : `${tier.value.toFixed(2)} pro Stück`;
        return `ab ${tier.minQuantity}: ${discount}`;
      })
      .join(" · ");
  }
  return rule.valueType === "percentage"
    ? `${rule.value} %`
    : `${rule.value.toFixed(2)} (fester Betrag)`;
}

export function otherEditorPath(config: RuleEditorConfig, id: string): string {
  return config.discountMode === "quantity"
    ? `/app/rules/${id}`
    : `/app/quantity/${id}`;
}
