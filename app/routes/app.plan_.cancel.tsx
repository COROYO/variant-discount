import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate, BILLING_TEST } from "../shopify.server";

/** Cancel the active subscription (downgrade to Free), then return to the plan page. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { appSubscriptions } = await billing.check();
  const active = appSubscriptions?.[0];
  if (active) {
    await billing.cancel({
      subscriptionId: active.id,
      isTest: BILLING_TEST,
      prorate: true,
    });
  }
  return redirect("/app/plan");
};
