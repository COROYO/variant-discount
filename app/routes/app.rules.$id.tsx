import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  applyRuleSync,
  createRule,
  deleteRemovedCodeNodes,
  getRule,
  getRuleCodeUsage,
  PlanLimitError,
  updateRule,
  type RuleCode,
  type RuleDiscountType,
  type RuleFormInput,
  type RuleSelectionMode,
  type RuleStatus,
  type RuleValueType,
  type RuleVariant,
} from "../models/rules.server";
import type { CodeUsageInfo } from "../models/discount.server";
import { getCurrentPlan } from "../models/plan.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id ?? "new";
  const plan = await getCurrentPlan(admin);

  const emptyUsage: Record<string, CodeUsageInfo> = {};

  if (id === "new") {
    return {
      rule: {
        id: "new",
        title: "",
        status: "draft" as RuleStatus,
        discountType: "automatic" as RuleDiscountType,
        selectionMode: "variants" as RuleSelectionMode,
        condition: "not_on_sale",
        valueType: "percentage" as RuleValueType,
        value: 10,
        message: "",
        variants: [] as RuleVariant[],
        codes: [] as RuleCode[],
      },
      usage: emptyUsage,
      plan,
    };
  }

  const rule = await getRule(session.shop, id);
  if (!rule) {
    throw new Response("Not Found", { status: 404 });
  }
  // Live usage + status per code (best-effort; never blocks editing).
  const usage = await getRuleCodeUsage(admin, rule).catch(() => emptyUsage);
  return {
    rule: {
      id: rule.id,
      title: rule.title,
      status: rule.status,
      discountType: rule.discountType,
      selectionMode: rule.selectionMode,
      condition: rule.condition || "not_on_sale",
      valueType: rule.valueType,
      value: rule.value,
      message: rule.message ?? "",
      variants: rule.variants,
      codes: rule.codes,
    },
    usage,
    plan,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id ?? "new";
  const body = (await request.json()) as Partial<RuleFormInput>;
  const plan = await getCurrentPlan(admin);

  // Capture the codes as they were before saving so we can delete the discount
  // nodes of any codes the merchant removed.
  const previousCodes =
    id === "new" ? [] : ((await getRule(session.shop, id))?.codes ?? []);

  const input: RuleFormInput = {
    title: typeof body.title === "string" ? body.title : "",
    status: body.status === "active" ? "active" : "draft",
    discountType: body.discountType === "code" ? "code" : "automatic",
    selectionMode: body.selectionMode === "condition" ? "condition" : "variants",
    condition: typeof body.condition === "string" ? body.condition : "",
    valueType: body.valueType === "fixedAmount" ? "fixedAmount" : "percentage",
    value: Number(body.value) || 0,
    message: typeof body.message === "string" ? body.message : null,
    variants: Array.isArray(body.variants) ? body.variants : [],
    codes: Array.isArray(body.codes) ? body.codes : [],
  };

  let ruleId: string;
  try {
    if (id === "new") {
      const created = await createRule(session.shop, input, plan);
      ruleId = created.id;
    } else {
      await updateRule(session.shop, id, input, plan);
      ruleId = id;
    }
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return { ok: false as const, error: error.message, warning: null };
    }
    throw error;
  }

  // The rule is saved regardless; surface a sync failure (e.g. function not yet
  // deployed, or a code already in use) as a warning rather than losing it.
  try {
    await applyRuleSync(admin, session.shop, ruleId);
    await deleteRemovedCodeNodes(admin, session.shop, ruleId, previousCodes);
  } catch (error) {
    return {
      ok: true as const,
      warning: error instanceof Error ? error.message : String(error),
      error: null,
    };
  }
  return { ok: true as const, warning: null, error: null };
};

function readValue(event: Event): string {
  const target = event.currentTarget as HTMLInputElement | null;
  return target?.value ?? "";
}

