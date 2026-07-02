import { useEffect } from "react";

function playSuccessSound() {
  try {
    const AudioContextConstructor =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const startedAt = context.currentTime;
    const gain = context.createGain();

    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.08, startedAt + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.48);
    gain.connect(context.destination);

    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const noteStart = startedAt + index * 0.12;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      oscillator.connect(gain);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.26);
    });

    globalThis.setTimeout(() => {
      context.close?.().catch(() => {});
    }, 650);
  } catch {
    // Browsers may block audio until a user gesture; the visual transition still works.
  }
}

export default function SuccessTransition({
  message,
  playSound = true,
  variant = "success",
}) {
  const isError = variant === "error";

  useEffect(() => {
    if (!message || !playSound || isError) return;
    playSuccessSound();
  }, [message, playSound, isError]);

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-white/55 px-4 backdrop-blur-sm dark:bg-gray-950/70">
      <div
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
        className="app-success-transition w-full max-w-md rounded-3xl border border-gray-200 bg-gray-100/95 px-8 py-8 text-center shadow-xl shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-900/95 dark:shadow-black/40"
      >
        <div className="app-success-illustration relative mx-auto h-20 w-20">
          <span
            className={`app-success-pulse absolute inset-1 rounded-full ${
              isError ? "bg-red-200/70 dark:bg-red-500/25" : "bg-green-200/70 dark:bg-green-500/25"
            }`}
          />
          {!isError ? (
            <>
              <span className="app-success-dot app-success-dot-one" />
              <span className="app-success-dot app-success-dot-two" />
              <span className="app-success-dot app-success-dot-three" />
            </>
          ) : null}
          <svg
            viewBox="0 0 96 96"
            className={`relative h-20 w-20 ${
              isError ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"
            }`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle
              className="app-success-ring"
              cx="48"
              cy="48"
              r="30"
              strokeWidth="8"
            />
            {isError ? (
              <>
                <path className="app-success-check" d="M36 36 60 60" strokeWidth="8" />
                <path className="app-success-check" d="M60 36 36 60" strokeWidth="8" />
              </>
            ) : (
              <path
                className="app-success-check"
                d="M33 49.5 43.5 60 64 37.5"
                strokeWidth="8"
              />
            )}
          </svg>
        </div>
        <p
          className={`mt-3 text-base font-semibold ${
            isError ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"
          }`}
        >
          {message}
        </p>
      </div>
    </div>
  );
}
