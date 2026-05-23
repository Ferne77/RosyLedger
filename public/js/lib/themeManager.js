/** Apply Kitty wardrobe / theme — full palette so switches are visibly different. */

const THEMES = {
  rosy: {
    '--bg': '#fff5f8',
    '--bg2': '#ffe8f0',
    '--theme-glow-1': 'rgba(251, 207, 232, 0.72)',
    '--theme-glow-2': 'rgba(252, 231, 243, 0.92)',
    '--accent': '#db2777',
    '--accent2': '#f472b6',
    '--accent-soft': '#fce7f3',
    '--cute-rose': '#f472b6',
    '--cute-rose-deep': '#be185d',
    '--cute-rose-soft': '#fce7f3',
    '--cute-rose-pale': '#fff5fa',
    '--btn-grad-1': '#fbcfe8',
    '--btn-grad-2': '#f9a8d4',
    '--btn-grad-3': '#f472b6',
    '--theme-shadow': 'rgba(219, 39, 119, 0.24)',
    '--theme-hero': 'linear-gradient(135deg, rgba(252, 231, 243, 0.75), rgba(255, 255, 255, 0.95))'
  },
  sakura: {
    '--bg': '#fff0f5',
    '--bg2': '#ffd6e7',
    '--theme-glow-1': 'rgba(255, 105, 180, 0.45)',
    '--theme-glow-2': 'rgba(255, 192, 203, 0.85)',
    '--accent': '#db2777',
    '--accent2': '#f472b6',
    '--accent-soft': '#ffe4ef',
    '--cute-rose': '#fb7185',
    '--cute-rose-deep': '#e11d48',
    '--cute-rose-soft': '#ffe4e6',
    '--cute-rose-pale': '#fff1f2',
    '--btn-grad-1': '#fecdd3',
    '--btn-grad-2': '#fda4af',
    '--btn-grad-3': '#fb7185',
    '--theme-shadow': 'rgba(225, 29, 72, 0.28)',
    '--theme-hero': 'linear-gradient(135deg, rgba(255, 228, 230, 0.9), rgba(255, 241, 242, 0.98))'
  },
  cotton: {
    '--bg': '#fff1f2',
    '--bg2': '#fecdd3',
    '--theme-glow-1': 'rgba(244, 63, 94, 0.35)',
    '--theme-glow-2': 'rgba(254, 205, 211, 0.88)',
    '--accent': '#e11d48',
    '--accent2': '#f43f5e',
    '--accent-soft': '#ffe4e6',
    '--cute-rose': '#f43f5e',
    '--cute-rose-deep': '#be123c',
    '--cute-rose-soft': '#fecaca',
    '--cute-rose-pale': '#fff1f2',
    '--btn-grad-1': '#fecaca',
    '--btn-grad-2': '#f87171',
    '--btn-grad-3': '#ef4444',
    '--theme-shadow': 'rgba(190, 18, 60, 0.3)',
    '--theme-hero': 'linear-gradient(135deg, rgba(254, 202, 202, 0.85), rgba(255, 255, 255, 0.96))'
  },
  lavender: {
    '--bg': '#fdf4ff',
    '--bg2': '#f3e8ff',
    '--theme-glow-1': 'rgba(192, 132, 252, 0.45)',
    '--theme-glow-2': 'rgba(233, 213, 255, 0.9)',
    '--accent': '#a21caf',
    '--accent2': '#c026d3',
    '--accent-soft': '#f3e8ff',
    '--cute-rose': '#c026d3',
    '--cute-rose-deep': '#86198f',
    '--cute-rose-soft': '#e9d5ff',
    '--cute-rose-pale': '#faf5ff',
    '--btn-grad-1': '#e9d5ff',
    '--btn-grad-2': '#d8b4fe',
    '--btn-grad-3': '#a855f7',
    '--theme-shadow': 'rgba(134, 25, 143, 0.28)',
    '--theme-hero': 'linear-gradient(135deg, rgba(243, 232, 255, 0.92), rgba(255, 255, 255, 0.98))'
  },
  mint: {
    '--bg': '#f0fdf9',
    '--bg2': '#ccfbf1',
    '--theme-glow-1': 'rgba(110, 231, 183, 0.45)',
    '--theme-glow-2': 'rgba(167, 243, 208, 0.75)',
    '--accent': '#0d9488',
    '--accent2': '#14b8a6',
    '--accent-soft': '#ccfbf1',
    '--cute-rose': '#2dd4bf',
    '--cute-rose-deep': '#0f766e',
    '--cute-rose-soft': '#99f6e4',
    '--cute-rose-pale': '#f0fdfa',
    '--btn-grad-1': '#99f6e4',
    '--btn-grad-2': '#5eead4',
    '--btn-grad-3': '#14b8a6',
    '--theme-shadow': 'rgba(15, 118, 110, 0.28)',
    '--theme-hero': 'linear-gradient(135deg, rgba(204, 251, 241, 0.9), rgba(255, 255, 255, 0.98))'
  },
  starlight: {
    '--bg': '#fff1f3',
    '--bg2': '#ffe4e8',
    '--theme-glow-1': 'rgba(251, 113, 133, 0.5)',
    '--theme-glow-2': 'rgba(255, 228, 230, 0.92)',
    '--accent': '#9f1239',
    '--accent2': '#e11d48',
    '--accent-soft': '#ffe4e6',
    '--cute-rose': '#fb7185',
    '--cute-rose-deep': '#881337',
    '--cute-rose-soft': '#fecdd3',
    '--cute-rose-pale': '#fff1f2',
    '--btn-grad-1': '#fda4af',
    '--btn-grad-2': '#fb7185',
    '--btn-grad-3': '#e11d48',
    '--theme-shadow': 'rgba(136, 19, 55, 0.32)',
    '--theme-hero': 'linear-gradient(135deg, rgba(254, 205, 211, 0.88), rgba(255, 250, 250, 0.98))'
  }
};

const STORAGE_KEY = 'rosyledger.kitty-theme';

export function getStoredTheme() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return id && THEMES[id] ? id : 'rosy';
  } catch {
    return 'rosy';
  }
}

export function applyTheme(themeId) {
  const id = THEMES[themeId] ? themeId : 'rosy';
  const vars = THEMES[id];
  const root = document.documentElement;
  root.dataset.kittyTheme = id;
  Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val));
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && vars['--bg']) meta.content = vars['--bg'];
}

/** Call before paint when possible */
export function applyStoredTheme() {
  applyTheme(getStoredTheme());
}
