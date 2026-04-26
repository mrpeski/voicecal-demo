/**
 * TTS / MP3 playback for the voice response. iOS and many mobile browsers only
 * allow `Audio`/`AudioContext` output when the "audio session" is unlocked
 * in direct response to a user gesture, and the unlock does not keep working
 * across `async` if you only use `new Audio().play()`.
 *
 * Call `resumeAudioFromUserGesture()` synchronously from the mic `click`/`tap`
 * handler, then (after the voice upload finishes) we decode MP3 in the
 * already-unlocked `AudioContext` and play with `BufferSource` — that path
 * survives the async wait on mobile.
 */

function getAudioContextClass(): (typeof AudioContext) | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

let _ctx: AudioContext | null = null;

function getOrCreateContext(): AudioContext {
  if (!_ctx) {
    const Ctor = getAudioContextClass();
    if (!Ctor) {
      throw new Error("Web Audio is not available");
    }
    _ctx = new Ctor();
  }
  return _ctx;
}

/**
 * Call from the mic (or any) control, synchronously in the same call stack as
 * `click` / `pointerup` / `touchend` — *before* `void`ing into async work.
 */
export function resumeAudioFromUserGesture(): void {
  if (getAudioContextClass() === null) return;
  try {
    const ctx = getOrCreateContext();
    void ctx.resume();
  } catch {
    // best-effort unlock
  }
}

function base64Mp3ToArrayBufferCopy(base64: string): ArrayBuffer {
  const b = atob(base64);
  const u8 = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/**
 * Plays a base64-encoded MP3 (TTS) response.
 */
export async function playBase64Audio(
  base64: string,
  mimeType: string = "audio/mpeg",
): Promise<void> {
  if (!base64) return;

  const Ctor = getAudioContextClass();
  if (Ctor) {
    try {
      const ctx = getOrCreateContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const ab = base64Mp3ToArrayBufferCopy(base64);
      const copy = ab.slice(0);
      const buffer = await ctx.decodeAudioData(copy);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      return;
    } catch (err) {
      console.warn("playBase64Audio: Web Audio failed, trying HTMLAudio fallback", err);
    }
  }
  const audio = new Audio(`data:${mimeType || "audio/mpeg"};base64,${base64}`);
  await audio.play();
}
