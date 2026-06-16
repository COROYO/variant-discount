import { FieldValue } from "firebase-admin/firestore";
import db from "../db.server";
import { adminGraphql, type AdminGraphqlClient } from "./admin-graphql.server";

/** One document per shop, keyed by the shop's myshopify domain. */
const shopsCollection = () => db.collection("shops");

/** Title of the automatic app discount this app manages (one per shop). */
export const DISCOUNT_TITLE = "Variant Discounts";

/** The discount node metafield the Shopify Function reads its rules from. */
export const DISCOUNT_NAMESPACE = "$app:rules";
export const DISCOUNT_KEY = "config";

/** Find this app's discount Function id (the app only owns one discount function). */
export async function resolveFunctionId(
  admin: AdminGraphqlClient,
): Promise<string | null> {
  const data = await adminGraphql<{
    shopifyFunctions: {
      nodes: Array<{ id: string; title: string; apiType: string }>;
    };
  }>(
    admin,
    `#graphql
      query DiscountFunctions {
        shopifyFunctions(first: 50, apiType: "discount") {
          nodes { id title apiType }
        }
      }`,
  );
  return data.shopifyFunctions.nodes[0]?.id ?? null;
}

/**
 * Return the GID of the automatic app discount node for this shop, creating it
 * on first use. The node carries no rules itself — its config metafield does.
 */
