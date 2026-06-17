import type { ComponentRef, ReactNode, Ref } from "react";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { usePolarisClick } from "../hooks/use-polaris-click";

type PolarisButtonProps = JSX.IntrinsicElements["s-button"];
type SButtonElement = ComponentRef<"s-button">;

interface AppNavigateButtonProps extends Omit<PolarisButtonProps, "onClick"> {
  to: string;
  children: ReactNode;
}

/** s-button that navigates via React Router (works in embedded admin + React 18). */
export function AppNavigateButton({
  to,
  children,
  ...props
}: AppNavigateButtonProps) {
  const navigate = useNavigate();
  const onNavigate = useCallback(() => navigate(to), [navigate, to]);
  const ref = usePolarisClick<SButtonElement>(onNavigate);

  return (
    <s-button ref={ref as Ref<SButtonElement>} {...props}>
      {children}
    </s-button>
  );
}
