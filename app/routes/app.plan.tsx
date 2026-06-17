import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_TEST } from "../shopify.server";
import { getShopifyAppPricingPlansUrl } from "../models/billing.server";
import {
  PLANS,
  planFromSubscriptionName,
  type PlanId,
} from "../config/plans.shared";
import { AppActionButton } from "../components/app-action-button";
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("_action") === "subscribe") {
    // Hand off to Shopify's hosted plan-selection page. The Admin `redirect`
    // helper with target "_top" breaks out of the embedded iframe (unlike
    // billing.request, which was the source of the earlier error). Shopify
    // handles selection, approval, upgrade and cancellation there.
    throw redirect(getShopifyAppPricingPlansUrl(session.shop), {
      target: "_top",
    });
  }

  return null;
};

export default function PlanPage() {
  const { currentPlanId, isTest } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const openPlans = () => submit({ _action: "subscribe" }, { method: "post" });
  const isPaid = currentPlanId === "pro" || currentPlanId === "plus";

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
              In der Entwicklung fallen keine echten Gebühren an.
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
              <AppActionButton
                onAction={openPlans}
                {...(busy ? { loading: true } : {})}
              >
                Plan ändern
              </AppActionButton>
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
            {isPaid ? (
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
