/** Daily mood check-in modal on login. */

import { api } from '../lib/api.js';
import { $, toast } from '../lib/dom.js';
import { showAchievementToast } from './ConfettiCelebration.js';

export class MoodCheckin {
  constructor() {
    this._bound = false;
    this._pendingReply = '';
  }

  mount() {
    if (this._bound) return;
    this._bound = true;
    document.querySelectorAll('[data-mood]').forEach((btn) => {
      btn.addEventListener('click', () => this.submit(btn.dataset.mood));
    });
    $('#btn-mood-skip')?.addEventListener('click', () => this.close());
    $('#btn-mood-done')?.addEventListener('click', () => {
      this.close();
      this.resetSteps();
    });
  }

  async maybeShow() {
    this.mount();
    try {
      const data = await api('/api/companion/mood/today');
      if (data.checked) return false;
    } catch {
      return false;
    }
    $('#mood-dialog')?.showModal();
    return true;
  }

  close() {
    $('#mood-dialog')?.close();
  }

  async submit(mood) {
    if (!mood) return;
    try {
      const data = await api('/api/companion/mood', {
        method: 'POST',
        body: { mood }
      });
      this._pendingReply = data.kittyReply || '';
      (data.newAchievements || []).forEach((a) => showAchievementToast(a, toast));
      const replyEl = $('#mood-kitty-reply');
      if (replyEl) replyEl.textContent = this._pendingReply;
      $('#mood-pick-step')?.setAttribute('hidden', '');
      $('#mood-reply-step')?.removeAttribute('hidden');
    } catch {
      this.close();
    }
  }

  consumeReply() {
    const text = this._pendingReply;
    this._pendingReply = '';
    return text;
  }

  resetSteps() {
    $('#mood-pick-step')?.removeAttribute('hidden');
    $('#mood-reply-step')?.setAttribute('hidden', '');
    $('#mood-kitty-reply').textContent = '';
  }
}

export const moodCheckin = new MoodCheckin();
