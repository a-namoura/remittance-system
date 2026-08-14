export function CopyIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" strokeWidth="1.9" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" strokeWidth="1.9" />
    </svg>
  );
}

export function ShareIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" strokeWidth="1.9" />
      <circle cx="6" cy="12" r="2.5" strokeWidth="1.9" />
      <circle cx="18" cy="19" r="2.5" strokeWidth="1.9" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" strokeWidth="1.9" />
    </svg>
  );
}
