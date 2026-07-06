import { FieldValue, Timestamp } from "firebase-admin/firestore";
import db from "../db.server";
import { getPlan, type PlanDefinition, type PlanId } from "../config/plans.shared";
import { setJsonMetafield, adminGraphql, type AdminGraphqlClient } from "./admin-graphql.server";
import {
  createCodeNode,
  deleteCodeDiscount,
  DISCOUNT_KEY,
  DISCOUNT_NAMESPACE,
  ensureDiscountId,
  fetchCodeUsage,
  setCodeDiscountActive,
  updateCodeNodeSchedule,
  type CodeUsageInfo,
} from "./discount.server";

/** Thrown when a write would exceed the shop's current plan limits. */
export class PlanLimitError extends Error {
  constructor(
    message: string,
    readonly limit: number,
    readonly current: number,
    readonly planId: PlanId,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

/** Count rules for a shop. Cheaper than fetching every doc. */
export async function countRules(shop: string): Promise<number> {
  const snapshot = await rulesCollection().where("shop", "==", shop).count().get();
  return snapshot.data().count;
}

/** Drop start/end scheduling from every code when the plan doesn't allow it. */
function stripCodeScheduling(codes: RuleCode[]): RuleCode[] {
  return codes.map((code) => ({ ...code, startsAt: null, endsAt: null }));
}

export type RuleValueType = "percentage" | "fixedAmount";
export type RuleStatus = "active" | "draft";
export type RuleDiscountType = "automatic" | "code";
export type RuleDiscountMode = "standard" | "quantity";
export type RuleSelectionMode = "variants" | "condition" | "tags";
export type RuleCondition = "not_on_sale";

/** A quantity threshold with its own discount value. */
export type RuleQuantityTier = {
  minQuantity: number;
  valueType: RuleValueType;
  value: number;
};

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

/** A single discount code. Each code is its own Shopify code-discount node, so
 * it can be scheduled, activated, and counted independently. (A `type`, not
 * `interface`, so it is assignable to React Router's JsonValue when submitted.) */
export type RuleCode = {
  code: string;
  discountId: string | null; // its own code-discount node GID
  startsAt: string | null; // ISO 8601, null = starts immediately
  endsAt: string | null; // ISO 8601, null = no end (valid until deactivated)
  active: boolean; // merchant on/off switch
};

export interface RuleData {
  id: string;
  shop: string;
  title: string;
  status: RuleStatus;
  discountType: RuleDiscountType;
  discountMode: RuleDiscountMode;
  selectionMode: RuleSelectionMode;
  condition: string;
  tags: string[];
  valueType: RuleValueType;
  value: number;
  quantityTiers: RuleQuantityTier[];
  message: string | null;
  variants: RuleVariant[];
  excludedVariants: RuleVariant[];
  codes: RuleCode[];
  discountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleFormInput {
  title: string;
  status: RuleStatus;
  discountType: RuleDiscountType;
  discountMode: RuleDiscountMode;
  selectionMode: RuleSelectionMode;
  condition: string;
  tags: string[];
  valueType: RuleValueType;
  value: number;
  quantityTiers: RuleQuantityTier[];
  message?: string | null;
  variants: RuleVariant[];
  excludedVariants: RuleVariant[];
  codes: RuleCode[];
}

interface RuleDoc {
  shop: string;
  title: string;
  status: string;
  discountType: string;
  discountMode?: string;
  selectionMode: string;
  condition: string;
  tags: string[];
  valueType: string;
  value: number;
  quantityTiers?: RuleQuantityTier[];
  message: string | null;
  variants: RuleVariant[];
  excludedVariants: RuleVariant[];
  codes: unknown[];
  discountId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const rulesCollection = () => db.collection("rules");

/** Trim, de-dupe (case-insensitive), drop empty product tags. */
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

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

/**
 * Normalize codes into RuleCode objects, accepting the legacy `string[]` shape.
 * Codes are trimmed, uppercased (Shopify codes are case-insensitive), and
 * de-duplicated; entries with whitespace are dropped.
 */
function normalizeRuleCodes(raw: unknown): RuleCode[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: RuleCode[] = [];
  for (const entry of raw) {
    let code = "";
    let discountId: string | null = null;
    let startsAt: string | null = null;
    let endsAt: string | null = null;
    let active = true;
    if (typeof entry === "string") {
      code = entry;
    } else if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      code = typeof obj.code === "string" ? obj.code : "";
      discountId = typeof obj.discountId === "string" ? obj.discountId : null;
      startsAt =
        typeof obj.startsAt === "string" && obj.startsAt ? obj.startsAt : null;
      endsAt = typeof obj.endsAt === "string" && obj.endsAt ? obj.endsAt : null;
      active = obj.active !== false;
    } else {
      continue;
    }
    code = code.trim().toUpperCase();
    if (!code || /\s/.test(code) || seen.has(code)) continue;
    seen.add(code);
    result.push({ code, discountId, startsAt, endsAt, active });
  }
  return result;
}

function parseSelectionMode(value: string | undefined): RuleSelectionMode {
  if (value === "condition") return "condition";
  if (value === "tags") return "tags";
  return "variants";
}

function parseDiscountMode(value: string | undefined): RuleDiscountMode {
  return value === "quantity" ? "quantity" : "standard";
}

function normalizeQuantityTiers(
  tiers: RuleQuantityTier[] | undefined,
): RuleQuantityTier[] {
  if (!Array.isArray(tiers)) return [];
  const seen = new Set<number>();
  const result: RuleQuantityTier[] = [];
  for (const tier of tiers) {
    if (!tier || typeof tier !== "object") continue;
    const minQuantity = Math.floor(Number(tier.minQuantity));
    if (!Number.isFinite(minQuantity) || minQuantity < 1 || seen.has(minQuantity)) {
      continue;
    }
    const value = Number(tier.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    seen.add(minQuantity);
    result.push({
      minQuantity,
      valueType: tier.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
      value: Math.max(0, value),
    });
  }
  return result.sort((a, b) => a.minQuantity - b.minQuantity);
}

function docToRuleData(id: string, data: RuleDoc): RuleData {
  return {
    id,
    shop: data.shop,
    title: data.title,
    status: data.status === "active" ? "active" : "draft",
    discountType: data.discountType === "code" ? "code" : "automatic",
    discountMode: parseDiscountMode(data.discountMode),
    selectionMode: parseSelectionMode(data.selectionMode),
    condition: data.condition ?? "",
    tags: normalizeTags(data.tags),
    valueType: data.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
    value: typeof data.value === "number" ? data.value : 0,
    quantityTiers: normalizeQuantityTiers(data.quantityTiers),
    message: data.message ?? null,
    variants: normalizeVariants(data.variants),
    excludedVariants: normalizeVariants(data.excludedVariants),
    codes: normalizeRuleCodes(data.codes),
    discountId: data.discountId ?? null,
    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(0),
    updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(0),
  };
}

function sanitize(input: RuleFormInput) {
  const selectionMode = parseSelectionMode(input.selectionMode);
  const discountMode = parseDiscountMode(input.discountMode);
  const condition =
    selectionMode === "condition"
      ? ALLOWED_CONDITIONS.includes(input.condition)
        ? input.condition
        : "not_on_sale"
      : "";
  const quantityTiers =
    discountMode === "quantity"
      ? normalizeQuantityTiers(input.quantityTiers ?? [])
      : [];
  return {
    title: input.title.trim() || "Untitled rule",
    status: input.status === "active" ? "active" : "draft",
    discountType: input.discountType === "code" ? "code" : "automatic",
    discountMode,
    selectionMode,
    condition,
    tags: selectionMode === "tags" ? normalizeTags(input.tags ?? []) : [],
    valueType: input.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
    value: Number.isFinite(input.value) ? Math.max(0, input.value) : 0,
    quantityTiers,
    message: input.message?.trim() ? input.message.trim() : null,
    variants:
      selectionMode === "variants" ? normalizeVariants(input.variants ?? []) : [],
    excludedVariants:
      selectionMode === "tags"
        ? normalizeVariants(input.excludedVariants ?? [])
        : [],
    codes: normalizeRuleCodes(input.codes ?? []),
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
  plan: PlanDefinition = getPlan(undefined),
): Promise<RuleData> {
  const count = await countRules(shop);
  if (count >= plan.limits.maxRules) {
    throw new PlanLimitError(
      `Plan-Limit erreicht: Im ${plan.name}-Plan sind maximal ${plan.limits.maxRules} Regeln möglich.`,
      plan.limits.maxRules,
      count,
      plan.id,
    );
  }
  const sanitized = sanitize(input);
  const finalInput = plan.features.codeScheduling
    ? sanitized
    : { ...sanitized, codes: stripCodeScheduling(sanitized.codes) };
  const now = FieldValue.serverTimestamp();
  const docRef = rulesCollection().doc();
  await docRef.set({
    shop,
    ...finalInput,
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
  plan: PlanDefinition = getPlan(undefined),
): Promise<RuleData | null> {
  const docRef = rulesCollection().doc(id);
  const snapshot = await docRef.get();
  // Scope by shop so a rule can't be edited from another shop's session.
  if (!snapshot.exists || (snapshot.data() as RuleDoc).shop !== shop) {
    return null;
  }
  const sanitized = sanitize(input);
  const finalInput = plan.features.codeScheduling
    ? sanitized
    : { ...sanitized, codes: stripCodeScheduling(sanitized.codes) };
  await docRef.update({
    ...finalInput,
    updatedAt: FieldValue.serverTimestamp(),
  });
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
function pruneVariantList(
  variants: RuleVariant[],
  productGid: string,
  keepVariantIds: Set<string> | null,
): RuleVariant[] {
  return variants.filter((variant) => {
    if (variant.productId !== productGid) return true;
    if (keepVariantIds === null) return false;
    return keepVariantIds.has(variant.id);
  });
}

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
    const excludedVariants = normalizeVariants(data.excludedVariants);
    const nextVariants = pruneVariantList(variants, productGid, keepVariantIds);
    const nextExcluded = pruneVariantList(
      excludedVariants,
      productGid,
      keepVariantIds,
    );
    if (
      nextVariants.length !== variants.length ||
      nextExcluded.length !== excludedVariants.length
    ) {
      changed = true;
      await doc.ref.update({
        variants: nextVariants,
        excludedVariants: nextExcluded,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  return changed;
}

const PRODUCTS_BY_TAGS = `#graphql
  query ProductsByTags($query: String!, $cursor: String) {
    products(first: 100, query: $query, after: $cursor) {
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

type ProductsByTagsPage = {
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

export type TagMatchedProduct = {
  id: string;
  title: string;
  image?: string;
  variants: Array<{
    id: string;
    title: string;
    excluded: boolean;
  }>;
  includedVariantCount: number;
};

function buildTagSearchQuery(tags: string[]): string {
  return tags
    .map((tag) => `tag:${escapeProductTagForSearch(tag)}`)
    .join(" OR ");
}

async function fetchProductsByTags(
  admin: AdminGraphqlClient,
  tags: string[],
  maxProducts?: number,
): Promise<{ products: ProductsByTagsPage["products"]["nodes"]; truncated: boolean }> {
  if (tags.length === 0) {
    return { products: [], truncated: false };
  }

  const query = buildTagSearchQuery(tags);
  const products: ProductsByTagsPage["products"]["nodes"] = [];
  let cursor: string | undefined;

  for (;;) {
    const page: ProductsByTagsPage = await adminGraphql<ProductsByTagsPage>(
      admin,
      PRODUCTS_BY_TAGS,
      cursor ? { query, cursor } : { query },
    );

    for (const product of page.products.nodes) {
      products.push(product);
      if (maxProducts != null && products.length >= maxProducts) {
        const productIndex = page.products.nodes.indexOf(product);
        const hasMoreInPage = productIndex < page.products.nodes.length - 1;
        return {
          products,
          truncated: hasMoreInPage || page.products.pageInfo.hasNextPage,
        };
      }
    }

    if (!page.products.pageInfo.hasNextPage) break;
    cursor = page.products.pageInfo.endCursor ?? undefined;
  }

  return { products, truncated: false };
}

/** Products matching any of the given tags, with per-variant exclusion flags. */
export async function resolveTagsToProducts(
  admin: AdminGraphqlClient,
  tags: string[],
  excludedVariantIds: Set<string>,
  maxProducts = 100,
): Promise<{ products: TagMatchedProduct[]; truncated: boolean }> {
  const { products: raw, truncated } = await fetchProductsByTags(
    admin,
    tags,
    maxProducts,
  );

  const products = raw
    .map((product) => {
      const variants = product.variants.nodes.map((variant) => ({
        id: variant.id,
        title: variant.title,
        excluded: excludedVariantIds.has(variant.id),
      }));
      return {
        id: product.id,
        title: product.title,
        ...(product.featuredImage?.url
          ? { image: product.featuredImage.url }
          : {}),
        variants,
        includedVariantCount: variants.filter((variant) => !variant.excluded)
          .length,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "de"));

  return { products, truncated };
}

/** Escape a product tag for Shopify Admin search syntax. */
function escapeProductTagForSearch(tag: string): string {
  if (/[\s:"\\]/.test(tag)) {
    return `"${tag.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return tag;
}

/**
 * Resolve all variant GIDs for products that match any of the given tags,
 * minus explicitly excluded variants.
 */
export async function resolveTagsToVariantIds(
  admin: AdminGraphqlClient,
  tags: string[],
  excludedVariantIds: Set<string>,
): Promise<string[]> {
  const { products } = await fetchProductsByTags(admin, tags);
  const variantIds = new Set<string>();

  for (const product of products) {
    for (const variant of product.variants.nodes) {
      if (!excludedVariantIds.has(variant.id)) {
        variantIds.add(variant.id);
      }
    }
  }

  return [...variantIds];
}

/** Whether the shop has at least one tag-based rule (for webhook resync). */
export async function shopHasTagRules(shop: string): Promise<boolean> {
  const snapshot = await rulesCollection().where("shop", "==", shop).get();
  return snapshot.docs.some(
    (doc) => parseSelectionMode((doc.data() as RuleDoc).selectionMode) === "tags",
  );
}

/**
 * Build the JSON consumed by the Shopify Function: only active rules that still
 * target at least one variant. Tag rules are resolved to variant GIDs at sync
 * time (minus exclusions). Kept small — drafts and empty rules are omitted.
 */
export async function buildDiscountConfig(
  admin: AdminGraphqlClient,
  rules: RuleData[],
) {
  const configRules = [];
  for (const rule of rules) {
    if (rule.status !== "active" || !ruleHasTargets(rule) || !ruleHasDiscountValue(rule)) {
      continue;
    }

    let variantIds: string[] = [];
    if (rule.selectionMode === "variants") {
      variantIds = rule.variants.map((variant) => variant.id);
    } else if (rule.selectionMode === "tags") {
      const excluded = new Set(rule.excludedVariants.map((variant) => variant.id));
      variantIds = await resolveTagsToVariantIds(admin, rule.tags, excluded);
    }

    if (rule.selectionMode !== "condition" && variantIds.length === 0) {
      continue;
    }

    configRules.push({
      id: rule.id,
      status: "active" as const,
      discountMode: rule.discountMode,
      selectionMode:
        rule.selectionMode === "condition" ? ("condition" as const) : ("variants" as const),
      valueType: rule.valueType,
      value: rule.value,
      quantityTiers: rule.quantityTiers,
      message: rule.message ?? "",
      ...(rule.selectionMode === "condition"
        ? { condition: rule.condition }
        : { variantIds }),
    });
  }

  return { rules: configRules };
}

/** A rule "targets something" if it has a condition, tags, or at least one variant. */
function ruleHasTargets(rule: RuleData): boolean {
  if (rule.selectionMode === "condition") {
    return rule.condition.length > 0;
  }
  if (rule.selectionMode === "tags") {
    return rule.tags.length > 0;
  }
  return rule.variants.length > 0;
}

/** Whether a rule has a usable discount value for sync. */
function ruleHasDiscountValue(rule: RuleData): boolean {
  if (rule.discountMode === "quantity") {
    return rule.quantityTiers.length > 0;
  }
  return rule.value > 0;
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
    value: await buildDiscountConfig(admin, automaticRules),
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
  // Migrate away from the legacy single shared node (frees its codes for reuse
  // as individual per-code nodes).
  if (rule.discountId) {
    await deleteCodeDiscount(admin, rule.discountId).catch(() => {});
  }

  const config = await buildDiscountConfig(admin, [rule]);
  const ruleLive = rule.status === "active" && ruleHasTargets(rule) && ruleHasDiscountValue(rule);
  const updatedCodes: RuleCode[] = [];

  for (const code of rule.codes) {
    let discountId = code.discountId;
    if (!discountId) {
      discountId = await createCodeNode(admin, {
        title: rule.title,
        code: code.code,
        startsAt: code.startsAt,
        endsAt: code.endsAt,
      });
    } else {
      await updateCodeNodeSchedule(admin, discountId, {
        startsAt: code.startsAt,
        endsAt: code.endsAt,
      });
    }

    await setJsonMetafield(admin, {
      ownerId: discountId,
      namespace: DISCOUNT_NAMESPACE,
      key: DISCOUNT_KEY,
      value: config,
    });

    const shouldBeActive = ruleLive && code.active;
    await setCodeDiscountActive(admin, discountId, shouldBeActive);
    if (shouldBeActive) {
      // Activating can reset the schedule to "now" — re-apply the intended dates.
      await updateCodeNodeSchedule(admin, discountId, {
        startsAt: code.startsAt,
        endsAt: code.endsAt,
      });
    }

    updatedCodes.push({ ...code, discountId });
  }

  // Persist newly created node ids and drop the legacy rule-level node id.
  await rulesCollection().doc(rule.id).update({
    codes: updatedCodes,
    discountId: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
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
    } else {
      // Switched to automatic — remove any per-code nodes this rule owned.
      await deleteAllCodeNodes(admin, rule);
      const hadNodes =
        Boolean(rule.discountId) || rule.codes.some((c) => c.discountId);
      if (hadNodes) {
        await rulesCollection().doc(rule.id).update({
          codes: rule.codes.map((c) => ({ ...c, discountId: null })),
          discountId: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }
  await syncAutomaticRules(admin, shop);
}

/** Delete every Shopify code node a rule owns (per-code nodes + legacy shared). */
async function deleteAllCodeNodes(
  admin: AdminGraphqlClient,
  rule: RuleData,
): Promise<void> {
  if (rule.discountId) {
    await deleteCodeDiscount(admin, rule.discountId).catch(() => {});
  }
  for (const code of rule.codes) {
    if (code.discountId) {
      await deleteCodeDiscount(admin, code.discountId).catch(() => {});
    }
  }
}

/** Delete a rule, clean up its code discount node, then refresh the automatic aggregate. */
export async function deleteRuleAndSync(
  admin: AdminGraphqlClient,
  shop: string,
  id: string,
): Promise<void> {
  const rule = await getRule(shop, id);
  await deleteRule(shop, id);
  if (rule) {
    await deleteAllCodeNodes(admin, rule);
  }
  await syncAutomaticRules(admin, shop);
}

/**
 * Delete code nodes for codes that were removed from a rule while editing.
 * Pass the rule's codes as they were *before* the update.
 */
export async function deleteRemovedCodeNodes(
  admin: AdminGraphqlClient,
  shop: string,
  ruleId: string,
  previousCodes: RuleCode[],
): Promise<void> {
  const current = await getRule(shop, ruleId);
  const keep = new Set((current?.codes ?? []).map((c) => c.code));
  for (const code of previousCodes) {
    if (code.discountId && !keep.has(code.code)) {
      await deleteCodeDiscount(admin, code.discountId).catch(() => {});
    }
  }
}

/** Live usage + status for a rule's codes, keyed by the code string. */
export async function getRuleCodeUsage(
  admin: AdminGraphqlClient,
  rule: RuleData,
): Promise<Record<string, CodeUsageInfo>> {
  const withIds = rule.codes.filter((c) => c.discountId);
  if (withIds.length === 0) return {};
  const byId = await fetchCodeUsage(
    admin,
    withIds.map((c) => c.discountId as string),
  );
  const byCode: Record<string, CodeUsageInfo> = {};
  for (const c of withIds) {
    const info = byId[c.discountId as string];
    if (info) byCode[c.code] = info;
  }
  return byCode;
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
