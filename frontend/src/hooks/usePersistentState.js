import { useState, useEffect } from 'react';

// Small localStorage-backed useState. `defaults` is merged in for object values
// so newly-added keys pick up their default rather than being undefined.
export default function usePersistentState(key, initialValue, { mergeDefaults = false } = {}) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initialValue;
      const parsed = JSON.parse(raw);
      if (mergeDefaults && initialValue && typeof initialValue === 'object') {
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
