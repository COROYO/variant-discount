import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Guide() {
  return (
    <s-page heading="Anleitung">
      <s-section heading="In 4 Schritten zum Varianten-Rabatt">
        <s-ordered-list>
          <s-list-item>
            <s-text type="strong">Regel anlegen:</s-text> Öffne den Bereich
            Rabatt-Regeln und klicke auf <s-text type="strong">Neue Regel</s-text>
            .
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Zielartikel festlegen:</s-text> Unter{" "}
            <s-text type="strong">Variantenauswahl</s-text> wählst du entweder
            manuell konkrete Varianten (z.&nbsp;B. nur die 50&nbsp;g-Variante,
            nicht die 100&nbsp;g-Variante desselben Produkts) oder{" "}
            <s-text type="strong">Automatisch nach Bedingung</s-text> – z.&nbsp;B.
            alle nicht reduzierten Artikel, ganz ohne manuelle Pflege.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Rabatt festlegen:</s-text> Wähle den Rabatttyp
            (automatischer Rabatt oder Rabattcode), die Rabattart (prozentual
            oder fester Betrag pro Stück) und trage den Wert ein. Bei einem
            Rabattcode kannst du einen oder mehrere Codes hinzufügen. Optional
            geht auch ein Hinweistext fürs Warenkorb-Label.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Aktivieren:</s-text> Setze den Status auf Aktiv
            und speichere. Die App legt dann automatisch den Rabatt Variant
            Discounts unter <s-text type="strong">Shopify → Rabatte</s-text> an
            und hält ihn aktuell.
          </s-list-item>
        </s-ordered-list>
      </s-section>

      <s-section heading="Gut zu wissen">
        <s-unordered-list>
          <s-list-item>
            Du kannst beliebig viele Regeln anlegen – jede mit eigenem Wert und
            eigener Variantenauswahl.
          </s-list-item>
          <s-list-item>
            Überschneiden sich Regeln für dieselbe Variante, wird automatisch der
            größere Rabatt angewendet.
          </s-list-item>
          <s-list-item>
            Wird eine Variante oder ein Produkt gelöscht, entfernt die App die
            betroffenen Varianten automatisch aus deinen Regeln.
          </s-list-item>
          <s-list-item>
            Automatische Rabatte greifen ohne Code. Rabattcode-Regeln gelten
            erst, wenn Kund:innen einen der hinterlegten Codes im Checkout
            eingeben – mehrere Codes pro Regel sind möglich.
          </s-list-item>
          <s-list-item>
            Die automatische Bedingung erfasst alle Varianten ohne Vergleichspreis
            (bzw. Vergleichspreis = Preis) und schließt neue oder geänderte
            Produkte automatisch ein – ganz ohne manuelle Variantenpflege.
          </s-list-item>
          <s-list-item>
            Nur aktive Regeln wirken im Warenkorb – Entwürfe haben keinen Effekt.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Schnelltest">
        <s-paragraph>
          Lege ein Testprodukt mit zwei Varianten an (z.&nbsp;B. 50&nbsp;g und
          100&nbsp;g), erstelle eine Regel für die 50&nbsp;g-Variante und lege
          beide Varianten in den Warenkorb. Es sollte nur die 50&nbsp;g-Variante
          rabattiert werden.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
