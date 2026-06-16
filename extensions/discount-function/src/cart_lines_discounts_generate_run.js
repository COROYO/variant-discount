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
    const unitPrice = toNumber(line?.cost?.amountPerQuantity?.amount);
    const compareAtRaw = line?.cost?.compareAtAmountPerQuantity?.amount;
    const compareAt = compareAtRaw == null ? null : toNumber(compareAtRaw);

    // Among the rules that apply to this line, pick the one that reduces it most.
    let bestRule = null;
    let bestReduction = 0;
    for (const rule of rules) {
      if (!ruleAppliesToLine(rule, variantId, unitPrice, compareAt)) {
        continue;
      }
      const reduction =
        rule.valueType === "fixedAmount"
          ? Math.min(rule.value, unitPrice)
          : (unitPrice * rule.value) / 100;
      if (reduction > bestReduction) {
        bestReduction = reduction;
        bestRule = rule;
      }
    }
    if (!bestRule || bestReduction <= 0) {
      continue;
    }

    candidates.push({
      message: bestRule.message || undefined,
      targets: [{ cartLine: { id: line.id } }],
      value:
        bestRule.valueType === "fixedAmount"
          ? {
              fixedAmount: {
                amount: round2(bestRule.value).toFixed(2),
                appliesToEachItem: true,
              },
            }
          : { percentage: { value: clampPercent(bestRule.value) } },
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
 * Parse and validate the rules JSON. Keeps active rules with a positive value
 * that still target something: a condition, or at least one variant.
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
      selectionMode:
        rule?.selectionMode === "condition" ? "condition" : "variants",
      condition: typeof rule?.condition === "string" ? rule.condition : "",
      valueType:
        rule?.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
      value: toNumber(rule?.value),
      message: typeof rule?.message === "string" ? rule.message : "",
      variantIds: Array.isArray(rule?.variantIds)
        ? rule.variantIds.filter((id) => typeof id === "string" && id.length > 0)
        : [],
    }))
    .filter(
      (rule) =>
        rule.status === "active" &&
        rule.value > 0 &&
        (rule.selectionMode === "condition"
          ? rule.condition.length > 0
          : rule.variantIds.length > 0),
    );
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}
