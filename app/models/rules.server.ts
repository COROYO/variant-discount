import { FieldValue, Timestamp } from "firebase-admin/firestore";
import db from "../db.server";
import { setJsonMetafield, type AdminGraphqlClient } from "./admin-graphql.server";
import {
  createCodeDiscount,
  deleteCodeDiscount,
  DISCOUNT_KEY,
  DISCOUNT_NAMESPACE,
  ensureDiscountId,
  reconcileCodes,
  setCodeDiscountActive,
} from "./discount.server";

export type RuleValueType = "percentage" | "fixedAmount";
export type RuleStatus = "active" | "draft";
export type RuleDiscountType = "automatic" | "code";
export type RuleSelectionMode = "variants" | "condition";
export type RuleCondition = "not_on_sale";

/** Conditions the app supports for automatic (rule-based) variant selection. */
const ALLOWED_CONDITIONS: readonly string[] = ["not_on_sale"];

/** A manually selected discount target. (A `type`, not `interface`, so it is
 * assignable to React Router's JsonValue when submitted as JSON.) */
export type RuleVariant = {
  id: string; // gid://shopify/ProductVariant/...
  productId: string; // gid://shopify/Product/... (used by webhook pruning)
  title: string; // "Product · 50g" for display
  image?: string; // thumbnail URL for display only (not sent to the function)
};

export interface RuleData {
  id: string;
  shop: string;
  title: string;
  status: RuleStatus;
  discountType: RuleDiscountType;
  selectionMode: RuleSelectionMode;
  condition: string;
  valueType: RuleValueType;
  value: number;
  message: string | null;
  variants: RuleVariant[];
  codes: string[];
  discountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleFormInput {
  title: string;
  status: RuleStatus;
  discountType: RuleDiscountType;
  selectionMode: RuleSelectionMode;
  condition: string;
  valueType: RuleValueType;
  value: number;
  message?: string | null;
  variants: RuleVariant[];
  codes: string[];
}

interface RuleDoc {
  shop: string;
  title: string;
  status: string;
  discountType: string;
  selectionMode: string;
  condition: string;
  valueType: string;
  value: number;
  message: string | null;
  variants: RuleVariant[];
  codes: string[];
  discountId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const rulesCollection = () => db.collection("rules");

function normalizeVariants(variants: RuleVariant[] | undefined): RuleVariant[] {
  if (!Array.isArray(variants)) return [];
  return variants
    .filter((variant) => variant && typeof variant.id === "string")
    .map((variant) => ({
      id: variant.id,
      productId: typeof variant.productId === "string" ? variant.productId : "",
      title: typeof variant.title === "string" ? variant.title : "",
      ...(typeof variant.image === "string" && variant.image.length > 0
        ? { image: variant.image }
        : {}),
    }));
}

/** Trim, uppercase, and de-duplicate codes (Shopify codes are case-insensitive). */
function normalizeCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of codes ?? []) {
    const code = String(raw).trim().toUpperCase();
    if (code && !seen.has(code)) {
      seen.add(code);
      result.push(code);
    }
  }
  return result;
}

function docToRuleData(id: string, data: RuleDoc): RuleData {
  return {
    id,
    shop: data.shop,
    title: data.title,
    status: data.status === "active" ? "active" : "draft",
    discountType: data.discountType === "code" ? "code" : "automatic",
    selectionMode: data.selectionMode === "condition" ? "condition" : "variants",
    condition: data.condition ?? "",
    valueType: data.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
    value: typeof data.value === "number" ? data.value : 0,
    message: data.message ?? null,
    variants: normalizeVariants(data.variants),
    codes: Array.isArray(data.codes) ? data.codes.filter((c): c is string => typeof c === "string") : [],
    discountId: data.discountId ?? null,
    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(0),
    updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(0),
  };
}

