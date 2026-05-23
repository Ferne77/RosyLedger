/** Wishlist, weekly report, achievements wall, wardrobe, widget. */

import { api, getToken } from '../lib/api.js';
import { $, escapeHtml, toast } from '../lib/dom.js';
import { moneyFromCents, yyyyMm } from '../lib/dateMoney.js';
import { applyTheme } from '../lib/themeManager.js';
import { showAchievementToast, celebrateConfetti } from '../ui/ConfettiCelebration.js';

export class CompanionViews {
  constructor() {
    this._profile = null;
    this._bound = false;
  }

  mount() {
    if (this._bound) return;
    this._bound = true;
    $('#btn-add-wish')?.addEventListener('click', () => this.addWish());
    $('#companion-theme-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme-id]');
      if (btn) this.selectTheme(btn.dataset.themeId);
    });
    $('#wishlist-list')?.addEventListener('click', (e) => {
      const saveBtn = e.target.closest('[data-wish-save]');
      const delBtn = e.target.closest('[data-wish-del]');
      if (saveBtn) this.saveWishProgress(saveBtn.dataset.wishSave);
      if (delBtn) this.deleteWish(delBtn.dataset.wishDel);
    });
  }

  async onLogin() {
    this.mount();
    try {
      this._profile = await api('/api/companion/profile');
      applyTheme(this._profile.theme || 'rosy');
      const check = await api('/api/companion/achievements/check');
      (check.newAchievements || []).forEach((a) => showAchievementToast(a, toast));
      await this.renderWidget();
    } catch {
      /* offline */
    }
  }

  async renderWidget() {
    const box = $('#companion-widget-card');
    if (!box || !getToken()) return;
    try {
      const w = await api('/api/companion/widget');
      box.innerHTML = `
        <div class="widget-stat"><span>Spent</span><strong>${moneyFromCents(w.spentCents)}</strong></div>
        <div class="widget-stat"><span>Left</span><strong>${w.remainingCents != null ? moneyFromCents(w.remainingCents) : '—'}</strong></div>
        <p class="widget-kitty-line">${escapeHtml(w.kittyLine || '')}</p>
      `;
    } catch {
      box.innerHTML = '<p class="widget-kitty-line">Install as PWA for a home-screen budget buddy~</p>';
    }
  }

  async renderWishlist() {
    if (!getToken()) return;
    const box = $('#wishlist-list');
    if (!box) return;
    try {
      const data = await api('/api/companion/wishlist');
      const items = data.items || [];
      box.innerHTML = items.length
        ? items.map((w) => this._wishHtml(w)).join('')
        : '<p class="companion-empty">No wishes yet — dream a little!</p>';
    } catch (err) {
      box.innerHTML = '<p class="companion-empty">Could not load wishlist.</p>';
      toast(err.message || 'Wishlist error');
    }
  }

  _wishHtml(w) {
    const pct = Math.round((w.progress || 0) * 100);
    return `
      <article class="wish-card">
        <div class="wish-card__head">
          <h3>${escapeHtml(w.title)}</h3>
          <span class="wish-card__pct">${pct}%</span>
        </div>
        <div class="wish-progress"><span style="width:${pct}%"></span></div>
        <p class="wish-card__hint">${escapeHtml(w.kittyHint)} · Target ${moneyFromCents(w.targetAmountCents)}</p>
        <div class="wish-card__actions">
          <button class="btn btn--ghost" type="button" data-wish-save="${w.id}">Update saved</button>
          <button class="btn btn--ghost" type="button" data-wish-del="${w.id}">Remove</button>
        </div>
      </article>`;
  }

  async addWish() {
    const title = $('#wish-title')?.value?.trim();
    const amount = Number($('#wish-amount')?.value);
    if (!title || !(amount > 0)) {
      toast('Enter a wish name and target amount');
      return;
    }
    try {
      const data = await api('/api/companion/wishlist', {
        method: 'POST',
        body: { title, amount }
      });
      (data.newAchievements || []).forEach((a) => showAchievementToast(a, toast));
      $('#wish-title').value = '';
      $('#wish-amount').value = '';
      await this.renderWishlist();
      toast('Wish added~');
    } catch (err) {
      toast(err.message || 'Could not add wish');
    }
  }

  async saveWishProgress(id) {
    const raw = window.prompt('How much have you saved toward this wish? ($)');
    if (raw == null) return;
    const saved = Number(raw);
    if (!(saved >= 0)) return;
    try {
      await api(`/api/companion/wishlist/${id}/saved`, {
        method: 'PUT',
        body: { saved }
      });
      await this.renderWishlist();
      celebrateConfetti(1800);
      toast('Progress updated~');
    } catch {
      toast('Update failed');
    }
  }

  async deleteWish(id) {
    if (!window.confirm('Remove this wish?')) return;
    try {
      await api(`/api/companion/wishlist/${id}`, { method: 'DELETE' });
      await this.renderWishlist();
    } catch {
      toast('Delete failed');
    }
  }

  async renderWeekly() {
    if (!getToken()) return;
    const box = $('#weekly-report-body');
    if (!box) return;
    try {
      const r = await api('/api/companion/weekly-report');
      box.innerHTML = `
        <div class="weekly-hero">
          <span class="weekly-range">${escapeHtml(r.weekStart)} → ${escapeHtml(r.weekEnd)}</span>
          ${r.isSunday ? '<span class="weekly-badge">Sunday warm report ♡</span>' : ''}
        </div>
        <div class="weekly-grid">
          <div class="weekly-stat"><span>Spent</span><strong>${moneyFromCents(r.spentCents)}</strong></div>
          <div class="weekly-stat"><span>Income</span><strong>${moneyFromCents(r.incomeCents)}</strong></div>
          <div class="weekly-stat"><span>Saved</span><strong>${moneyFromCents(r.savedCents)}</strong></div>
          <div class="weekly-stat"><span>Impulse</span><strong>${moneyFromCents(r.impulseCents)}</strong></div>
        </div>
        <blockquote class="weekly-kitty">${escapeHtml(r.kittyReview)}</blockquote>
        <p class="weekly-meta">${r.entryCount} entries · ${r.moodDays} mood check-ins</p>
      `;
    } catch {
      box.innerHTML = '<p class="companion-empty">Could not load weekly report.</p>';
    }
  }

  async renderAchievements() {
    if (!getToken()) return;
    try {
      const profile = await api('/api/companion/profile');
      this._profile = profile;
      const wall = $('#achievements-wall');
      if (wall) {
        wall.innerHTML = (profile.achievements || [])
          .map(
            (a) => `
          <article class="badge-card ${a.unlocked ? 'is-unlocked' : ''}">
            <span class="badge-card__emoji">${escapeHtml(a.emoji || '🎀')}</span>
            <h3>${escapeHtml(a.title)}</h3>
            <p>${escapeHtml(a.description)}</p>
          </article>`
          )
          .join('');
      }
      const themes = $('#companion-theme-grid');
      if (themes) {
        themes.innerHTML = (profile.themes || [])
          .map(
            (t) => `
          <button type="button" class="theme-pick ${t.active ? 'is-active' : ''} ${t.unlocked ? '' : 'is-locked'}"
            data-theme-id="${escapeHtml(t.id)}" ${t.unlocked ? '' : 'disabled'}>
            <span class="theme-pick__emoji">${escapeHtml(t.emoji)}</span>
            <span>${escapeHtml(t.label)}</span>
          </button>`
          )
          .join('');
      }
    } catch {
      /* ignore */
    }
  }

  async renderEmotions(month) {
    const box = $('#emotion-breakdown');
    if (!box || !getToken()) return;
    const m = month || $('#filter-month')?.value || yyyyMm(new Date());
    box.innerHTML = '<p class="companion-empty">Loading emotions…</p>';
    try {
      const data = await api(`/api/companion/emotions?month=${encodeURIComponent(m)}`);
      const labels = {
        happy: '😊 Happy spend',
        impulse: '⚡ Impulse',
        necessary: '✓ Necessary',
        unset: '🏷️ No mood tagged'
      };
      const items = data.items || [];
      if (!items.length) {
        box.innerHTML =
          '<p class="companion-empty">No expenses this month yet — log some and tag how they felt!</p>';
        return;
      }
      const maxCents = Math.max(...items.map((x) => x.totalCents), 1);
      box.innerHTML =
        items
          .map((x) => {
            const pct = Math.round((x.totalCents / maxCents) * 100);
            return `
            <div class="emotion-row emotion-row--${escapeHtml(x.emotion)}">
              <span class="emotion-row__label">${escapeHtml(labels[x.emotion] || x.emotion)}</span>
              <div class="emotion-row__bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
              <strong>${moneyFromCents(x.totalCents)}</strong>
              <span class="emotion-count">${x.count}</span>
            </div>`;
          })
          .join('') +
        `<p class="emotion-top">Top mood: <strong>${escapeHtml(data.topLabel)}</strong></p>` +
        (data.topEmotion === 'unset' || !data.topEmotion
          ? '<p class="emotion-hint">These expenses were logged without a spending mood. When adding one, pick Happy / Impulse / Necessary below the amount.</p>'
          : '');
    } catch (err) {
      box.innerHTML = `<p class="companion-empty">Emotions unavailable — ${escapeHtml(err.message || 'try refresh')}</p>`;
    }
  }

  async renderQuickThemes(containerId = 'kitty-chat-theme-picks') {
    const grid = $(`#${containerId}`);
    if (!grid || !getToken()) return;
    try {
      const profile = this._profile || (await api('/api/companion/profile'));
      this._profile = profile;
      const unlocked = (profile.themes || []).filter((t) => t.unlocked);
      grid.innerHTML = unlocked
        .map(
          (t) => `
        <button type="button" class="theme-pick theme-pick--compact ${t.active ? 'is-active' : ''}"
          data-theme-id="${escapeHtml(t.id)}" data-theme-quick="1">
          <span class="theme-pick__emoji">${escapeHtml(t.emoji)}</span>
          <span>${escapeHtml(t.label)}</span>
        </button>`
        )
        .join('');
      grid.querySelectorAll('[data-theme-quick]').forEach((btn) => {
        btn.addEventListener('click', () => this.selectTheme(btn.dataset.themeId));
      });
    } catch {
      grid.innerHTML = '';
    }
  }

  async selectTheme(themeId) {
    try {
      await api('/api/companion/theme', {
        method: 'PUT',
        body: { theme: themeId }
      });
      applyTheme(themeId);
      const name =
        (this._profile?.themes || []).find((t) => t.id === themeId)?.label || themeId;
      toast(`${name} theme applied~`);
      await this.renderAchievements();
      await this.renderQuickThemes('kitty-chat-theme-picks');
    } catch {
      toast('Theme locked — unlock via achievements');
    }
  }

  handleNewAchievements(list) {
    (list || []).forEach((a) => showAchievementToast(a, toast));
  }
}

export const companionViews = new CompanionViews();
