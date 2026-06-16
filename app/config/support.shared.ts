/** Support contact – override via SUPPORT_EMAIL in production. */
export const DEFAULT_SUPPORT_EMAIL = "support@shrimpsoft.de";

export function getSupportEmail(): string {
  return process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}

export type SupportFaqItem = { q: string; a: string };

/** FAQ items rendered on /app/support. Kept inline (no i18n in this app). */
export const SUPPORT_FAQ_ITEMS: SupportFaqItem[] = [
  {
    q: "Mein Rabatt wird im Checkout nicht angewendet – was tun?",
    a: "Prüfe, ob die Regel auf Aktiv gesetzt ist und mindestens eine Variante (oder eine Bedingung) hinterlegt hat. Unter Shopify → Rabatte muss der Eintrag „Variant Discounts“ existieren und aktiv sein. Code-Regeln greifen erst, wenn der Code im Checkout eingegeben wird.",
  },
  {
    q: "Warum gilt mein Rabatt nicht für eine bestimmte Variante?",
    a: "Öffne die Regel und prüfe die Variantenauswahl. Wurde das Produkt umbenannt oder eine Variante gelöscht, entfernt die App diese automatisch aus der Regel – füge sie ggf. erneut hinzu.",
  },
  {
    q: "Wie kombinieren sich mehrere Rabatte?",
    a: "Überschneiden sich mehrere App-Regeln für dieselbe Variante, wird automatisch der größere Rabatt angewendet. Mit Bestell-, Produkt- und Versandrabatten lässt sich der Rabatt kombinieren (Combines-with ist standardmäßig aktiv).",
  },
  {
    q: "Was ist der Unterschied zwischen automatisch und Code?",
    a: "Automatische Rabatte greifen ohne Eingabe direkt im Warenkorb. Code-Regeln werden nur angewendet, wenn ein Kunde einen der hinterlegten Codes im Checkout eingibt. Jeder Code lässt sich einzeln planen, aktivieren und auswerten.",
  },
  {
    q: "Speichert die App Kundendaten?",
    a: "Nein. Die App speichert ausschließlich Shop-Domain, Regel-Definitionen und Discount-Verknüpfungen in Firestore. Es werden keine personen­bezogenen Kundendaten erhoben oder verarbeitet.",
  },
];