export async function ensureDiscountId(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<string> {
  const existingDoc = await shopsCollection().doc(shop).get();
  const existingDiscountId = existingDoc.exists
    ? (existingDoc.data() as { discountId?: string }).discountId
    : undefined;
  if (existingDiscountId) {
    return existingDiscountId;
  }

  // After a reinstall the node may already exist — reuse it before creating one.
  const found = await adminGraphql<{
    discountNodes: { nodes: Array<{ id: string }> };
  }>(
    admin,
    `#graphql
      query FindVariantDiscount($query: String!) {
        discountNodes(first: 1, query: $query) {
          nodes { id }
        }
      }`,
    { query: `title:'${DISCOUNT_TITLE.replace(/'/g, "\\'")}'` },
  );
  let discountId: string | null = found.discountNodes.nodes[0]?.id ?? null;

  if (!discountId) {
    const functionId = await resolveFunctionId(admin);
    if (!functionId) {
      throw new Error(
        "Discount function not found for this app. Run `shopify app deploy` so the function is registered, then try again.",
      );
    }

    const created = await adminGraphql<{
      discountAutomaticAppCreate: {
        automaticAppDiscount: { discountId: string } | null;
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(
      admin,
      `#graphql
        mutation CreateVariantDiscount($discount: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $discount) {
            automaticAppDiscount { discountId }
            userErrors { field message }
          }
        }`,
      {
        discount: {
          title: DISCOUNT_TITLE,
          functionId,
          startsAt: new Date().toISOString(),
          discountClasses: ["PRODUCT"],
          combinesWith: {
            orderDiscounts: true,
            productDiscounts: true,
            shippingDiscounts: true,
          },
        },
      },
    );

    const errors = created.discountAutomaticAppCreate.userErrors;
    if (errors.length) {
      throw new Error(
        `discountAutomaticAppCreate: ${errors
          .map((error) => error.message)
          .join("; ")}`,
      );
    }
    discountId =
      created.discountAutomaticAppCreate.automaticAppDiscount?.discountId ??
      null;
  }

  if (!discountId) {
    throw new Error("discountAutomaticAppCreate returned no discountId");
  }

  await shopsCollection().doc(shop).set(
    {
      shop,
      discountId,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existingDoc.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  return discountId;
}

/** Wipe the shop record. Used by the GDPR redact webhook. */
export async function deleteShopRecord(shop: string): Promise<void> {
  await shopsCollection().doc(shop).delete().catch(() => {});
}

// ── Code discounts (one node per code) ──────────────────────────────────────
// Each code gets its OWN code-discount node so it can carry an individual
// schedule (startsAt/endsAt), be activated/deactivated on its own, and report
// its own usage count. Every code of a rule shares the same function + config
// metafield (the rule's discount logic).

/** Create a code-discount node for a single code and return its GID. */
export async function createCodeNode(
  admin: AdminGraphqlClient,
  options: {
    title: string;
    code: string;
    startsAt: string | null;
    endsAt: string | null;
  },
): Promise<string> {
  const functionId = await resolveFunctionId(admin);
  if (!functionId) {
    throw new Error(
      "Discount function not found for this app. Run `shopify app deploy` so the function is registered, then try again.",
    );
  }

  const created = await adminGraphql<{
    discountCodeAppCreate: {
      codeAppDiscount: { discountId: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation CreateCodeDiscount($discount: DiscountCodeAppInput!) {
        discountCodeAppCreate(codeAppDiscount: $discount) {
          codeAppDiscount { discountId }
          userErrors { field message }
        }
      }`,
    {
      discount: {
        title: options.title,
        functionId,
        code: options.code,
        startsAt: options.startsAt ?? new Date().toISOString(),
        endsAt: options.endsAt, // null => no end date (valid until deactivated)
        discountClasses: ["PRODUCT"],
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: true,
          shippingDiscounts: true,
        },
      },
    },
  );

  const errors = created.discountCodeAppCreate.userErrors;
  if (errors.length) {
    throw new Error(
      `discountCodeAppCreate: ${errors.map((error) => error.message).join("; ")}`,
    );
  }
  const discountId = created.discountCodeAppCreate.codeAppDiscount?.discountId;
  if (!discountId) {
    throw new Error("discountCodeAppCreate returned no discountId");
  }
  return discountId;
}

/** Update a code node's schedule (start/end). Pass null for endsAt to clear it. */
export async function updateCodeNodeSchedule(
  admin: AdminGraphqlClient,
  discountId: string,
  schedule: { startsAt: string | null; endsAt: string | null },
): Promise<void> {
  const result = await adminGraphql<{
    discountCodeAppUpdate: {
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation UpdateCodeDiscount($id: ID!, $discount: DiscountCodeAppInput!) {
        discountCodeAppUpdate(id: $id, codeAppDiscount: $discount) {
          userErrors { field message }
        }
      }`,
    {
      id: discountId,
      discount: {
        startsAt: schedule.startsAt ?? new Date().toISOString(),
        endsAt: schedule.endsAt, // null => clear end date
      },
    },
  );
  const errors = result.discountCodeAppUpdate.userErrors;
  if (errors.length) {
    throw new Error(
      `discountCodeAppUpdate: ${errors.map((error) => error.message).join("; ")}`,
    );
  }
}

/** Activate or deactivate a single code node. */
export async function setCodeDiscountActive(
  admin: AdminGraphqlClient,
  discountId: string,
  active: boolean,
): Promise<void> {
  const mutation = active
    ? `#graphql
        mutation ActivateCode($id: ID!) {
          discountCodeActivate(id: $id) { userErrors { field message } }
        }`
    : `#graphql
        mutation DeactivateCode($id: ID!) {
          discountCodeDeactivate(id: $id) { userErrors { field message } }
        }`;
  await adminGraphql(admin, mutation, { id: discountId });
}

/** Permanently delete a code node (code removed, or rule deleted / switched). */
export async function deleteCodeDiscount(
  admin: AdminGraphqlClient,
  discountId: string,
): Promise<void> {
  await adminGraphql(
    admin,
    `#graphql
      mutation DeleteCodeDiscount($id: ID!) {
        discountCodeDelete(id: $id) { userErrors { field message } }
      }`,
    { id: discountId },
  );
}

export interface CodeUsageInfo {
  usageCount: number;
  status: string; // ACTIVE | SCHEDULED | EXPIRED
  startsAt: string | null;
  endsAt: string | null;
}

/** Fetch live usage + status for code nodes, keyed by discount node GID. */
export async function fetchCodeUsage(
  admin: AdminGraphqlClient,
  discountIds: string[],
): Promise<Record<string, CodeUsageInfo>> {
  const ids = discountIds.filter((id): id is string => Boolean(id));
  const result: Record<string, CodeUsageInfo> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data = await adminGraphql<{
      nodes: Array<{
        id: string;
        __typename: string;
        codeDiscount?: {
          __typename: string;
          status?: string;
          startsAt?: string | null;
          endsAt?: string | null;
          asyncUsageCount?: number;
        };
      } | null>;
    }>(
      admin,
      `#graphql
        query CodeDiscountStatuses($ids: [ID!]!) {
          nodes(ids: $ids) {
            id
            __typename
            ... on DiscountCodeNode {
              codeDiscount {
                __typename
                ... on DiscountCodeApp {
                  status
                  startsAt
                  endsAt
                  asyncUsageCount
                }
              }
            }
          }
        }`,
      { ids: chunk },
    );
    for (const node of data.nodes) {
      if (!node || !node.codeDiscount) continue;
      result[node.id] = {
        usageCount: node.codeDiscount.asyncUsageCount ?? 0,
        status: node.codeDiscount.status ?? "",
        startsAt: node.codeDiscount.startsAt ?? null,
        endsAt: node.codeDiscount.endsAt ?? null,
      };
    }
  }
  return result;
}
