/**
 * Plays a base64-encoded audio payload. Concern: playback only.
 * Returns the Audio element so callers can pause, observe events, etc.
 */
export function playBase64Audio(
  base64: string,
  mimeType: string = "audio/mp3",
): HTMLAudioElement {
  const audio = new Audio(`data:${mimeType};base64,${base64}`);
  void audio.play();
  return audio;
}