function sanitize(input: RuleFormInput) {
  const selectionMode =
    input.selectionMode === "condition" ? "condition" : "variants";
  const condition =
    selectionMode === "condition"
      ? ALLOWED_CONDITIONS.includes(input.condition)
        ? input.condition
        : "not_on_sale"
      : "";
  return {
    title: input.title.trim() || "Untitled rule",
    status: input.status === "active" ? "active" : "draft",
    discountType: input.discountType === "code" ? "code" : "automatic",
    selectionMode,
    condition,
    valueType: input.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
    value: Number.isFinite(input.value) ? Math.max(0, input.value) : 0,
    message: input.message?.trim() ? input.message.trim() : null,
    variants: normalizeVariants(input.variants ?? []),
    codes: normalizeCodes(input.codes ?? []),
  };
}

export async function getRules(shop: string): Promise<RuleData[]> {
  const snapshot = await rulesCollection()
    .where("shop", "==", shop)
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map((doc) => docToRuleData(doc.id, doc.data() as RuleDoc));
}

export async function getRule(
  shop: string,
  id: string,
): Promise<RuleData | null> {
  const snapshot = await rulesCollection().doc(id).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as RuleDoc;
  // Scope by shop so a rule from another shop can't be returned.
  if (data.shop !== shop) return null;
  return docToRuleData(snapshot.id, data);
}

export async function createRule(
  shop: string,
  input: RuleFormInput,
): Promise<RuleData> {
  const now = FieldValue.serverTimestamp();
  const docRef = rulesCollection().doc();
  await docRef.set({
    shop,
    ...sanitize(input),
    discountId: null,
    createdAt: now,
    updatedAt: now,
  });
  // Re-read so timestamps are resolved before returning.
  const created = await docRef.get();
  return docToRuleData(created.id, created.data() as RuleDoc);
}

export async function updateRule(
  shop: string,
  id: string,
  input: RuleFormInput,
): Promise<RuleData | null> {
  const docRef = rulesCollection().doc(id);
  const snapshot = await docRef.get();
  // Scope by shop so a rule can't be edited from another shop's session.
  if (!snapshot.exists || (snapshot.data() as RuleDoc).shop !== shop) {
    return null;
  }
  await docRef.update({ ...sanitize(input), updatedAt: FieldValue.serverTimestamp() });
  return getRule(shop, id);
}

export async function deleteRule(shop: string, id: string): Promise<void> {
  const docRef = rulesCollection().doc(id);
  const snapshot = await docRef.get();
  if (!snapshot.exists) return;
  if ((snapshot.data() as RuleDoc).shop !== shop) return;
  await docRef.delete();
}

/**
 * Drop variants belonging to a product from every rule. With `keepVariantIds`
 * (products/update) only that product's variants that no longer exist are
 * removed; with `null` (products/delete) all of its variants are removed.
 * Returns true when at least one rule changed.
 */
