import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * Discounts individual cart lines that a rule targets — either by an explicit
 * list of variant GIDs (manual selection) or by a live condition evaluated per
 * line (e.g. "not on sale": no compare-at price, or compare-at == price). The
 * rules live as JSON in the discount node metafield ($app:rules/config), written
 * by the admin app. Because matching happens per variant/line, one variant of a
 * product can be discounted while its siblings are not.
 *
 * Quantity rules apply tiered discounts when the cart line quantity meets or
 * exceeds a configured minimum; the highest matching tier wins.
 *
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const lines = input?.cart?.lines ?? [];
  if (lines.length === 0) {
    return { operations: [] };
  }

  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const rules = activeRules(input?.discount?.metafield?.value);
  if (rules.length === 0) {
    return { operations: [] };
  }

  const candidates = [];
  for (const line of lines) {
    if (line?.merchandise?.__typename !== "ProductVariant") {
      continue;
    }

    const variantId = line.merchandise.id;
    const quantity = toInt(line?.quantity, 1);
    const unitPrice = toNumber(line?.cost?.amountPerQuantity?.amount);
    const compareAtRaw = line?.cost?.compareAtAmountPerQuantity?.amount;
    const compareAt = compareAtRaw == null ? null : toNumber(compareAtRaw);

    // Among the rules that apply to this line, pick the one that reduces it most.
    let bestRule = null;
    let bestTier = null;
    let bestReduction = 0;
    for (const rule of rules) {
      if (!ruleAppliesToLine(rule, variantId, unitPrice, compareAt)) {
        continue;
      }
      const tier =
        rule.discountMode === "quantity"
          ? bestMatchingTier(rule.quantityTiers, quantity)
          : null;
      const valueType =
        rule.discountMode === "quantity" ? tier?.valueType : rule.valueType;
      const value = rule.discountMode === "quantity" ? tier?.value : rule.value;
      if (!valueType || value == null || value <= 0) {
        continue;
      }
      const reduction =
        valueType === "fixedAmount"
          ? Math.min(value, unitPrice)
          : (unitPrice * value) / 100;
      if (reduction > bestReduction) {
        bestReduction = reduction;
        bestRule = rule;
        bestTier = tier;
      }
    }
    if (!bestRule || bestReduction <= 0) {
      continue;
    }

    const appliedValueType =
      bestRule.discountMode === "quantity"
        ? bestTier.valueType
        : bestRule.valueType;
    const appliedValue =
      bestRule.discountMode === "quantity" ? bestTier.value : bestRule.value;

    candidates.push({
      message: bestRule.message || undefined,
      targets: [{ cartLine: { id: line.id } }],
      value:
        appliedValueType === "fixedAmount"
          ? {
              fixedAmount: {
                amount: round2(appliedValue).toFixed(2),
                appliesToEachItem: true,
              },
            }
          : { percentage: { value: clampPercent(appliedValue) } },
    });
  }

  if (candidates.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          // One candidate per cart line, so "All" simply applies each.
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

/** Does a rule apply to a given cart line? */
function ruleAppliesToLine(rule, variantId, unitPrice, compareAt) {
  if (rule.selectionMode === "condition") {
    return matchesCondition(rule.condition, unitPrice, compareAt);
  }
  return rule.variantIds.includes(variantId);
}

/** Pick the tier with the highest minQuantity that the line quantity satisfies. */
function bestMatchingTier(tiers, quantity) {
  let best = null;
  for (const tier of tiers) {
    if (quantity >= tier.minQuantity) {
      best = tier;
    }
  }
  return best;
}

/** Evaluate a live selection condition against a cart line's prices. */
function matchesCondition(condition, unitPrice, compareAt) {
  switch (condition) {
    case "not_on_sale":
      // No compare-at price, or compare-at equals the price (not reduced).
      return compareAt === null || compareAt === unitPrice;
    default:
      return false;
  }
}

/**
 * Parse and validate the rules JSON. Keeps active rules that still target
 * something: a condition, at least one variant, or quantity tiers.
 */
function activeRules(rawMetafieldValue) {
  if (!rawMetafieldValue) {
    return [];
  }
  let config;
  try {
    config = JSON.parse(rawMetafieldValue);
  } catch {
    return [];
  }
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  return rules
    .map((rule) => ({
      id: rule?.id,
      status: rule?.status,
      discountMode: rule?.discountMode === "quantity" ? "quantity" : "standard",
      selectionMode:
        rule?.selectionMode === "condition" ? "condition" : "variants",
      condition: typeof rule?.condition === "string" ? rule.condition : "",
      valueType:
        rule?.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
      value: toNumber(rule?.value),
      quantityTiers: normalizeQuantityTiers(rule?.quantityTiers),
      message: typeof rule?.message === "string" ? rule.message : "",
      variantIds: Array.isArray(rule?.variantIds)
        ? rule.variantIds.filter((id) => typeof id === "string" && id.length > 0)
        : [],
    }))
    .filter((rule) => {
      if (rule.status !== "active") return false;
      const hasTargets =
        rule.selectionMode === "condition"
          ? rule.condition.length > 0
          : rule.variantIds.length > 0;
      if (!hasTargets) return false;
      if (rule.discountMode === "quantity") {
        return rule.quantityTiers.length > 0;
      }
      return rule.value > 0;
    });
}

function normalizeQuantityTiers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const tiers = [];
  for (const entry of raw) {
    const minQuantity = toInt(entry?.minQuantity, 0);
    const value = toNumber(entry?.value);
    if (minQuantity < 1 || value <= 0 || seen.has(minQuantity)) continue;
    seen.add(minQuantity);
    tiers.push({
      minQuantity,
      valueType: entry?.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
      value,
    });
  }
  return tiers.sort((a, b) => a.minQuantity - b.minQuantity);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}
