import { useEffect } from "react";
import { useNavigate } from "react-router";

/** Resolve href from shopify:navigate even when the click target is inside shadow DOM. */
function hrefFromNavigateEvent(event: Event): string | null {
  for (const node of event.composedPath?.() ?? []) {
    if (node instanceof HTMLElement) {
      const href = node.getAttribute("href");
      if (href) return href;
    }
  }
  return null;
}

/**
 * Bridge Polaris link/button navigation to React Router. AppProvider already
 * listens for shopify:navigate but reads event.target, which misses href on
 * shadow-DOM components — this handler runs in capture phase and uses
 * composedPath instead.
 */
export function useShopifyNavigate() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const href = hrefFromNavigateEvent(event);
      if (href?.startsWith("/")) {
        event.stopImmediatePropagation();
        navigate(href);
      }
    };

    document.addEventListener("shopify:navigate", handleNavigate, true);
    return () =>
      document.removeEventListener("shopify:navigate", handleNavigate, true);
  }, [navigate]);
}
