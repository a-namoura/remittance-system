import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../services/session.js";

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    if (getAuthToken()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-5xl flex flex-col md:flex-row items-center gap-10 md:gap-16">
        <div className="w-full md:w-1/2 space-y-6">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-gray-400 mb-2">
              Remittance System
            </p>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
              Send Money
              <br />
              Across Borders
            </h1>
            <p className="mt-4 text-sm md:text-base text-gray-600 max-w-md">
              Send money fast to friends and family abroad, with transparent
              rates and full transaction tracking.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <span className="h-1.5 w-6 rounded-full bg-purple-600" />
            <span className="h-1.5 w-1.5 rounded-full bg-purple-200" />
            <span className="h-1.5 w-1.5 rounded-full bg-purple-200" />
          </div>

          <div className="pt-4 space-y-3">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full inline-flex items-center justify-center rounded-full px-4 py-3 text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="w-full inline-flex items-center justify-center rounded-full px-4 py-3 text-sm font-semibold border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 transition-colors"
            >
              Register
            </button>
          </div>
        </div>

        <div className="w-full md:w-1/2">
          <div className="relative">
            <div className="aspect-[4/5] md:aspect-[4/3] w-full rounded-3xl bg-gradient-to-tr from-emerald-400 via-teal-400 to-purple-500 shadow-xl flex items-center justify-center overflow-hidden">
              <div className="relative w-[70%] max-w-xs">
                <div className="absolute inset-x-0 bottom-0 h-32 bg-emerald-500 rounded-3xl rotate-[-4deg]" />
                <div className="relative flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center shadow-md" />
                  <div className="mt-6 w-24 h-24 rounded-3xl bg-blue-500/90 shadow-lg" />
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400 text-center md:text-left">
            Illustration placeholder. Replace with your preferred brand asset.
          </p>
        </div>
      </div>
    </div>
  );
}
