import { redirect } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  applyRuleSync,
  createRule,
  deleteRemovedCodeNodes,
  deleteRuleAndSync,
  getRule,
  getRuleCodeUsage,
  getRules,
  countRules,
  PlanLimitError,
  resolveTagsToProducts,
  updateRule,
  type RuleCode,
  type RuleDiscountMode,
  type RuleDiscountType,
  type RuleFormInput,
  type RuleQuantityTier,
  type RuleSelectionMode,
  type RuleStatus,
  type RuleValueType,
  type RuleVariant,
  type TagMatchedProduct,
  type RuleData,
} from "./rules.server";
import type { CodeUsageInfo } from "./discount.server";
import { getCurrentPlan } from "./plan.server";

export type RuleEditorConfig = {
  discountMode: RuleDiscountMode;
  listPath: string;
  editPath: string;
};

export function otherEditorPath(
  config: RuleEditorConfig,
  id: string,
): string {
  return config.discountMode === "quantity"
    ? `/app/rules/${id}`
    : `/app/quantity/${id}`;
}

function defaultNewRule(discountMode: RuleDiscountMode) {
  return {
    id: "new",
    title: "",
    status: "draft" as RuleStatus,
    discountType: "automatic" as RuleDiscountType,
    discountMode,
    selectionMode: "variants" as RuleSelectionMode,
    condition: "not_on_sale",
    tags: [] as string[],
    valueType: "percentage" as RuleValueType,
    value: 10,
    quantityTiers:
      discountMode === "quantity"
        ? ([
            { minQuantity: 3, valueType: "percentage" as RuleValueType, value: 10 },
          ] as RuleQuantityTier[])
        : ([] as RuleQuantityTier[]),
    message: "",
    variants: [] as RuleVariant[],
    excludedVariants: [] as RuleVariant[],
    codes: [] as RuleCode[],
  };
}

export async function loadRuleEditor(
  { request, params }: LoaderFunctionArgs,
  config: RuleEditorConfig,
) {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id ?? "new";
  const plan = await getCurrentPlan(admin);

  const emptyUsage: Record<string, CodeUsageInfo> = {};
  const emptyTagPreview = {
    products: [] as TagMatchedProduct[],
    truncated: false,
  };

  if (id === "new") {
    return {
      rule: defaultNewRule(config.discountMode),
      usage: emptyUsage,
      tagPreview: emptyTagPreview,
      plan,
      editor: config,
    };
  }

  const rule = await getRule(session.shop, id);
  if (!rule) {
    throw new Response("Not Found", { status: 404 });
  }
  if (rule.discountMode !== config.discountMode) {
    throw redirect(otherEditorPath(config, id));
  }

  const usage = await getRuleCodeUsage(admin, rule).catch(() => emptyUsage);
  const tagPreview =
    rule.selectionMode === "tags" && rule.tags.length > 0
      ? await resolveTagsToProducts(
          admin,
          rule.tags,
          new Set(rule.excludedVariants.map((variant) => variant.id)),
        ).catch(() => emptyTagPreview)
      : emptyTagPreview;

  return {
    rule: {
      id: rule.id,
      title: rule.title,
      status: rule.status,
      discountType: rule.discountType,
      discountMode: rule.discountMode,
      selectionMode: rule.selectionMode,
      condition: rule.condition || "not_on_sale",
      tags: rule.tags,
      valueType: rule.valueType,
      value: rule.value,
      quantityTiers: rule.quantityTiers,
      message: rule.message ?? "",
      variants: rule.variants,
      excludedVariants: rule.excludedVariants,
      codes: rule.codes,
    },
    usage,
    tagPreview,
    plan,
    editor: config,
  };
}

