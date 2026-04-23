import { useCallback, useRef, useState } from "react";

interface Options {
  mimeType?: string;
  onError?: (err: unknown) => void;
}

export interface UseMediaRecorder {
  recording: boolean;
  start: () => Promise<void>;
  /** Stops recording and resolves with the captured Blob (or null if nothing was captured). */
  stop: () => Promise<Blob | null>;
}

/**
 * Thin wrapper around MediaRecorder. Handles mic permission, chunk collection,
 * and track cleanup. Knows nothing about uploads, endpoints, or playback.
 */
export function useMediaRecorder({
  mimeType = "audio/webm",
  onError,
}: Options = {}): UseMediaRecorder {
  const [recording, setRecording] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.start();
      setRecording(true);
    } catch (err) {
      onError?.(err);
    }
  }, [onError]);

  const stop = useCallback((): Promise<Blob | null> => {
    const mr = mrRef.current;
    if (!mr) return Promise.resolve(null);

    return new Promise((resolve) => {
      // Attach onstop before calling stop() to avoid a race.
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        mr.stream.getTracks().forEach((t) => t.stop());
        mrRef.current = null;
        resolve(blob);
      };
      mr.stop();
      setRecording(false);
    });
  }, [mimeType]);

  return { recording, start, stop };
}
