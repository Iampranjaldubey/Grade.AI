import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./button-variants";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Full-width block button. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      block = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={buttonClasses({ variant, size, block, className })}
        {...props}
      >
        {isLoading && <Spinner className={cn(size === "sm" && "h-3.5 w-3.5")} />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
