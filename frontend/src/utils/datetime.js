const DATE_TIME_OPTIONS = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

const DATE_ONLY_OPTIONS = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "2-digit",
};

export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, DATE_TIME_OPTIONS);
}

export function formatDateOnly(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, DATE_ONLY_OPTIONS);
}
