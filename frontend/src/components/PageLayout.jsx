import { useEffect, useState } from "react";
import { publishSystemNotification } from "../services/systemNotifications.js";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

function AutoDismissNotice({ children, className }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div role="status" aria-live="polite" className={joinClasses(className, "transition-opacity duration-200")}>{children}</div>;
}

const NOTICE_CLASS_BY_VARIANT = {
  error: "app-page-error",
  success: "app-page-success",
  info: "app-page-info",
  warning: "app-page-warning",
};

export function PageContainer({
  children,
  className = "",
  stack = false,
  fillViewport = false,
}) {
  return (
    <div
      className={joinClasses(
        "app-page px-4 pt-4 pb-6 sm:px-6 sm:pt-4 sm:pb-6",
        stack ? "flex flex-col gap-6" : "",
        fillViewport ? "md:h-[calc(100dvh-4rem)]" : "",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description = "",
  actions = null,
  className = "",
  titleClassName = "",
  descriptionClassName = "",
}) {
  return (
    <div
      className={joinClasses(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div>
        <h1 className={joinClasses("app-page-title", titleClassName)}>{title}</h1>
        {description ? (
          <p className={joinClasses("app-page-subtitle", descriptionClassName)}>
            {description}
          </p>
        ) : null}
      </div>

      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageError({ children, className = "" }) {
  useEffect(() => {
    if (children) publishSystemNotification(children, { variant: "error" });
  }, [children]);
  void className;
  return null;
}

export function FieldError({ children, className = "" }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={joinClasses("mt-1 text-xs font-medium text-red-600", className)}
    >
      {children}
    </p>
  );
}

export function PageNotice({ children, className = "", variant = "info" }) {
  useEffect(() => {
    if (children && (variant === "success" || variant === "error")) {
      publishSystemNotification(children, { variant });
    }
  }, [children, variant]);
  if (!children || variant === "success" || variant === "error") return null;
  const toneClass = NOTICE_CLASS_BY_VARIANT[variant] || NOTICE_CLASS_BY_VARIANT.info;
  return <div className={joinClasses(toneClass, className)}>{children}</div>;
}

export function PageLoading({ children = "Loading...", className = "", large = false }) {
  const label = typeof children === "string" ? children : "Loading...";

  return (
    <div
      className={joinClasses("app-page-loading", className)}
      role="status"
      aria-label={label}
    >
      <LoadingIcon label={label} large={large} />
    </div>
  );
}

export function LoadingIcon({ label = "Loading", className = "", large = false }) {
  return (
    <span role="status" aria-label={label} className={joinClasses("inline-flex", className)}>
      <span
        className={joinClasses("app-page-spinner", large ? "app-page-spinner-large" : "")}
        aria-hidden="true"
      />
    </span>
  );
}
