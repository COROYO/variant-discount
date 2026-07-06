import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { CodeUsageInfo } from "../models/discount.server";
import type { RuleEditorConfig } from "../models/rule-editor.shared";
import {
  type RuleCode,
  type RuleDiscountType,
  type RuleQuantityTier,
  type RuleSelectionMode,
  type RuleStatus,
  type RuleValueType,
  type RuleVariant,
  type TagMatchedProduct,
} from "../models/rules.server";
import type { PlanDefinition } from "../config/plans.shared";
import { AppActionButton } from "./app-action-button";
import { AppNavigateButton } from "./app-navigate-button";
import { TagProductList } from "./tag-product-list";
import { TagPillList } from "./tag-pill-list";
import { VariantPickerModal } from "./variant-picker-modal";
import { QuantityTierEditor } from "./quantity-tier-editor";
import layoutStyles from "../styles/rule-editor-layout.module.css";
import tagStyles from "../styles/tag-pills.module.css";
import variantListStyles from "../styles/tag-product-list.module.css";

export type RuleEditorLoaderData = {
  rule: {
    id: string;
    title: string;
    status: RuleStatus;
    discountType: RuleDiscountType;
    discountMode: "standard" | "quantity";
    selectionMode: RuleSelectionMode;
    condition: string;
    tags: string[];
    valueType: RuleValueType;
    value: number;
    quantityTiers: RuleQuantityTier[];
    message: string;
    variants: RuleVariant[];
    excludedVariants: RuleVariant[];
    codes: RuleCode[];
  };
  usage: Record<string, CodeUsageInfo>;
  tagPreview: { products: TagMatchedProduct[]; truncated: boolean };
  plan: PlanDefinition;
  editor: RuleEditorConfig;
};

export type RuleEditorActionData =
  | { ok: false; error: string; warning: null }
  | { ok: true; warning: string | null; error: null };

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

