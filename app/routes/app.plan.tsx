import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_TEST } from "../shopify.server";
import {
  PLANS,
  planFromSubscriptionName,
  type PlanId,
} from "../config/plans.shared";
import { AppNavigateButton } from "../components/app-navigate-button";
import styles from "../styles/plans.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  let currentPlanId: PlanId = "free";
  try {
    const { appSubscriptions } = await billing.check();
    currentPlanId = planFromSubscriptionName(appSubscriptions?.[0]?.name ?? null);
  } catch {
    currentPlanId = "free";
  }

  return { currentPlanId, isTest: BILLING_TEST };
};

export default function PlanPage() {
  const { currentPlanId, isTest } = useLoaderData<typeof loader>();
  const isPaid = currentPlanId === "pro" || currentPlanId === "plus";

  return (
    <s-page heading="Plan & Preise">
      <s-section>
        <s-paragraph>
          Wähle den Plan, der zu deinem Shop passt. Upgrade und Downgrade sind
          jederzeit möglich – die Abrechnung läuft sicher über Shopify.
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
              In der Entwicklung werden keine echten Gebühren berechnet.
            </s-text>
          </s-paragraph>
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
            ) : (
              <AppNavigateButton to="/app/plan/cancel">
                Auf Free wechseln
              </AppNavigateButton>
            )}
          </div>
        </div>

        <div className={`${styles.card} ${styles.cardFeatured}`}>
          <div className={styles.cardHeader}>
            <span className={styles.planName}>{PLANS.pro.name}</span>
            {isPaid ? <s-badge tone="success">Aktueller Plan</s-badge> : null}
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
              <AppNavigateButton
                to="/app/plan/cancel"
                variant="tertiary"
                tone="critical"
              >
                Kündigen (Downgrade auf Free)
              </AppNavigateButton>
            ) : currentPlanId === "plus" ? (
              <s-text color="subdued">Im internen Plan enthalten</s-text>
            ) : (
              <AppNavigateButton to="/app/plan/subscribe" variant="primary">
                Auf Pro upgraden – ${PLANS.pro.priceMonthly}/Monat
              </AppNavigateButton>
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
