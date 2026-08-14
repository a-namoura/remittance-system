import { useEffect } from "react";
import { publishSystemNotification } from "../services/systemNotifications.js";

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
    if (!message) return;
    publishSystemNotification(message, { variant, durationMs: 4000 });
    if (playSound && !isError) playSuccessSound();
  }, [message, playSound, isError, variant]);

  return null;
}
