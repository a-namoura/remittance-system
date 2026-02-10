import { getPasswordStrength } from "../utils/passwordPolicy.js";

function getActiveBarClass(score) {
  if (score <= 1) return "bg-red-500";
  if (score <= 2) return "bg-orange-500";
  if (score <= 3) return "bg-amber-500";
  if (score <= 4) return "bg-blue-500";
  return "bg-green-500";
}

export default function PasswordStrengthIndicator({ password }) {
  const strength = getPasswordStrength(password);
  const activeBarClass = getActiveBarClass(strength.score);

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-600">Password strength</span>
        <span className="font-medium text-gray-700">{strength.label}</span>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: strength.maxScore }).map((_, index) => (
          <span
            key={index}
            className={`h-2 rounded-full ${
              index < strength.score ? activeBarClass : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        {strength.requirements.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium ${
              item.met
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                item.met ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-600"
              }`}
            >
              {item.met ? "OK" : "-"}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
