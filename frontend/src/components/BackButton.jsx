import { useNavigate } from "react-router-dom";

export default function BackButton({ fallback = "/dashboard" }) {
  const navigate = useNavigate();

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="
        inline-flex items-center gap-2
        text-sm font-medium text-gray-600
        hover:text-gray-900
        transition
      "
    >
      <span className="text-lg">←</span>
      Back
    </button>
  );
}
