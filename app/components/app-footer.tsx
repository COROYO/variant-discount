import {
  LEGAL_IMPRESSUM_URL,
  LEGAL_PRIVACY_URL,
  SHRYMP_SHOPIFY_PARTNER_URL,
} from "../config/legal.shared";
import styles from "../styles/app-footer.module.css";

export function AppFooter() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.inner} aria-label="Rechtliche Hinweise">
        <a
          href={LEGAL_IMPRESSUM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          Impressum
        </a>
        <span className={styles.separator} aria-hidden="true">
          ·
        </span>
        <a
          href={LEGAL_PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          Datenschutz
        </a>
        <span className={styles.separator} aria-hidden="true">
          ·
        </span>
        <a
          href={SHRYMP_SHOPIFY_PARTNER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          Shrymp Commerce 🦐 – Shopify Development Partner
        </a>
      </nav>
    </footer>
  );
}
