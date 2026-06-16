import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR (mandatory): a store owner requested a customer's data on behalf of that
// customer. This app stores no customer personal data — only product variant
// GIDs and discount rules — so there is nothing to return. We still verify the
// webhook (HMAC) and acknowledge it.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(
    `Received ${topic} webhook for ${shop} — no customer data is stored by this app`,
  );
  return new Response();
};
