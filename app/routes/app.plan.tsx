import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, PRO_PLAN } from "../shopify.server";
import { resolveBillingIsTest } from "../models/billing.server";
import {
  PLANS,
  planFromSubscriptionName,
  type PlanId,
} from "../config/plans.shared";
import { AppActionButton } from "../components/app-action-button";
import styles from "../styles/plans.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);

  let currentPlanId: PlanId = "free";
  try {
    const { appSubscriptions } = await billing.check();
    currentPlanId = planFromSubscriptionName(
      appSubscriptions?.[0]?.name ?? null,
    );
  } catch {
    currentPlanId = "free";
  }

  const isTest = await resolveBillingIsTest(admin);
  return { currentPlanId, isTest };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session, redirect } =
    await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_action");

  if (intent === "subscribe") {
    try {
      // Create the Pro subscription with the Billing API (`appSubscriptionCreate`)
      // and send the merchant to Shopify's hosted charge-approval page, where
      // they accept or decline the charge. `redirect` with target "_top" breaks
      // out of the embedded iframe via App Bridge (the same proven mechanism the
      // widerruf app uses). This needs no Partner-Dashboard pricing config —
      // unlike the previous App Pricing redirect, which 404'd.
      const isTest = await resolveBillingIsTest(admin);
      const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
      const returnUrl = `${appUrl}/app/plan?shop=${encodeURIComponent(
        session.shop,
      )}`;

      const response = await admin.graphql(
        `#graphql
        mutation CreateProSubscription(
          $name: String!
          $returnUrl: URL!
          $test: Boolean!
          $lineItems: [AppSubscriptionLineItemInput!]!
        ) {
          appSubscriptionCreate(
            name: $name
            returnUrl: $returnUrl
            test: $test
            lineItems: $lineItems
          ) {
            confirmationUrl
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            name: PRO_PLAN,
            returnUrl,
            test: isTest,
            lineItems: [
              {
                plan: {
                  appRecurringPricingDetails: {
                    price: {
                      amount: PLANS.pro.priceMonthly,
                      currencyCode: "USD",
                    },
                    interval: "EVERY_30_DAYS",
                  },
                },
              },
            ],
          },
        },
      );

      const result = (await response.json()) as {
        data?: {
          appSubscriptionCreate?: {
            confirmationUrl?: string | null;
            userErrors?: { message: string }[];
          };
        };
      };

      const payload = result.data?.appSubscriptionCreate;
      const userErrors = payload?.userErrors ?? [];
      if (userErrors.length > 0 || !payload?.confirmationUrl) {
        return {
          error:
            userErrors.map((e) => e.message).join(" ") ||
            "Das Pro-Abo konnte nicht erstellt werden. Bitte versuche es erneut.",
        };
      }

      throw redirect(payload.confirmationUrl, { target: "_top" });
    } catch (error) {
      // Let the redirect (and any other Response) propagate so App Bridge can
      // perform the top-level redirect; only surface real errors in the UI.
      if (error instanceof Response) throw error;
      return {
        error:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Erstellen des Abos.",
      };
    }
  }

  if (intent === "cancel") {
    // Downgrade to Free by cancelling the active subscription.
    try {
      const { appSubscriptions } = await billing.check();
      const subscription = appSubscriptions?.[0];
      if (subscription) {
        await billing.cancel({
          subscriptionId: subscription.id,
          isTest: subscription.test,
          prorate: true,
        });
      }
    } catch {
      // No active subscription to cancel — already on Free.
    }
    return { ok: true };
  }

  return null;
};

export default function PlanPage() {
  const { currentPlanId, isTest } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const errorMessage =
    actionData && "error" in actionData ? actionData.error : null;

  const upgrade = () => submit({ _action: "subscribe" }, { method: "post" });
  const downgrade = () => submit({ _action: "cancel" }, { method: "post" });

  return (
    <s-page heading="Plan & Preise">
      <s-section>
        <s-paragraph>
          Wähle den Plan, der zu deinem Shop passt. Plan-Auswahl und Abrechnung
          laufen sicher über Shopify – Upgrade und Downgrade sind jederzeit
          möglich.
        </s-paragraph>
        {currentPlanId === "plus" ? (
          <s-paragraph>
            <s-text color="subdued">
              Dein Shop nutzt aktuell einen internen Plan (Plus) mit allen
              Funktionen.
            </s-text>
          </s-paragraph>
        ) : null}
        {isTest ? (
          <s-paragraph>
            <s-badge tone="info">Testmodus</s-badge>{" "}
            <s-text color="subdued">
              In Entwicklungs-Shops fallen keine echten Gebühren an.
            </s-text>
          </s-paragraph>
        ) : null}
        {errorMessage ? (
          <p style={{ color: "#bf0711", margin: "8px 0 0" }}>{errorMessage}</p>
        ) : null}
      </s-section>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.planName}>{PLANS.free.name}</span>
            {currentPlanId === "free" ? (
              <s-badge tone="success">Aktueller Plan</s-badge>
            ) : null}
          </div>
          <div className={styles.price}>
            $0<span className={styles.interval}> / Monat</span>
          </div>
          <ul className={styles.featureList}>
            <li>Bis zu {PLANS.free.limits.maxRules} Rabattregeln</li>
            <li>Automatische Rabatte und Rabattcodes</li>
            <li>Varianten- und Bedingungsauswahl</li>
          </ul>
          <div className={styles.actions}>
            {currentPlanId === "free" ? (
              <s-text color="subdued">Dein aktiver Plan</s-text>
            ) : currentPlanId === "plus" ? (
              <s-text color="subdued">Interner Plan aktiv</s-text>
            ) : (
              <AppActionButton
                onAction={downgrade}
                {...(busy ? { loading: true } : {})}
              >
                Auf Free wechseln
              </AppActionButton>
            )}
          </div>
        </div>

        <div className={`${styles.card} ${styles.cardFeatured}`}>
          <div className={styles.cardHeader}>
            <span className={styles.planName}>{PLANS.pro.name}</span>
            {currentPlanId === "pro" ? (
              <s-badge tone="success">Aktueller Plan</s-badge>
            ) : null}
          </div>
          <div className={styles.price}>
            ${PLANS.pro.priceMonthly}
            <span className={styles.interval}> / Monat</span>
          </div>
          <ul className={styles.featureList}>
            <li>Bis zu {PLANS.pro.limits.maxRules} Rabattregeln</li>
            <li>Start-/Endzeit und Aktivierung pro Code</li>
            <li>Alle Funktionen des Free-Plans</li>
          </ul>
          <div className={styles.actions}>
            {currentPlanId === "pro" ? (
              <AppActionButton
                variant="tertiary"
                onAction={downgrade}
                {...(busy ? { loading: true } : {})}
              >
                Pro kündigen
              </AppActionButton>
            ) : currentPlanId === "plus" ? (
              <s-text color="subdued">Interner Plan aktiv</s-text>
            ) : (
              <AppActionButton
                variant="primary"
                onAction={upgrade}
                {...(busy ? { loading: true } : {})}
              >
                Auf Pro upgraden – ${PLANS.pro.priceMonthly}/Monat
              </AppActionButton>
            )}
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
