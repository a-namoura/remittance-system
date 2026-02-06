export default function AuthCard({ title, subtitle, children, onBack }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-md p-6 sm:p-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="h-8 w-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 text-lg leading-none"
              >
                ←
              </button>
            )}
            <div className="text-[11px] tracking-[0.2em] text-gray-400 uppercase">
              Remittance System
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
