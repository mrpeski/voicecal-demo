import type { VoiceResult } from "./types";
import { apiUrl } from "./apiBase";

interface UploadOptions {
  endpoint?: string;
  filename?: string;
  fieldName?: string;
  signal?: AbortSignal;
  conversationId?: string | null;
}

/**
 * POSTs an audio blob to the voice endpoint as multipart/form-data and
 * returns the parsed response. Transport only — no recording, no playback.
 */
export async function uploadVoice(
  blob: Blob,
  {
    endpoint = "/api/voice",
    filename = "rec.webm",
    fieldName = "audio",
    signal,
    conversationId,
  }: UploadOptions = {},
): Promise<VoiceResult> {
  const form = new FormData();
  form.append(fieldName, blob, filename);
  if (conversationId) {
    form.append("conversation_id", conversationId);
  }

  const res = await fetch(apiUrl(endpoint), { method: "POST", body: form, signal });
  if (!res.ok) {
    throw new Error(`Voice upload failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<VoiceResult>;
}
