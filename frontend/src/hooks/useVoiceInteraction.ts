import { useCallback, useState } from "react";
import { useMediaRecorder } from "./useMediaRecorder";
import usePersistentState from './usePersistentState';
import { uploadVoice } from "../lib/voiceApi";
import { playBase64Audio } from "../lib/audioPlayback";
import type { VoiceResult } from "../lib/types";

interface Options {
  endpoint?: string;
  minBlobSize?: number;
  mimeType?: string;
  autoplayResponse?: boolean;
  onResult?: (result: VoiceResult) => void;
  onError?: (err: unknown) => void;
}

export interface UseVoiceInteraction {
  recording: boolean;
  /** True while the captured audio is being uploaded / awaited. */
  pending: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Composes useMediaRecorder + uploadVoice + playBase64Audio into a single
 * "record, send, play response" flow. Each underlying piece can be used on
 * its own if you need different composition (e.g. record without uploading,
 * or upload a blob from elsewhere).
 */
export function useVoiceInteraction({
  endpoint,
  minBlobSize = 1000,
  mimeType,
  autoplayResponse = true,
  onResult,
  onError,
}: Options = {}): UseVoiceInteraction {
  const [pending, setPending] = useState(false);
  const { recording, start, stop: stopRecording } = useMediaRecorder({ mimeType, onError });
  const [conversationId, setConversationId] = usePersistentState<string | null>(
    "voicecal.conversation_id",
    null,
  );
  const stop = useCallback(async () => {
    const blob = await stopRecording();
    if (!blob || blob.size < minBlobSize) return;

    setPending(true);
    try {
      const data = await uploadVoice(blob, { endpoint, conversationId });
      setConversationId(data.conversation_id);
      if (autoplayResponse && data.audio_base64) {
        playBase64Audio(data.audio_base64);
      }
      onResult?.(data);
    } catch (err) {
      onError?.(err);
    } finally {
      setPending(false);
    }
  }, [stopRecording, minBlobSize, endpoint, autoplayResponse, onResult, onError]);

  return { recording, pending, start, stop };
}