export function RuleEditorPage() {
  const { rule, usage, tagPreview: initialTagPreview, plan, editor } =
    useLoaderData<RuleEditorLoaderData>();
  const actionData = useActionData<RuleEditorActionData>();
  const isQuantity = editor.discountMode === "quantity";
  const tagPreviewFetcher = useFetcher<{
    products: TagMatchedProduct[];
    truncated: boolean;
  }>();
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
  const [tags, setTags] = useState<string[]>(rule.tags);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState("");
  const [valueType, setValueType] = useState<RuleValueType>(rule.valueType);
  const [value, setValue] = useState(String(rule.value));
  const [quantityTiers, setQuantityTiers] = useState<RuleQuantityTier[]>(
    rule.quantityTiers.length > 0
      ? rule.quantityTiers
      : [{ minQuantity: 3, valueType: "percentage", value: 10 }],
  );
  const [message, setMessage] = useState(rule.message);
  const [variants, setVariants] = useState<RuleVariant[]>(rule.variants);
  const [excludedVariants, setExcludedVariants] = useState<RuleVariant[]>(
    rule.excludedVariants,
  );
  const [codes, setCodes] = useState<RuleCode[]>(rule.codes);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const codeFieldRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addCodeRef = useRef<() => void>(() => {});
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const tagPreviewKeyRef = useRef(JSON.stringify({ tags: rule.tags }));
  const tagPreviewCacheRef = useRef(initialTagPreview);

  const isSaving = navigation.state === "submitting";
  const tagPreviewFromSources = tagPreviewFetcher.data ?? initialTagPreview;
  const isTagPreviewFetcherLoading = tagPreviewFetcher.state !== "idle";
  if (tagPreviewFromSources.products.length > 0) {
    tagPreviewCacheRef.current = tagPreviewFromSources;
  }
  const tagPreview =
    tagPreviewFromSources.products.length > 0
      ? tagPreviewFromSources
      : isTagPreviewFetcherLoading
        ? tagPreviewCacheRef.current
        : tagPreviewFromSources;
  const isTagPreviewLoading =
    isTagPreviewFetcherLoading &&
    selectionMode === "tags" &&
    tagPreview.products.length === 0;

  useEffect(() => {
    if (selectionMode !== "tags" || tags.length === 0) return;
    const key = JSON.stringify({ tags });
    if (tagPreviewKeyRef.current === key) return;
    tagPreviewKeyRef.current = key;

    const timeout = window.setTimeout(() => {
      tagPreviewFetcher.submit(
        { tags },
        {
          method: "post",
          action: "/app/rules/preview-tags",
          encType: "application/json",
        },
      );
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [tags, selectionMode]);

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
    navigate(editor.listPath);
  }, [actionData, editor.listPath, navigate, shopify]);

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

  const pickVariants = () => setVariantPickerOpen(true);

  const removeVariant = (id: string) =>
    setVariants((prev) => prev.filter((variant) => variant.id !== id));

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (tags.some((entry) => entry.toLowerCase() === tag.toLowerCase())) {
      setTagError("Dieser Tag wurde bereits hinzugefügt.");
      return;
    }
    setTags((prev) => [...prev, tag]);
    setTagInput("");
    setTagError("");
  };

  const removeTag = (tag: string) =>
    setTags((prev) => prev.filter((entry) => entry !== tag));

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
        discountMode: editor.discountMode,
        selectionMode,
        condition,
        tags,
        valueType,
        value: Number(value) || 0,
        quantityTiers,
        message,
        variants,
        excludedVariants,
        codes,
      },
      { method: "post", encType: "application/json" },
    );
  };

  const pageHeading = isQuantity
    ? rule.id === "new"
      ? "Neuer Mengenrabatt"
      : "Mengenrabatt bearbeiten"
    : rule.id === "new"
      ? "Neue Regel"
      : "Regel bearbeiten";

  return (
    <s-page heading={pageHeading}>
      <AppActionButton
        slot="primary-action"
        onAction={save}
        {...(isSaving ? { loading: true } : {})}
      >
        Speichern
      </AppActionButton>

      <s-section>
      <div className={layoutStyles.layout}>
        <aside className={layoutStyles.aside}>
          <div className={layoutStyles.asideCard}>
            <h2 className={layoutStyles.asideHeading}>Einstellungen</h2>
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
                onChange={(event: Event) =>
                  setStatus(readValue(event) as RuleStatus)
                }
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
                <s-option value="tags">Produkte nach Tags</s-option>
                <s-option value="condition">Automatisch nach Bedingung</s-option>
              </s-select>

              {!isQuantity ? (
                <>
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
                    label={
                      valueType === "percentage" ? "Rabatt in %" : "Rabatt pro Stück"
                    }
                    name="value"
                    value={value}
                    min={0}
                    {...(valueType === "percentage" ? { max: 100 } : {})}
                    onChange={(event: Event) => setValue(readValue(event))}
                  />
                </>
              ) : null}

              <s-text-field
                label="Hinweistext im Warenkorb (optional)"
                name="message"
                autocomplete="off"
                value={message}
                onChange={(event: Event) => setMessage(readValue(event))}
              />
              <s-text color="subdued">
                Der tatsächliche Rabatt (z.&nbsp;B. „15&nbsp;%“ oder „2,50 pro
                Stück“) wird automatisch hinter deinen Text gesetzt.
              </s-text>
            </s-stack>
          </div>
        </aside>

        <div className={layoutStyles.main}>
      {isQuantity ? (
        <s-section heading="Mengenstufen">
          <QuantityTierEditor tiers={quantityTiers} onChange={setQuantityTiers} />
        </s-section>
      ) : null}

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
              <AppActionButton onAction={addCode}>Hinzufügen</AppActionButton>
              <AppActionButton
                variant="tertiary"
                onAction={() => fileInputRef.current?.click()}
              >
                CSV importieren
              </AppActionButton>
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
                            <AppActionButton
                              variant="tertiary"
                              onAction={() => toggleCodeActive(index)}
                            >
                              {codeEntry.active ? "Deaktivieren" : "Aktivieren"}
                            </AppActionButton>
                            <AppActionButton
                              variant="tertiary"
                              tone="critical"
                              onAction={() => removeCode(codeEntry.code)}
                            >
                              Entfernen
                            </AppActionButton>
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
      ) : selectionMode === "tags" ? (
        <s-section heading="Produkt-Tags">
          <s-stack direction="block" gap="base">
            <s-text color="subdued">
              Der Rabatt gilt für alle Varianten von Produkten mit mindestens einem
              der Tags. Klappe ein Produkt auf, um einzelne Varianten
              auszuschließen.
            </s-text>
            <form
              className={tagStyles.addForm}
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                addTag();
              }}
            >
              <div className={tagStyles.addField}>
                <label className={tagStyles.addLabel} htmlFor="rule-product-tag">
                  Tag
                </label>
                <input
                  id="rule-product-tag"
                  className={`${tagStyles.addInput}${tagError ? ` ${tagStyles.addInputError}` : ""}`}
                  type="text"
                  name="rule-product-tag"
                  value={tagInput}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  onChange={(event) => {
                    setTagInput(event.currentTarget.value);
                    if (tagError) setTagError("");
                  }}
                />
                {tagError ? (
                  <span className={tagStyles.addError}>{tagError}</span>
                ) : null}
              </div>
              <AppActionButton onAction={addTag}>Hinzufügen</AppActionButton>
            </form>

            {tags.length === 0 ? (
              <s-text color="subdued">Noch keine Tags hinzugefügt.</s-text>
            ) : (
              <TagPillList tags={tags} onRemove={removeTag} />
            )}

            {tags.length > 0 ? (
              <s-stack direction="block" gap="small">
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-text type="strong">Gefundene Produkte</s-text>
                  {!isTagPreviewLoading && tagPreview.products.length > 0 ? (
                    <s-text color="subdued">
                      {tagPreview.products.length}
                      {tagPreview.truncated ? "+" : ""}
                    </s-text>
                  ) : null}
                </s-stack>
                {isTagPreviewLoading ? (
                  <s-text color="subdued">Produkte werden geladen…</s-text>
                ) : null}
                {!isTagPreviewLoading && tagPreview.products.length === 0 ? (
                  <s-text color="subdued">
                    Keine Produkte mit diesen Tags gefunden.
                  </s-text>
                ) : tagPreview.products.length > 0 ? (
                  <>
                    {tagPreview.truncated ? (
                      <s-text color="subdued">
                        Es werden maximal 100 Produkte angezeigt.
                      </s-text>
                    ) : null}
                    <TagProductList
                      products={tagPreview.products}
                      excludedVariants={excludedVariants}
                      onExcludedVariantsChange={setExcludedVariants}
                    />
                  </>
                ) : null}
              </s-stack>
            ) : null}
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
              <AppActionButton onAction={pickVariants}>
                Varianten auswählen
              </AppActionButton>
            </s-stack>

            {variants.length === 0 ? (
              <s-text color="subdued">Noch keine Varianten ausgewählt.</s-text>
            ) : (
              <div className={variantListStyles.list}>
                {variants.map((variant) => {
                  const separator = variant.title.indexOf(" · ");
                  const productTitle =
                    separator >= 0
                      ? variant.title.slice(0, separator)
                      : variant.title;
                  const variantTitle =
                    separator >= 0 ? variant.title.slice(separator + 3) : "";

                  return (
                    <div key={variant.id} className={variantListStyles.productRow}>
                      <div className={variantListStyles.selectedRow}>
                        {variant.image ? (
                          <img
                            src={variant.image}
                            alt=""
                            className={variantListStyles.thumb}
                          />
                        ) : (
                          <span
                            className={variantListStyles.thumbPlaceholder}
                            aria-hidden="true"
                          />
                        )}
                        <span className={variantListStyles.productTitle}>
                          {productTitle}
                          {variantTitle ? (
                            <>
                              {" "}
                              <span className={variantListStyles.meta}>
                                · {variantTitle}
                              </span>
                            </>
                          ) : null}
                        </span>
                        <AppActionButton
                          variant="tertiary"
                          tone="critical"
                          onAction={() => removeVariant(variant.id)}
                        >
                          Entfernen
                        </AppActionButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </s-stack>
        </s-section>
      )}

      <VariantPickerModal
        open={variantPickerOpen}
        selectedVariants={variants}
        onClose={() => setVariantPickerOpen(false)}
        onConfirm={setVariants}
      />

      <s-section>
        <AppNavigateButton variant="tertiary" to={editor.listPath}>
          Abbrechen
        </AppNavigateButton>
      </s-section>
        </div>
      </div>
      </s-section>
    </s-page>
  );
}
