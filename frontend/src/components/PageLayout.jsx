function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

const NOTICE_CLASS_BY_VARIANT = {
  error: "app-page-error",
  success: "app-page-success",
  info: "app-page-info",
  warning: "app-page-warning",
};

export function PageContainer({ children, className = "", stack = false }) {
  return (
    <div
      className={joinClasses(
        "app-page px-4 pt-6 pb-10 sm:px-6 sm:pt-10 sm:pb-10",
        stack ? "flex flex-col gap-6" : "",
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
  if (!children) return null;
  return <div className={joinClasses("app-page-error", className)}>{children}</div>;
}

export function PageNotice({ children, className = "", variant = "info" }) {
  if (!children) return null;
  const toneClass = NOTICE_CLASS_BY_VARIANT[variant] || NOTICE_CLASS_BY_VARIANT.info;
  return <div className={joinClasses(toneClass, className)}>{children}</div>;
}

export function PageLoading({ children = "Loading...", className = "" }) {
  return (
    <div className={joinClasses("app-page-loading", className)}>
      <span className="app-page-spinner" />
      <span>{children}</span>
    </div>
  );
}
