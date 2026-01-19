export default function AuthCard({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <div className="mb-6">
          <div className="text-xs tracking-widest text-gray-500 uppercase">Remittance System</div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{title}</h1>
          {subtitle && <p className="text-sm text-gray-600 mt-2">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
