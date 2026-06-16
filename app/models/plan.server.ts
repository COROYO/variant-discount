import {
  DEFAULT_PLAN,
  getPlan,
  planFromSubscriptionName,
  type PlanDefinition,
  type PlanId,
} from "../config/plans.shared";
import { adminGraphql, type AdminGraphqlClient } from "./admin-graphql.server";

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query ActiveAppSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        name
        status
      }
    }
  }`;

interface ActiveSubscriptionsData {
  currentAppInstallation: {
    activeSubscriptions: Array<{ name: string; status: string }>;
  } | null;
}

/**
 * Resolve the current plan for a shop by inspecting its active Shopify
 * AppSubscriptions. Falls back to the default plan when no paid subscription
 * is active or the billing query fails (we never want a billing hiccup to lock
 * a merchant out of the app).
 */
export async function getCurrentPlanId(
  admin: AdminGraphqlClient,
): Promise<PlanId> {
  try {
    const data = await adminGraphql<ActiveSubscriptionsData>(
      admin,
      ACTIVE_SUBSCRIPTIONS_QUERY,
    );
    const active = data.currentAppInstallation?.activeSubscriptions ?? [];
    const subscription = active.find((sub) => sub.status === "ACTIVE");
    return planFromSubscriptionName(subscription?.name);
  } catch {
    return DEFAULT_PLAN;
  }
}

export async function getCurrentPlan(
  admin: AdminGraphqlClient,
): Promise<PlanDefinition> {
  return getPlan(await getCurrentPlanId(admin));
}
