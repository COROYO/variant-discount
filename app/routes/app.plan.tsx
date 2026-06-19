import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopifyAppPricingPlansUrl } from "../models/billing.server";
import { PLANS } from "../config/plans.shared";
import { AppActionButton } from "../components/app-action-button";
import styles from "../styles/plans.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  // For Shopify App Pricing apps, `billing.check()` reports whether the shop has
  // an active (paid) subscription. Free plan = no active payment.
  let hasPaidPlan = false;
  try {
    const { hasActivePayment } = await billing.check();
    hasPaidPlan = hasActivePayment;
  } catch {
    hasPaidPlan = false;
  }

  return { hasPaidPlan };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);

  // Shopify App Pricing hosts the plan selection page. Redirecting there with
  // target "_top" breaks out of the embedded iframe via App Bridge. Upgrade,
  // downgrade and cancellation are all handled by Shopify on that page — the
  // Billing API (appSubscriptionCreate) is intentionally not used because it is
  // blocked for App Pricing apps.
  throw redirect(getShopifyAppPricingPlansUrl(session.shop), {
    target: "_top",
  });
};

export default function PlanPage() {
  const { hasPaidPlan } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const openPlans = () => submit({ _action: "manage" }, { method: "post" });

  return (
    <s-page heading="Plan & Preise">
      <s-section>
        <s-paragraph>
          Wähle den Plan, der zu deinem Shop passt. Plan-Auswahl und Abrechnung
          laufen sicher über Shopify – Upgrade, Downgrade und Kündigung sind
          jederzeit über die Plan-Seite von Shopify möglich.
        </s-paragraph>
      </s-section>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.planName}>{PLANS.free.name}</span>
            {!hasPaidPlan ? (
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
            {!hasPaidPlan ? (
              <s-text color="subdued">Dein aktiver Plan</s-text>
            ) : (
              <AppActionButton
                onAction={openPlans}
                {...(busy ? { loading: true } : {})}
              >
                Zu Free wechseln
              </AppActionButton>
            )}
          </div>
        </div>

        <div className={`${styles.card} ${styles.cardFeatured}`}>
          <div className={styles.cardHeader}>
            <span className={styles.planName}>{PLANS.pro.name}</span>
            {hasPaidPlan ? (
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
            {hasPaidPlan ? (
              <AppActionButton
                variant="tertiary"
                onAction={openPlans}
                {...(busy ? { loading: true } : {})}
              >
                Plan verwalten
              </AppActionButton>
            ) : (
              <AppActionButton
                variant="primary"
                onAction={openPlans}
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
