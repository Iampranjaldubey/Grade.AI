import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const controlBase =
  "block w-full rounded-md border bg-surface px-3.5 text-[15px] text-content placeholder:text-content-muted " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface " +
  "motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60";

function stateBorder(invalid?: boolean) {
  return invalid ? "border-danger" : "border-edge-strong";
}

export const Label = forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("mb-1.5 block text-[13px] font-medium text-content-soft", className)}
    {...props}
  >
    {children}
    {required && (
      <span className="ml-0.5 text-danger" aria-hidden="true">
        *
      </span>
    )}
  </label>
));
Label.displayName = "Label";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, "h-10 py-2", stateBorder(invalid), className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, "min-h-[88px] py-2.5", stateBorder(invalid), className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          controlBase,
          "h-10 appearance-none py-2 pr-10",
          stateBorder(invalid),
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";

export interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Layout + accessibility wrapper for a labelled control. Renders the label,
 * optional hint, and an error message with role="alert". Controls should wire
 * `aria-describedby={`${htmlFor}-error`}` (or `-hint`) and `invalid`.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-[13px] text-content-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="mt-1.5 text-[13px] text-danger-fg"
        >
          {error}
        </p>
      )}
    </div>
  );
}
