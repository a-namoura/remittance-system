export const FORM_INPUT_BASE_CLASS =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500";

export const FORM_SELECT_BASE_CLASS =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500";

export const FORM_CODE_INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-center font-mono text-sm tracking-[0.3em] focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500";

export const FORM_PRIMARY_BUTTON_CLASS =
  "w-full rounded-full bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700";

export const FORM_PRIMARY_BUTTON_DISABLED_CLASS = `${FORM_PRIMARY_BUTTON_CLASS} disabled:opacity-60`;

export const FORM_SECONDARY_BUTTON_CLASS =
  "w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50";

export const FORM_MUTED_BUTTON_CLASS =
  "text-xs text-purple-600 font-medium hover:underline disabled:opacity-60";

export function formChannelButtonClass({ selected, disabled = false }) {
  if (disabled) {
    return "flex-1 cursor-not-allowed rounded-full border border-gray-200 bg-gray-100 px-3 py-2 text-xs font-medium text-gray-400";
  }

  return `flex-1 rounded-full border px-3 py-2 text-xs font-medium ${
    selected
      ? "border-purple-600 bg-purple-50 text-purple-700"
      : "border-gray-300 text-gray-600 hover:bg-gray-50"
  }`;
}
