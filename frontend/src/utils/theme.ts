// Applies theme by setting CSS custom properties on :root.
// Handles both dark and light variants; the light palette is tinted by accent hue.

export function applyTheme(dark: boolean, hue: number): void {
  const el = document.documentElement;

  // Accent (always applied)
  el.style.setProperty('--accent', `oklch(68% 0.16 ${hue})`);
  el.style.setProperty('--accent-glow', `oklch(68% 0.16 ${hue} / 0.2)`);
  el.style.setProperty('--accent-dim', `oklch(68% 0.16 ${hue} / 0.12)`);

  if (dark) {
    el.style.setProperty('--bg', '#0c0c0f');
    el.style.setProperty('--surface', '#14141a');
    el.style.setProperty('--surface2', '#1c1c24');
    el.style.setProperty('--surface3', '#24242e');
    el.style.setProperty('--border', '#28283a');
    el.style.setProperty('--border2', '#34344a');
    el.style.setProperty('--text', '#e6e6f0');
    el.style.setProperty('--text2', '#8888a8');
    el.style.setProperty('--text3', '#48486a');
  } else {
    // Pantone pastel palette — warm parchment tinted by accent hue
    const h = hue;
    el.style.setProperty('--bg', `oklch(91% 0.03 ${h})`);
    el.style.setProperty('--surface', `oklch(94% 0.025 ${h})`);
    el.style.setProperty('--surface2', `oklch(88% 0.04 ${h})`);
    el.style.setProperty('--surface3', `oklch(84% 0.05 ${h})`);
    el.style.setProperty('--border', `oklch(80% 0.05 ${h})`);
    el.style.setProperty('--border2', `oklch(74% 0.06 ${h})`);
    el.style.setProperty('--text', `oklch(20% 0.03 ${h})`);
    el.style.setProperty('--text2', `oklch(40% 0.04 ${h})`);
    el.style.setProperty('--text3', `oklch(60% 0.04 ${h})`);
  }
}
