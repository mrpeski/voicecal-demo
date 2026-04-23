import { useState, useRef, useCallback } from 'react';

// Wraps window.SpeechRecognition (and webkit prefix).
// Calls onInterim on every partial result and onFinal once when recognition ends.
// Calls onUnsupported when the browser lacks the API so the caller can fall back to text input.
export default function useSpeechRecognition({ onInterim, onFinal, onUnsupported } = {}) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onUnsupported?.();
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;

    rec.onstart = () => {
      setListening(true);
      onInterim?.('');
    };
    rec.onresult = (e) => {
      const t = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      onInterim?.(t);
      rec._last = t;
    };
    rec.onend = () => {
      setListening(false);
      if (rec._last) onFinal?.(rec._last);
    };
    rec.onerror = () => {
      setListening(false);
      onFinal?.(null);
    };

    rec.start();
    recognitionRef.current = rec;
  }, [onInterim, onFinal, onUnsupported]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, start, stop };
}
