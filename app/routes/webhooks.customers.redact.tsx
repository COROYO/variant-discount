import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR (mandatory): erase a specific customer's data. This app stores no
// customer personal data, so there is nothing to delete. We verify (HMAC) and
// acknowledge the webhook.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(
    `Received ${topic} webhook for ${shop} — no customer data is stored by this app`,
  );
  return new Response();
};
