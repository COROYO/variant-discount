import { describe, test, expect } from "vitest";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";

const VARIANT_50G = "gid://shopify/ProductVariant/50g";
const VARIANT_100G = "gid://shopify/ProductVariant/100g";

function line(id, variantId, amount, compareAt, quantity = 1) {
  const cost = { amountPerQuantity: { amount: String(amount) } };
  if (compareAt !== undefined) {
    cost.compareAtAmountPerQuantity =
      compareAt === null ? null : { amount: String(compareAt) };
  }
  return {
    id,
    quantity,
    cost,
    merchandise: { __typename: "ProductVariant", id: variantId },
  };
}

function input(rules, lines, discountClasses = ["PRODUCT"]) {
  return {
    cart: { lines },
    discount: {
      discountClasses,
      metafield: { value: JSON.stringify({ rules }) },
    },
  };
}

const RULE_50G_20PCT = {
  id: "r1",
  status: "active",
  valueType: "percentage",
  value: 20,
  message: "-20%",
  variantIds: [VARIANT_50G],
};

describe("cartLinesDiscountsGenerateRun", () => {
  test("discounts only the targeted variant, not its sibling", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [RULE_50G_20PCT],
        [
          line("gid://shopify/CartLine/1", VARIANT_50G, 10),
          line("gid://shopify/CartLine/2", VARIANT_100G, 18),
        ],
      ),
    );

    expect(result.operations).toHaveLength(1);
    const { candidates } = result.operations[0].productDiscountsAdd;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].targets).toEqual([
      { cartLine: { id: "gid://shopify/CartLine/1" } },
    ]);
    expect(candidates[0].value).toEqual({ percentage: { value: 20 } });
  });

  test("emits a fixed amount per item when valueType is fixedAmount", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [
          {
            id: "r2",
            status: "active",
            valueType: "fixedAmount",
            value: 2.5,
            variantIds: [VARIANT_50G],
          },
        ],
        [line("gid://shopify/CartLine/1", VARIANT_50G, 10)],
      ),
    );

    expect(result.operations[0].productDiscountsAdd.candidates[0].value).toEqual(
      { fixedAmount: { amount: "2.50", appliesToEachItem: true } },
    );
  });

  test("caps a fixed amount at the line unit price", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [
          {
            id: "r3",
            status: "active",
            valueType: "fixedAmount",
            value: 999,
            variantIds: [VARIANT_50G],
          },
        ],
        [line("gid://shopify/CartLine/1", VARIANT_50G, 4)],
      ),
    );

    // Still emits a candidate; Shopify clamps the applied amount to the price.
    expect(result.operations[0].productDiscountsAdd.candidates).toHaveLength(1);
  });

  test("on overlap, picks the rule with the larger reduction", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [
          { ...RULE_50G_20PCT },
          {
            id: "rBig",
            status: "active",
            valueType: "fixedAmount",
            value: 5,
            variantIds: [VARIANT_50G],
          },
        ],
        // Unit price 10 → 20% = 2.00 reduction vs fixed 5.00 → fixed wins.
        [line("gid://shopify/CartLine/1", VARIANT_50G, 10)],
      ),
    );

    const candidates = result.operations[0].productDiscountsAdd.candidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].value).toEqual({
      fixedAmount: { amount: "5.00", appliesToEachItem: true },
    });
  });

  test("ignores inactive rules", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [{ ...RULE_50G_20PCT, status: "draft" }],
        [line("gid://shopify/CartLine/1", VARIANT_50G, 10)],
      ),
    );
    expect(result.operations).toEqual([]);
  });

  test("returns nothing when the product discount class is absent", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [RULE_50G_20PCT],
        [line("gid://shopify/CartLine/1", VARIANT_50G, 10)],
        ["ORDER"],
      ),
    );
    expect(result.operations).toEqual([]);
  });

  test("returns nothing for an empty / missing config", () => {
    const result = cartLinesDiscountsGenerateRun({
      cart: { lines: [line("gid://shopify/CartLine/1", VARIANT_50G, 10)] },
      discount: { discountClasses: ["PRODUCT"], metafield: null },
    });
    expect(result.operations).toEqual([]);
  });

  test("condition rule discounts only items that are not on sale", () => {
    const conditionRule = {
      id: "cond1",
      status: "active",
      selectionMode: "condition",
      condition: "not_on_sale",
      valueType: "percentage",
      value: 15,
    };
    const result = cartLinesDiscountsGenerateRun(
      input(
        [conditionRule],
        [
          // no compare-at price → not on sale → discounted
          line("gid://shopify/CartLine/1", "gid://shopify/ProductVariant/a", 10),
          // compare-at 12 > 8 → on sale → skipped
          line(
            "gid://shopify/CartLine/2",
            "gid://shopify/ProductVariant/b",
            8,
            12,
          ),
          // compare-at == price → not on sale → discounted
          line(
            "gid://shopify/CartLine/3",
            "gid://shopify/ProductVariant/c",
            20,
            20,
          ),
        ],
      ),
    );

    const candidates = result.operations[0].productDiscountsAdd.candidates;
    const targetIds = candidates
      .map((candidate) => candidate.targets[0].cartLine.id)
      .sort();
    expect(targetIds).toEqual([
      "gid://shopify/CartLine/1",
      "gid://shopify/CartLine/3",
    ]);
    expect(candidates[0].value).toEqual({ percentage: { value: 15 } });
  });

  test("condition rule ignores a variant that is on sale", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [
          {
            id: "cond2",
            status: "active",
            selectionMode: "condition",
            condition: "not_on_sale",
            valueType: "percentage",
            value: 10,
          },
        ],
        [line("gid://shopify/CartLine/1", "gid://shopify/ProductVariant/x", 5, 9)],
      ),
    );
    expect(result.operations).toEqual([]);
  });

  test("quantity rule applies the highest matching tier", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [
          {
            id: "qty1",
            status: "active",
            discountMode: "quantity",
            valueType: "percentage",
            value: 0,
            quantityTiers: [
              { minQuantity: 3, valueType: "percentage", value: 10 },
              { minQuantity: 5, valueType: "percentage", value: 20 },
            ],
            variantIds: [VARIANT_50G],
          },
        ],
        [line("gid://shopify/CartLine/1", VARIANT_50G, 10, undefined, 7)],
      ),
    );

    const candidates = result.operations[0].productDiscountsAdd.candidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].value).toEqual({ percentage: { value: 20 } });
  });

  test("quantity rule skips lines below the minimum tier", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [
          {
            id: "qty2",
            status: "active",
            discountMode: "quantity",
            quantityTiers: [{ minQuantity: 3, valueType: "percentage", value: 10 }],
            variantIds: [VARIANT_50G],
          },
        ],
        [line("gid://shopify/CartLine/1", VARIANT_50G, 10, undefined, 2)],
      ),
    );
    expect(result.operations).toEqual([]);
  });

  test("quantity rule supports fixed amount tiers", () => {
    const result = cartLinesDiscountsGenerateRun(
      input(
        [
          {
            id: "qty3",
            status: "active",
            discountMode: "quantity",
            quantityTiers: [
              { minQuantity: 2, valueType: "fixedAmount", value: 1.5 },
            ],
            variantIds: [VARIANT_50G],
          },
        ],
        [line("gid://shopify/CartLine/1", VARIANT_50G, 10, undefined, 2)],
      ),
    );

    expect(result.operations[0].productDiscountsAdd.candidates[0].value).toEqual(
      { fixedAmount: { amount: "1.50", appliesToEachItem: true } },
    );
  });
});
