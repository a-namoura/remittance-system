export function SettingsSection({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SettingsToggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label className={`flex items-center justify-between gap-4 py-4 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <span><span className="block text-sm font-medium text-gray-900">{label}</span><span className="mt-1 block text-xs text-gray-500">{description}</span></span>
      <input disabled={disabled} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-gray-300 transition peer-checked:bg-purple-600 peer-focus-visible:ring-2 peer-focus-visible:ring-purple-500 peer-focus-visible:ring-offset-2 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
    </label>
  );
}
