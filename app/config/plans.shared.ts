/**
 * Plan catalog for Variant Discounts. The single source of truth for plan
 * names, billing identifiers, limits, and feature flags. Imported by both the
 * server (limit enforcement, billing detection) and the UI (gating, copy).
 */

export type PlanId = "free" | "pro" | "plus";

export interface PlanFeatures {
  /** Per-code start/end scheduling for code rules. */
  codeScheduling: boolean;
}

export interface PlanLimits {
  /** Hard cap on the number of rules a shop may keep. */
  maxRules: number;
}

export interface PlanDefinition {
  id: PlanId;
  /** Human-readable plan name, used in UI and billing. Must match the
   * `name` of the Shopify AppSubscription when querying billing. */
  name: string;
  /** Monthly price in the shop currency (display only). */
  priceMonthly: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

/** Sentinel used as "unlimited" without leaking Infinity into JSON / Firestore. */
export const UNLIMITED = 9999;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    limits: { maxRules: 3 },
    features: { codeScheduling: false },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 5,
    limits: { maxRules: 25 },
    features: { codeScheduling: true },
  },
  // "Plus" is an umbrella for any internal/partner/staff plan whose Shopify
  // subscription name contains "plus" (e.g. "Pro Plus", "Plus Internal").
  // Every feature is unlocked and limits are effectively unlimited.
  plus: {
    id: "plus",
    name: "Plus",
    priceMonthly: 0,
    limits: { maxRules: UNLIMITED },
    features: { codeScheduling: true },
  },
};

export const DEFAULT_PLAN: PlanId = "free";

export function getPlan(id: PlanId | string | null | undefined): PlanDefinition {
  if (id && id in PLANS) return PLANS[id as PlanId];
  return PLANS[DEFAULT_PLAN];
}

/**
 * Resolve a plan from a Shopify AppSubscription name. Returns the default plan
 * when no subscription is active or the name is unknown.
 *
 * Matching order:
 * 1. Names containing "plus" → `plus` (internal/partner/staff plans)
 * 2. Names containing "pro" → `pro` (billing variants like "pro-test", "test-pro")
 * 3. Exact name match for remaining plans (e.g. "Free")
 */
export function planFromSubscriptionName(
  name: string | null | undefined,
): PlanId {
  if (!name) return DEFAULT_PLAN;
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("plus")) return "plus";
  if (normalized.includes("pro")) return "pro";
  for (const plan of Object.values(PLANS)) {
    if (plan.id === "plus" || plan.id === "pro") continue;
    if (plan.name.toLowerCase() === normalized) return plan.id;
  }
  return DEFAULT_PLAN;
}
