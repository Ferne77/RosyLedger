/** Lightweight confetti burst for achievement celebrations. */

export function celebrateConfetti(durationMs = 2800) {
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  const colors = ['#f472b6', '#fbcfe8', '#db2777', '#fda4af', '#fff1f2', '#ec4899'];
  for (let i = 0; i < 48; i += 1) {
    const bit = document.createElement('span');
    bit.className = 'confetti-bit';
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 0.35}s`;
    bit.style.animationDuration = `${0.9 + Math.random() * 0.8}s`;
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), durationMs);
}

export function showAchievementToast(achievement, toastFn) {
  if (!achievement) return;
  celebrateConfetti();
  toastFn(`${achievement.emoji || '🎀'} Unlocked: ${achievement.title}`);
}
