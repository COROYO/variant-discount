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

// ── Code discounts ──────────────────────────────────────────────────────────
// Each code-based rule owns its own code discount node. The same Function reads
// that node's $app:rules/config metafield, so one variant of a product can be
// discounted via a code while its siblings are not.

/** Create a code app discount node (seeded with its first code) and return its GID. */
export async function createCodeDiscount(
  admin: AdminGraphqlClient,
  options: { title: string; firstCode: string },
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
        code: options.firstCode,
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

async function fetchRedeemCodes(
  admin: AdminGraphqlClient,
  discountId: string,
): Promise<Array<{ id: string; code: string }>> {
  const data = await adminGraphql<{
    codeDiscountNode: {
      codeDiscount: { codes?: { nodes: Array<{ id: string; code: string }> } };
    } | null;
  }>(
    admin,
    `#graphql
      query CodeDiscountCodes($id: ID!) {
        codeDiscountNode(id: $id) {
          codeDiscount {
            __typename
            ... on DiscountCodeApp {
              codes(first: 100) { nodes { id code } }
            }
          }
        }
      }`,
    { id: discountId },
  );
  return data.codeDiscountNode?.codeDiscount?.codes?.nodes ?? [];
}

/** Make the discount node's redeem codes match `desiredCodes` exactly. */
export async function reconcileCodes(
  admin: AdminGraphqlClient,
  discountId: string,
  desiredCodes: string[],
): Promise<void> {
  const existing = await fetchRedeemCodes(admin, discountId);
  const existingCodes = new Set(existing.map((entry) => entry.code));
  const desired = new Set(desiredCodes);

  const toAdd = desiredCodes.filter((code) => !existingCodes.has(code));
  const toRemoveIds = existing
    .filter((entry) => !desired.has(entry.code))
    .map((entry) => entry.id);

  if (toAdd.length > 0) {
    const result = await adminGraphql<{
      discountRedeemCodeBulkAdd: {
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(
      admin,
      `#graphql
        mutation AddCodes($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
          discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
            userErrors { field message }
          }
        }`,
      { discountId, codes: toAdd.map((code) => ({ code })) },
    );
    const addErrors = result.discountRedeemCodeBulkAdd.userErrors;
    if (addErrors.length) {
      throw new Error(
        `Codes konnten nicht hinzugefügt werden (evtl. bereits vergeben): ${addErrors
          .map((error) => error.message)
          .join("; ")}`,
      );
    }
  }

  if (toRemoveIds.length > 0) {
    await adminGraphql(
      admin,
      `#graphql
        mutation DeleteCodes($discountId: ID!, $ids: [ID!]) {
          discountCodeRedeemCodeBulkDelete(discountId: $discountId, ids: $ids) {
            userErrors { field message }
          }
        }`,
      { discountId, ids: toRemoveIds },
    );
  }
}

/** Activate or deactivate a code discount node. */
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

/** Permanently delete a code discount node (rule removed or switched to automatic). */
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
