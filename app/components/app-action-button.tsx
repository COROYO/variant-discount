import type { ComponentRef, ReactNode, Ref } from "react";
import { useCallback } from "react";
import { usePolarisClick } from "../hooks/use-polaris-click";

type PolarisButtonProps = JSX.IntrinsicElements["s-button"];
type SButtonElement = ComponentRef<"s-button">;

interface AppActionButtonProps extends Omit<PolarisButtonProps, "onClick"> {
  onAction: () => void;
  children: ReactNode;
}

/** s-button with a reliable click handler for React 18 + Polaris web components. */
export function AppActionButton({
  onAction,
  children,
  ...props
}: AppActionButtonProps) {
  const handler = useCallback(() => onAction(), [onAction]);
  const ref = usePolarisClick<SButtonElement>(handler);

  return (
    <s-button ref={ref as Ref<SButtonElement>} {...props}>
      {children}
    </s-button>
  );
}
