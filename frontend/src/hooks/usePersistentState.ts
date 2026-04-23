import { useEffect, useState } from "react";

interface Options {
  mergeDefaults?: boolean;
}

export default function usePersistentState<T>(
  key: string,
  initialValue: T,
  { mergeDefaults = false }: Options = {},
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initialValue;
      const parsed = JSON.parse(raw) as T;
      if (
        mergeDefaults &&
        initialValue &&
        typeof initialValue === "object" &&
        !Array.isArray(initialValue)
      ) {
        return { ...initialValue, ...parsed };
      }
      return parsed ?? initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage may be full or disabled */
    }
  }, [key, value]);

  return [value, setValue];
}
