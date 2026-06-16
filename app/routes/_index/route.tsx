import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Variant Discounts</h1>
        <p className={styles.text}>
          Rabattiere gezielt einzelne Produktvarianten – z.&nbsp;B. nur die
          50&nbsp;g-Variante, nicht die 100&nbsp;g-Variante desselben Produkts.
          Automatische Rabatte oder Rabattcodes, direkt in Shopify-Checkout.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop-Domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>z.&nbsp;B.: dein-shop.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Einloggen
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Varianten-genau:</strong> Wähle exakt die Varianten aus, die
            rabattiert werden sollen – oder lass die App automatisch nur nicht
            reduzierte Artikel erfassen.
          </li>
          <li>
            <strong>Automatisch oder per Code:</strong> Lege automatische
            Rabatte oder Rabattcodes mit individueller Laufzeit und Nutzungs­zähler
            an.
          </li>
          <li>
            <strong>Shopify-nativ:</strong> Rabatte werden über eine Shopify
            Function direkt im Checkout angewendet – ohne Skripte im Theme,
            kompatibel mit anderen Rabatten.
          </li>
        </ul>
      </div>
    </div>
  );
}
