export const PASSWORD_MIN_LENGTH = 10;

const PASSWORD_RULES = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "lowercase",
    label: "At least one lowercase letter",
    test: (value) => /[a-z]/.test(value),
  },
  {
    id: "uppercase",
    label: "At least one uppercase letter",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    id: "number",
    label: "At least one number",
    test: (value) => /\d/.test(value),
  },
  {
    id: "special",
    label: "At least one special character",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

function normalizePassword(password) {
  return String(password || "");
}

export function getPasswordRequirements(password) {
  const normalizedPassword = normalizePassword(password);
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.test(normalizedPassword),
  }));
}

export function getPasswordPolicyError(password) {
  const requirements = getPasswordRequirements(password);
  const missing = requirements.filter((item) => !item.met).map((item) => item.label);

  if (missing.length === 0) {
    return "";
  }

  return `Password must include: ${missing.join(", ")}.`;
}

export function isPasswordPolicySatisfied(password) {
  return getPasswordRequirements(password).every((item) => item.met);
}

export function getPasswordStrength(password) {
  const requirements = getPasswordRequirements(password);
  const score = requirements.filter((item) => item.met).length;
  const maxScore = requirements.length;

  let label = "Very weak";
  if (score >= 5) label = "Very strong";
  else if (score >= 4) label = "Strong";
  else if (score >= 3) label = "Good";
  else if (score >= 2) label = "Fair";
  else if (score >= 1) label = "Weak";

  return {
    score,
    maxScore,
    label,
    requirements,
  };
}
