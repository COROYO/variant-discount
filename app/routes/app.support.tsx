import { useCallback } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { SupportAvatar } from "../components/support-avatar";
import { getSupportEmail, SUPPORT_FAQ_ITEMS } from "../config/support.shared";
import styles from "../styles/settings-layout.module.css";
import supportStyles from "../styles/support.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return {
    supportEmail: getSupportEmail(),
  };
};

export default function SupportPage() {
  const { supportEmail } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  const copySupportEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(supportEmail);
      shopify.toast.show("Adresse kopiert");
    } catch {
      shopify.toast.show("Kopieren fehlgeschlagen", { isError: true });
    }
  }, [shopify, supportEmail]);

  return (
    <s-page heading="Support">
      <s-section>
        <s-paragraph>
          Hilfe zur Einrichtung, Antworten auf häufige Fragen und so erreichst
          du uns.
        </s-paragraph>
      </s-section>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <div className={supportStyles.sidebarAvatar}>
              <SupportAvatar size="compact" />
              <p className={supportStyles.sidebarActiveLabel}>
                Support ist verfügbar
              </p>
            </div>
            <p className={styles.sidebarTitle}>Auf dieser Seite</p>
            <ul className={styles.navList}>
              <li>
                <a href="#support-contact" className={styles.navButton}>
                  Kontakt
                </a>
              </li>
              <li>
                <a href="#support-faq" className={styles.navButton}>
                  Häufige Fragen
                </a>
              </li>
            </ul>
          </div>
        </aside>

        <div className={styles.content}>
          <div className={styles.contentCard} id="support-contact">
            <div className={supportStyles.contactHeader}>
              <SupportAvatar />
              <div className={supportStyles.contactIntro}>
                <h2 className={styles.contentHeading}>Support kontaktieren</h2>
                <p className={styles.contentDescription}>
                  Bei technischen Fragen, Setup-Problemen oder Feature-Wünschen
                  – wir antworten in der Regel innerhalb von 1–2 Werktagen.
                </p>
              </div>
            </div>
            <s-stack direction="block" gap="base">
              <s-text>
                <strong>{supportEmail}</strong>
              </s-text>
              <s-button variant="primary" onClick={copySupportEmail}>
                E-Mail kopieren
              </s-button>
              <s-text color="subdued">
                Kopiere die Adresse und schreibe uns aus deinem Mail-Programm.
                Bitte gib deine Shop-Domain an und beschreibe das Problem
                möglichst genau.
              </s-text>
            </s-stack>
          </div>

          <div className={styles.contentCard} id="support-faq">
            <h2 className={styles.contentHeading}>Häufige Fragen</h2>
            <p className={styles.contentDescription}>
              Schnelle Antworten auf typische Merchant-Fragen:
            </p>
            <s-stack direction="block" gap="base">
              {SUPPORT_FAQ_ITEMS.map((item, index) => (
                <s-box
                  key={index}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small-100">
                    <s-text type="strong">{item.q}</s-text>
                    <s-text color="subdued">{item.a}</s-text>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
