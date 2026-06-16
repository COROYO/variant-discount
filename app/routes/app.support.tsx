import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// TODO: replace with your real, monitored support inbox before submitting to the
// App Store (must match the support email in your app listing).
const SUPPORT_EMAIL = "support@shrymp-commerce.com";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { supportEmail: SUPPORT_EMAIL };
};

export default function Support() {
  return (
    <s-page heading="Support">
      <s-section heading="Wir helfen gerne weiter">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Fragen, Probleme oder Wünsche zur App? Schreib uns – wir antworten in
            der Regel innerhalb von 1–2 Werktagen.
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">E-Mail: </s-text>
            <s-link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</s-link>
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Das hilft uns, schneller zu antworten">
        <s-unordered-list>
          <s-list-item>
            Wirf zuerst einen Blick in die{" "}
            <s-link href="/app/guide">Anleitung</s-link> – die häufigsten Fragen
            sind dort beantwortet.
          </s-list-item>
          <s-list-item>
            Nenne uns deine Shop-Domain und den Namen der betroffenen Regel.
          </s-list-item>
          <s-list-item>
            Beschreibe kurz, was du erwartet hast und was stattdessen passiert
            ist.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
