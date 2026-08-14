import {
  FORM_COMPACT_PRIMARY_BUTTON_DISABLED_CLASS,
  FORM_PRIMARY_BUTTON_DISABLED_CLASS,
} from "../styles/formClasses.js";

export default function FormSubmitButton({
  busy = false,
  disabled = false,
  prerequisites = [],
  variant = "full",
  className = "",
  children,
  ...props
}) {
  const prerequisitesMet = prerequisites.every(Boolean);
  const variantClass =
    variant === "compact"
      ? FORM_COMPACT_PRIMARY_BUTTON_DISABLED_CLASS
      : FORM_PRIMARY_BUTTON_DISABLED_CLASS;

  return (
    <button
      type="submit"
      {...props}
      disabled={busy || disabled || !prerequisitesMet}
      className={`${variantClass} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
