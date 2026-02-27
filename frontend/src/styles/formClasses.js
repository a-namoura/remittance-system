export const FORM_INPUT_BASE_CLASS =
  "app-control-surface w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500";

export const FORM_SELECT_BASE_CLASS =
  "app-control-surface w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500";

export const FORM_CODE_INPUT_CLASS =
  "app-control-surface w-full rounded-xl px-3 py-2 text-center font-mono text-sm tracking-[0.3em] focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500";

export const FORM_PRIMARY_BUTTON_CLASS =
  "w-full rounded-full bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-400";

export const FORM_PRIMARY_BUTTON_DISABLED_CLASS = `${FORM_PRIMARY_BUTTON_CLASS} disabled:opacity-60`;

export const FORM_SECONDARY_BUTTON_CLASS =
  "app-secondary-button w-full rounded-full px-4 py-2.5 text-sm font-semibold";

export const FORM_MUTED_BUTTON_CLASS =
  "app-muted-action text-xs font-medium hover:underline disabled:opacity-60";

export function formChannelButtonClass({ selected, disabled = false }) {
  if (disabled) {
    return "flex-1 cursor-not-allowed rounded-full border border-gray-200 bg-gray-100 px-3 py-2 text-xs font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500";
  }

  return `flex-1 rounded-full border px-3 py-2 text-xs font-medium ${
    selected
      ? "border-purple-600 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-900/40 dark:text-purple-200"
      : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
  }`;
}
