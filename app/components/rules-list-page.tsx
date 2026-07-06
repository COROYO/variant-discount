import { useFetcher } from "react-router";
import type { PlanDefinition } from "../config/plans.shared";
import {
  formatRuleValue,
  type RuleListItem,
  type RulesListConfig,
} from "../models/rule-editor.shared";
import { AppActionButton } from "./app-action-button";
import { AppNavigateButton } from "./app-navigate-button";

type RulesListPageProps = {
  rules: RuleListItem[];
  plan: PlanDefinition;
  config: RulesListConfig;
  totalRuleCount: number;
  onIntent: (intent: string, id: string) => void;
};

function selectionSummary(rule: RuleListItem) {
  if (rule.selectionMode === "condition") {
    return "nicht reduzierte Artikel";
  }
  if (rule.selectionMode === "tags") {
    return `${rule.tagCount} Tag(s)${rule.excludedCount > 0 ? ` · ${rule.excludedCount} ausgeschlossen` : ""}`;
  }
  return `${rule.variantCount} Variante(n)`;
}

export function RulesListPage({
  rules,
  plan,
  config,
  totalRuleCount,
  onIntent,
}: RulesListPageProps) {
  const atLimit = totalRuleCount >= plan.limits.maxRules;

  return (
    <s-page heading={config.heading}>
      {!atLimit ? (
        <AppNavigateButton slot="primary-action" to={config.newRulePath}>
          Neue Regel
        </AppNavigateButton>
      ) : (
        <s-button slot="primary-action" disabled>
          Neue Regel
        </s-button>
      )}

      <s-section heading={`Plan: ${plan.name}`}>
        <s-stack direction="block" gap="base">
          <s-text color="subdued">
            {totalRuleCount} / {plan.limits.maxRules} Regeln gesamt
            {rules.length > 0 ? ` · ${rules.length} in diesem Bereich` : ""}
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
            <s-paragraph>{config.emptyDescription}</s-paragraph>
            <s-stack direction="inline" gap="base">
              <AppNavigateButton to={config.newRulePath}>
                Erste Regel anlegen
              </AppNavigateButton>
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
                      {formatRuleValue(rule)} · {selectionSummary(rule)}
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
                    <AppNavigateButton
                      variant="primary"
                      to={`${config.editRulePathPrefix}/${rule.id}`}
                    >
                      Bearbeiten
                    </AppNavigateButton>
                    <AppActionButton onAction={() => onIntent("toggle", rule.id)}>
                      {rule.status === "active" ? "Deaktivieren" : "Aktivieren"}
                    </AppActionButton>
                    <AppActionButton
                      tone="critical"
                      onAction={() => onIntent("delete", rule.id)}
                    >
                      Löschen
                    </AppActionButton>
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

export function useRulesListFetcher() {
  return useFetcher();
}

export function RulesListRoute({
  loaderData,
}: {
  loaderData: {
    rules: RuleListItem[];
    plan: PlanDefinition;
    config: RulesListConfig;
    totalRuleCount: number;
  };
}) {
  const fetcher = useRulesListFetcher();
  const submitIntent = (intent: string, id: string) =>
    fetcher.submit({ intent, id }, { method: "post" });

  return (
    <RulesListPage
      rules={loaderData.rules}
      plan={loaderData.plan}
      config={loaderData.config}
      totalRuleCount={loaderData.totalRuleCount}
      onIntent={submitIntent}
    />
  );
}
