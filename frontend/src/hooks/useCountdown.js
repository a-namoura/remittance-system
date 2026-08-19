import { useEffect, useState } from "react";

export default function useCountdown(initialValue = 0) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (value <= 0) return;

    const timer = window.setTimeout(
      () => setValue((current) => Math.max(0, current - 1)),
      1000
    );

    return () => window.clearTimeout(timer);
  }, [value]);

  return [value, setValue];
}