export async function pruneProductVariants(
  shop: string,
  productGid: string,
  keepVariantIds: Set<string> | null,
): Promise<boolean> {
  const snapshot = await rulesCollection().where("shop", "==", shop).get();
  let changed = false;
  for (const doc of snapshot.docs) {
    const data = doc.data() as RuleDoc;
    const variants = normalizeVariants(data.variants);
    const next = variants.filter((variant) => {
      if (variant.productId !== productGid) return true;
      if (keepVariantIds === null) return false;
      return keepVariantIds.has(variant.id);
    });
    if (next.length !== variants.length) {
      changed = true;
      await doc.ref.update({
        variants: next,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  return changed;
}

/**
 * Build the JSON consumed by the Shopify Function: only active rules that still
 * target at least one variant. Kept small — drafts and empty rules are omitted.
 */
export function buildDiscountConfig(rules: RuleData[]) {
  return {
    rules: rules
      .filter((rule) =>
        rule.status === "active" && ruleHasTargets(rule),
      )
      .map((rule) => ({
        id: rule.id,
        status: "active" as const,
        selectionMode: rule.selectionMode,
        valueType: rule.valueType,
        value: rule.value,
        message: rule.message ?? "",
        ...(rule.selectionMode === "condition"
          ? { condition: rule.condition }
          : { variantIds: rule.variants.map((variant) => variant.id) }),
      })),
  };
}

/** A rule "targets something" if it has a condition or at least one variant. */
function ruleHasTargets(rule: RuleData): boolean {
  return rule.selectionMode === "condition"
    ? rule.condition.length > 0
    : rule.variants.length > 0;
}

/**
 * Re-aggregate every active automatic rule into the shop's shared automatic
 * discount node (created on first use). Code rules are handled separately so the
 * automatic-discount cap isn't a concern.
 */
export async function syncAutomaticRules(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<void> {
  const discountId = await ensureDiscountId(admin, shop);
  const automaticRules = (await getRules(shop)).filter(
    (rule) => rule.discountType === "automatic",
  );
  await setJsonMetafield(admin, {
    ownerId: discountId,
    namespace: DISCOUNT_NAMESPACE,
    key: DISCOUNT_KEY,
    value: buildDiscountConfig(automaticRules),
  });
}

/**
 * Sync a single code rule's own discount node: create it on first use, make its
 * redeem codes match the rule, write its config, and activate/deactivate it.
 */
export async function syncCodeRule(
  admin: AdminGraphqlClient,
  shop: string,
  rule: RuleData,
): Promise<void> {
  let discountId = rule.discountId;

  if (!discountId) {
    if (rule.codes.length === 0) return; // need at least one code to create it
    discountId = await createCodeDiscount(admin, {
      title: rule.title,
      firstCode: rule.codes[0],
    });
    await rulesCollection().doc(rule.id).update({
      discountId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await reconcileCodes(admin, discountId, rule.codes);
  await setJsonMetafield(admin, {
    ownerId: discountId,
    namespace: DISCOUNT_NAMESPACE,
    key: DISCOUNT_KEY,
    value: buildDiscountConfig([rule]),
  });

  const active =
    rule.status === "active" && ruleHasTargets(rule) && rule.codes.length > 0;
  await setCodeDiscountActive(admin, discountId, active);
}

/**
 * Sync after one rule was created or updated: handle its own node (code) or
 * clean up a leftover code node (switched to automatic), then refresh the
 * shared automatic aggregate.
 */
export async function applyRuleSync(
  admin: AdminGraphqlClient,
  shop: string,
  ruleId: string,
): Promise<void> {
  const rule = await getRule(shop, ruleId);
  if (rule) {
    if (rule.discountType === "code") {
      await syncCodeRule(admin, shop, rule);
    } else if (rule.discountId) {
      // Rule switched from code to automatic — remove its dedicated code node.
      await deleteCodeDiscount(admin, rule.discountId).catch(() => {});
      await rulesCollection().doc(rule.id).update({
        discountId: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  await syncAutomaticRules(admin, shop);
}

/** Delete a rule, clean up its code discount node, then refresh the automatic aggregate. */
export async function deleteRuleAndSync(
  admin: AdminGraphqlClient,
  shop: string,
  id: string,
): Promise<void> {
  const rule = await getRule(shop, id);
  await deleteRule(shop, id);
  if (rule?.discountType === "code" && rule.discountId) {
    await deleteCodeDiscount(admin, rule.discountId).catch(() => {});
  }
  await syncAutomaticRules(admin, shop);
}

/** Re-sync everything (automatic aggregate + every code rule). Used by webhooks. */
export async function syncAllRules(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<void> {
  await syncAutomaticRules(admin, shop);
  const codeRules = (await getRules(shop)).filter(
    (rule) => rule.discountType === "code",
  );
  for (const rule of codeRules) {
    await syncCodeRule(admin, shop, rule);
  }
}

/** Wipe every rule for a shop. Used by the GDPR redact webhook. */
export async function deleteAllRulesForShop(shop: string): Promise<number> {
  const snapshot = await rulesCollection().where("shop", "==", shop).get();
  if (snapshot.empty) return 0;
  for (let i = 0; i < snapshot.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of snapshot.docs.slice(i, i + 400)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
  return snapshot.size;
}
