const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

export function getEmailIdentifierError(value) {
  const normalized = String(value || "").trim();
  if (normalized.includes("@") && !isValidEmail(normalized)) {
    return "Please enter a valid email address.";
  }
  return "";
}