/** ISO datetime -> value for a <input type="datetime-local"> (local time). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local value -> ISO string (or null when empty/invalid). */
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function RuleEditor() {
  const { rule, usage, plan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [title, setTitle] = useState(rule.title);
  const [status, setStatus] = useState<RuleStatus>(rule.status);
  const [discountType, setDiscountType] = useState<RuleDiscountType>(
    rule.discountType,
  );
  const [selectionMode, setSelectionMode] = useState<RuleSelectionMode>(
    rule.selectionMode,
  );
  const [condition, setCondition] = useState(rule.condition);
  const [valueType, setValueType] = useState<RuleValueType>(rule.valueType);
  const [value, setValue] = useState(String(rule.value));
  const [message, setMessage] = useState(rule.message);
  const [variants, setVariants] = useState<RuleVariant[]>(rule.variants);
  const [codes, setCodes] = useState<RuleCode[]>(rule.codes);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const codeFieldRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addCodeRef = useRef<() => void>(() => {});

  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    if (!actionData) return;
    if (!actionData.ok) {
      if (actionData.error) {
        shopify.toast.show(actionData.error, { isError: true, duration: 8000 });
      }
      return;
    }
    if (actionData.warning) {
      shopify.toast.show(
        `Gespeichert, aber Rabatt konnte nicht synchronisiert werden: ${actionData.warning}`,
        { isError: true, duration: 8000 },
      );
    } else {
      shopify.toast.show("Regel gespeichert");
    }
    navigate("/app");
  }, [actionData, navigate, shopify]);

  // Add the code on Enter. Polaris fields don't expose an onKeyDown prop, so we
  // attach a native listener to the field element while the code section is shown.
  useEffect(() => {
    if (discountType !== "code") return;
    const field = codeFieldRef.current;
    if (!field) return;
    const handler = (event: Event) => {
      if ((event as KeyboardEvent).key === "Enter") {
        event.preventDefault();
        addCodeRef.current();
      }
    };
    field.addEventListener("keydown", handler);
    return () => field.removeEventListener("keydown", handler);
  }, [discountType]);

  const pickVariants = async () => {
    const selection = await shopify.resourcePicker({
      type: "variant",
      multiple: true,
      selectionIds: variants.map((variant) => ({ id: variant.id })),
    });
    if (!selection) return;
    setVariants(
      selection.map((variant) => ({
        id: variant.id,
        productId: variant.product?.id ?? "",
        title:
          variant.displayName ||
          `${variant.product?.title ?? ""} · ${variant.title ?? ""}`.trim(),
        image:
          variant.image?.originalSrc ??
          variant.product?.images?.[0]?.originalSrc ??
          undefined,
      })),
    );
  };

  const removeVariant = (id: string) =>
    setVariants((prev) => prev.filter((variant) => variant.id !== id));

  const addCode = () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    if (/\s/.test(code)) {
      setCodeError("Codes dürfen keine Leerzeichen enthalten.");
      return;
    }
    if (codes.some((entry) => entry.code === code)) {
      setCodeError("Dieser Code wurde bereits hinzugefügt.");
      return;
    }
    setCodes((prev) => [
      ...prev,
      { code, discountId: null, startsAt: null, endsAt: null, active: true },
    ]);
    setCodeInput("");
    setCodeError("");
  };
  // Keep the keydown listener pointing at the latest closure.
  addCodeRef.current = addCode;

  const removeCode = (code: string) =>
    setCodes((prev) => prev.filter((entry) => entry.code !== code));

  const updateCodeAt = (index: number, patch: Partial<RuleCode>) =>
    setCodes((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );

  const toggleCodeActive = (index: number) =>
    setCodes((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, active: !entry.active } : entry,
      ),
    );

  const importCodesFromCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const seen = new Set(codes.map((entry) => entry.code));
    const toAdd: RuleCode[] = [];
    for (const raw of text.split(/[\r\n,;\t]+/)) {
      const code = raw.trim().toUpperCase();
      if (!code || /\s/.test(code) || seen.has(code)) continue;
      seen.add(code);
      toAdd.push({
        code,
        discountId: null,
        startsAt: null,
        endsAt: null,
        active: true,
      });
    }
    if (toAdd.length > 0) {
      setCodes((prev) => [...prev, ...toAdd]);
    }
    setCodeError("");
    event.target.value = ""; // allow re-importing the same file
    shopify.toast.show(`${toAdd.length} neue(r) Code(s) importiert`);
  };

  const save = () => {
    submit(
      {
        title,
        status,
        discountType,
        selectionMode,
        condition,
        valueType,
        value: Number(value) || 0,
        message,
        variants,
        codes,
      },
      { method: "post", encType: "application/json" },
    );
  };

  return (
    <s-page heading={rule.id === "new" ? "Neue Regel" : "Regel bearbeiten"}>
      <s-button
        slot="primary-action"
        onClick={save}
        {...(isSaving ? { loading: true } : {})}
      >
        Speichern
      </s-button>

      <s-section heading="Einstellungen">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Interner Titel"
            name="title"
            autocomplete="off"
            value={title}
            onChange={(event: Event) => setTitle(readValue(event))}
          />

          <s-select
            label="Status"
            name="status"
            value={status}
            onChange={(event: Event) => setStatus(readValue(event) as RuleStatus)}
          >
            <s-option value="draft">Entwurf</s-option>
            <s-option value="active">Aktiv</s-option>
          </s-select>

          <s-select
            label="Rabatttyp"
            name="discountType"
            value={discountType}
            onChange={(event: Event) =>
              setDiscountType(readValue(event) as RuleDiscountType)
            }
          >
            <s-option value="automatic">Automatischer Rabatt</s-option>
            <s-option value="code">Rabattcode</s-option>
          </s-select>

          <s-select
            label="Variantenauswahl"
            name="selectionMode"
            value={selectionMode}
            onChange={(event: Event) =>
              setSelectionMode(readValue(event) as RuleSelectionMode)
            }
          >
            <s-option value="variants">Manuell ausgewählte Varianten</s-option>
            <s-option value="condition">Automatisch nach Bedingung</s-option>
          </s-select>

          <s-select
            label="Rabattart"
            name="valueType"
            value={valueType}
            onChange={(event: Event) =>
              setValueType(readValue(event) as RuleValueType)
            }
          >
            <s-option value="percentage">Prozentual (%)</s-option>
            <s-option value="fixedAmount">Fester Betrag pro Stück</s-option>
          </s-select>

          <s-number-field
            label={valueType === "percentage" ? "Rabatt in %" : "Rabatt pro Stück"}
            name="value"
            value={value}
            min={0}
            {...(valueType === "percentage" ? { max: 100 } : {})}
            onChange={(event: Event) => setValue(readValue(event))}
          />

          <s-text-field
            label="Hinweistext im Warenkorb (optional)"
            name="message"
            autocomplete="off"
            value={message}
            onChange={(event: Event) => setMessage(readValue(event))}
          />
        </s-stack>
      </s-section>

      {discountType === "code" ? (
        <s-section heading="Rabattcodes">
          <s-stack direction="block" gap="base">
            <s-text color="subdued">
              Füge einen oder mehrere Codes hinzu, mit denen Kund:innen diesen
              Rabatt im Checkout einlösen können. Mit Enter bestätigen oder eine
              CSV importieren (ein Code pro Zeile oder kommagetrennt). Jeder
              Code kann einzeln deaktiviert werden.{" "}
              {plan.features.codeScheduling
                ? "Mit Start-/Endzeit versehen; ohne Zeitangabe gilt er sofort und unbegrenzt, bis er deaktiviert wird."
                : "Code-Planung (Start-/Endzeit pro Code) ist nur im Pro-Plan verfügbar."}{" "}
              Änderungen greifen nach dem Speichern.
            </s-text>
            {!plan.features.codeScheduling ? (
              <s-banner tone="info">
                Upgrade auf Pro, um pro Code eine Start- und Endzeit zu
                hinterlegen.
              </s-banner>
            ) : null}
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-text-field
                ref={(element) => {
                  codeFieldRef.current = element;
                }}
                label="Code"
                autocomplete="off"
                value={codeInput}
                error={codeError || undefined}
                onChange={(event: Event) => {
                  setCodeInput(readValue(event));
                  if (codeError) setCodeError("");
                }}
              />
              <s-button onClick={addCode}>Hinzufügen</s-button>
              <s-button
                variant="tertiary"
                onClick={() => fileInputRef.current?.click()}
              >
                CSV importieren
              </s-button>
            </s-stack>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={importCodesFromCsv}
              style={{ display: "none" }}
            />

            {codes.length === 0 ? (
              <s-text color="subdued">Noch keine Codes hinzugefügt.</s-text>
            ) : (
              <s-stack direction="block" gap="base">
                {codes.map((codeEntry, index) => {
                  const info = usage[codeEntry.code];
                  return (
                    <s-box
                      key={codeEntry.code}
                      padding="base"
                      borderWidth="base"
                      borderRadius="base"
                    >
                      <s-stack direction="block" gap="base">
                        <s-stack
                          direction="inline"
                          gap="base"
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <s-stack
                            direction="inline"
                            gap="base"
                            alignItems="center"
                          >
                            <s-text type="strong">{codeEntry.code}</s-text>
                            <s-badge
                              tone={codeEntry.active ? "success" : "neutral"}
                            >
                              {codeEntry.active ? "Aktiv" : "Deaktiviert"}
                            </s-badge>
                          </s-stack>
                          <s-stack
                            direction="inline"
                            gap="base"
                            alignItems="center"
                          >
                            <s-button
                              variant="tertiary"
                              onClick={() => toggleCodeActive(index)}
                            >
                              {codeEntry.active ? "Deaktivieren" : "Aktivieren"}
                            </s-button>
                            <s-button
                              variant="tertiary"
                              tone="critical"
                              onClick={() => removeCode(codeEntry.code)}
                            >
                              Entfernen
                            </s-button>
                          </s-stack>
                        </s-stack>

                        <s-text color="subdued">
                          {info
                            ? `${info.usageCount}× verwendet`
                            : "Noch nicht synchronisiert"}
                        </s-text>

                        {plan.features.codeScheduling ? (
                          <s-stack direction="inline" gap="base">
                            <label
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                fontSize: "0.85em",
                              }}
                            >
                              Start (optional)
                              <input
                                type="datetime-local"
                                value={isoToLocalInput(codeEntry.startsAt)}
                                onChange={(event) =>
                                  updateCodeAt(index, {
                                    startsAt: localInputToIso(
                                      event.currentTarget.value,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                fontSize: "0.85em",
                              }}
                            >
                              Ende (optional)
                              <input
                                type="datetime-local"
                                value={isoToLocalInput(codeEntry.endsAt)}
                                onChange={(event) =>
                                  updateCodeAt(index, {
                                    endsAt: localInputToIso(
                                      event.currentTarget.value,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </s-stack>
                        ) : null}
                      </s-stack>
                    </s-box>
                  );
                })}
              </s-stack>
            )}
          </s-stack>
        </s-section>
      ) : null}

      {selectionMode === "condition" ? (
        <s-section heading="Bedingung">
          <s-stack direction="block" gap="base">
            <s-select
              label="Bedingung"
              name="condition"
              value={condition}
              onChange={(event: Event) => setCondition(readValue(event))}
            >
              <s-option value="not_on_sale">
                Nur nicht reduzierte Artikel
              </s-option>
            </s-select>
            <s-text color="subdued">
              Der Rabatt gilt automatisch für alle Varianten ohne Vergleichspreis
              bzw. deren Vergleichspreis dem Preis entspricht (also nicht bereits
              reduzierte Artikel). Neue oder geänderte Produkte werden automatisch
              berücksichtigt – du musst keine Varianten manuell pflegen.
            </s-text>
          </s-stack>
        </s-section>
      ) : (
        <s-section heading="Varianten">
          <s-stack direction="block" gap="base">
            <s-text color="subdued">
              Wähle die konkreten Varianten, die diesen Rabatt erhalten sollen.
              Andere Varianten desselben Produkts bleiben unberührt.
            </s-text>
            <s-stack direction="inline" gap="base">
              <s-button onClick={pickVariants}>Varianten auswählen</s-button>
            </s-stack>

            {variants.length === 0 ? (
              <s-text color="subdued">Noch keine Varianten ausgewählt.</s-text>
            ) : (
              <s-stack direction="block" gap="base">
                {variants.map((variant) => (
                  <s-box
                    key={variant.id}
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
                      <s-stack direction="inline" gap="base" alignItems="center">
                        {variant.image ? (
                          <s-thumbnail
                            src={variant.image}
                            alt={variant.title}
                            size="small"
                          />
                        ) : null}
                        <s-text>{variant.title || variant.id}</s-text>
                      </s-stack>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        onClick={() => removeVariant(variant.id)}
                      >
                        Entfernen
                      </s-button>
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            )}
          </s-stack>
        </s-section>
      )}

      <s-section>
        <s-button variant="tertiary" href="/app">
          Abbrechen
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
