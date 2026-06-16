import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  applyRuleSync,
  deleteRuleAndSync,
  getRule,
  getRules,
  updateRule,
} from "../models/rules.server";
import { getCurrentPlan } from "../models/plan.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const plan = await getCurrentPlan(admin);
  const rules = (await getRules(session.shop)).map((rule) => ({
    id: rule.id,
    title: rule.title,
    status: rule.status,
    discountType: rule.discountType,
    selectionMode: rule.selectionMode,
    valueType: rule.valueType,
    value: rule.value,
    variantCount: rule.variants.length,
    codeCount: rule.codes.length,
    thumbnails: rule.variants
      .map((variant) => variant.image)
      .filter((image): image is string => Boolean(image))
      .slice(0, 6),
  }));
  return { rules, plan };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false };

  if (intent === "delete") {
    await deleteRuleAndSync(admin, session.shop, id);
  } else if (intent === "toggle") {
    const rule = await getRule(session.shop, id);
    if (rule) {
      const plan = await getCurrentPlan(admin);
      await updateRule(
        session.shop,
        id,
        {
          title: rule.title,
          status: rule.status === "active" ? "draft" : "active",
          discountType: rule.discountType,
          selectionMode: rule.selectionMode,
          condition: rule.condition,
          valueType: rule.valueType,
          value: rule.value,
          message: rule.message,
          variants: rule.variants,
          codes: rule.codes,
        },
        plan,
      );
      await applyRuleSync(admin, session.shop, id);
    }
  }
  return { ok: true };
};

function formatValue(rule: { valueType: string; value: number }) {
  return rule.valueType === "percentage"
    ? `${rule.value} %`
    : `${rule.value.toFixed(2)} (fester Betrag)`;
}

export default function RulesIndex() {
  const { rules, plan } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const submitIntent = (intent: string, id: string) =>
    fetcher.submit({ intent, id }, { method: "post" });

  const atLimit = rules.length >= plan.limits.maxRules;

  return (
    <s-page heading="Variant-Rabatte">
      <s-button
        slot="primary-action"
        {...(atLimit ? { disabled: true } : { href: "/app/rules/new" })}
      >
        Neue Regel
      </s-button>

      <s-section heading={`Plan: ${plan.name}`}>
        <s-stack direction="block" gap="base">
          <s-text color="subdued">
            {rules.length} / {plan.limits.maxRules} Regeln verwendet
            {plan.features.codeScheduling
              ? " · Code-Planung aktiv"
              : " · Code-Planung nur im Pro-Plan"}
          </s-text>
          {atLimit ? (
            <s-banner tone="warning">
              Plan-Limit erreicht.{" "}
              {plan.id === "free"
                ? "Upgrade auf Pro für bis zu 25 Regeln."
                : "Bitte lösche eine bestehende Regel, um eine neue anzulegen."}
            </s-banner>
          ) : null}
        </s-stack>
      </s-section>

      <s-section heading="Regeln">
        {rules.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Noch keine Regeln. Lege eine Regel an, um gezielt einzelne Varianten
              zu rabattieren – z.&nbsp;B. nur die 50&nbsp;g-Variante, nicht die
              100&nbsp;g-Variante desselben Produkts.
            </s-paragraph>
            <s-stack direction="inline" gap="base">
              <s-button href="/app/rules/new">Erste Regel anlegen</s-button>
            </s-stack>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            {rules.map((rule) => (
              <s-box
                key={rule.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack
                  direction="inline"
                  gap="base"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-text type="strong">{rule.title}</s-text>
                      <s-badge
                        tone={rule.status === "active" ? "success" : "neutral"}
                      >
                        {rule.status === "active" ? "Aktiv" : "Entwurf"}
                      </s-badge>
                      <s-badge tone="info">
                        {rule.discountType === "code"
                          ? "Code"
                          : "Automatisch"}
                      </s-badge>
                    </s-stack>
                    <s-text color="subdued">
                      {formatValue(rule)} ·{" "}
                      {rule.selectionMode === "condition"
                        ? "nicht reduzierte Artikel"
                        : `${rule.variantCount} Variante(n)`}
                      {rule.discountType === "code"
                        ? ` · ${rule.codeCount} Code(s)`
                        : ""}
                    </s-text>
                    {rule.thumbnails.length > 0 ? (
                      <s-stack direction="inline" gap="base" alignItems="center">
                        {rule.thumbnails.map((src, index) => (
                          <s-thumbnail
                            key={`${rule.id}-${index}`}
                            src={src}
                            alt=""
                            size="small"
                          />
                        ))}
                      </s-stack>
                    ) : null}
                  </s-stack>

                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-button variant="primary" href={`/app/rules/${rule.id}`}>
                      Bearbeiten
                    </s-button>
                    <s-button onClick={() => submitIntent("toggle", rule.id)}>
                      {rule.status === "active" ? "Deaktivieren" : "Aktivieren"}
                    </s-button>
                    <s-button
                      tone="critical"
                      onClick={() => submitIntent("delete", rule.id)}
                    >
                      Löschen
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