export async function saveRuleEditor(
  { request, params }: ActionFunctionArgs,
  config: RuleEditorConfig,
) {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id ?? "new";
  const body = (await request.json()) as Partial<RuleFormInput>;
  const plan = await getCurrentPlan(admin);

  if (id !== "new") {
    const existing = await getRule(session.shop, id);
    if (existing && existing.discountMode !== config.discountMode) {
      throw redirect(otherEditorPath(config, id));
    }
  }

  const previousCodes =
    id === "new" ? [] : ((await getRule(session.shop, id))?.codes ?? []);

  const input: RuleFormInput = {
    title: typeof body.title === "string" ? body.title : "",
    status: body.status === "active" ? "active" : "draft",
    discountType: body.discountType === "code" ? "code" : "automatic",
    discountMode: config.discountMode,
    selectionMode:
      body.selectionMode === "condition"
        ? "condition"
        : body.selectionMode === "tags"
          ? "tags"
          : "variants",
    condition: typeof body.condition === "string" ? body.condition : "",
    tags: Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    valueType: body.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
    value: Number(body.value) || 0,
    quantityTiers: Array.isArray(body.quantityTiers) ? body.quantityTiers : [],
    message: typeof body.message === "string" ? body.message : null,
    variants: Array.isArray(body.variants) ? body.variants : [],
    excludedVariants: Array.isArray(body.excludedVariants)
      ? body.excludedVariants
      : [],
    codes: Array.isArray(body.codes) ? body.codes : [],
  };

  let ruleId: string;
  try {
    if (id === "new") {
      const created = await createRule(session.shop, input, plan);
      ruleId = created.id;
    } else {
      await updateRule(session.shop, id, input, plan);
      ruleId = id;
    }
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return { ok: false as const, error: error.message, warning: null };
    }
    throw error;
  }

  try {
    await applyRuleSync(admin, session.shop, ruleId);
    await deleteRemovedCodeNodes(admin, session.shop, ruleId, previousCodes);
  } catch (error) {
    return {
      ok: true as const,
      warning: error instanceof Error ? error.message : String(error),
      error: null,
    };
  }
  return { ok: true as const, warning: null, error: null };
}

export type RuleListItem = {
  id: string;
  title: string;
  status: string;
  discountType: string;
  discountMode: string;
  selectionMode: string;
  valueType: string;
  value: number;
  quantityTiers: RuleQuantityTier[];
  variantCount: number;
  tagCount: number;
  excludedCount: number;
  codeCount: number;
  thumbnails: string[];
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

export function toRuleListItem(rule: RuleData): RuleListItem {
  return {
    id: rule.id,
    title: rule.title,
    status: rule.status,
    discountType: rule.discountType,
    discountMode: rule.discountMode,
    selectionMode: rule.selectionMode,
    valueType: rule.valueType,
    value: rule.value,
    quantityTiers: rule.quantityTiers,
    variantCount: rule.variants.length,
    tagCount: rule.tags.length,
    excludedCount: rule.excludedVariants.length,
    codeCount: rule.codes.length,
    thumbnails: [...rule.variants, ...rule.excludedVariants]
      .map((variant) => variant.image)
      .filter((image): image is string => Boolean(image))
      .slice(0, 6),
  };
}

export type RulesListConfig = {
  discountMode: RuleDiscountMode;
  heading: string;
  newRulePath: string;
  editRulePath: (id: string) => string;
  emptyDescription: string;
};

export async function handleRulesListAction(
  request: Request,
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  shop: string,
) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false };

  if (intent === "delete") {
    await deleteRuleAndSync(admin, shop, id);
  } else if (intent === "toggle") {
    const rule = await getRule(shop, id);
    if (rule) {
      const plan = await getCurrentPlan(admin);
      await updateRule(
        shop,
        id,
        {
          title: rule.title,
          status: rule.status === "active" ? "draft" : "active",
          discountType: rule.discountType,
          discountMode: rule.discountMode,
          selectionMode: rule.selectionMode,
          condition: rule.condition,
          tags: rule.tags,
          valueType: rule.valueType,
          value: rule.value,
          quantityTiers: rule.quantityTiers,
          message: rule.message,
          variants: rule.variants,
          excludedVariants: rule.excludedVariants,
          codes: rule.codes,
        },
        plan,
      );
      await applyRuleSync(admin, shop, id);
    }
  }
  return { ok: true };
}

export async function loadRulesList(
  request: Request,
  config: RulesListConfig,
) {
  const { admin, session } = await authenticate.admin(request);
  const plan = await getCurrentPlan(admin);
  const totalRuleCount = await countRules(session.shop);
  const rules = (await getRules(session.shop))
    .filter((rule) => rule.discountMode === config.discountMode)
    .map(toRuleListItem);
  return { rules, plan, config, totalRuleCount };
}
