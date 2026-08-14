import { useNavigate } from "react-router-dom";

export default function BackButton({ fallback = "/dashboard", to = "", label = "Back" }) {
  const navigate = useNavigate();

  function goBack() {
    if (to) {
      navigate(to);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
      aria-label="Go back"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18 9 12l6-6" />
      </svg>
      {label}
    </button>
  );
}
