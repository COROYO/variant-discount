/**
 * Minimal structural type for the Admin GraphQL client returned by
 * `authenticate.admin()` / `authenticate.webhook()`. Avoids depending on the
 * exact exported type name across SDK versions.
 */
export type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/**
 * Run an Admin GraphQL operation and return its `data`, throwing on transport
 * errors. (`admin.graphql` resolves to a `fetch` Response, so we always parse.)
 */
export async function adminGraphql<T = Record<string, unknown>>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(
    query,
    variables ? { variables } : undefined,
  );
  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }
  return body.data as T;
}

const METAFIELDS_SET = `#graphql
  mutation SetJsonMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }`;

/** Write a single JSON metafield, throwing on userErrors. */
export async function setJsonMetafield(
  admin: AdminGraphqlClient,
  input: { ownerId: string; namespace: string; key: string; value: unknown },
): Promise<void> {
  const data = await adminGraphql<{
    metafieldsSet: {
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(admin, METAFIELDS_SET, {
    metafields: [
      {
        ownerId: input.ownerId,
        namespace: input.namespace,
        key: input.key,
        type: "json",
        value: JSON.stringify(input.value ?? {}),
      },
    ],
  });

  const errors = data.metafieldsSet.userErrors;
  if (errors.length) {
    throw new Error(
      `metafieldsSet: ${errors.map((error) => error.message).join("; ")}`,
    );
  }
}
