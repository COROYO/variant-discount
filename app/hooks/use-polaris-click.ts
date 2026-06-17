import { useEffect, useRef, type RefObject } from "react";

/**
 * Attach a native click listener to a Polaris web component. React 18 does not
 * reliably wire onClick on custom elements (s-button, etc.), so we listen on the
 * DOM node directly.
 */
export function usePolarisClick<T extends HTMLElement>(
  handler: () => void,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [handler]);

  return ref;
}
