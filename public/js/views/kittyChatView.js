/** Full-page Hello Kitty chat — floating mini panel stays separate. */

import { api, getToken } from '../lib/api.js';
import { $, escapeHtml } from '../lib/dom.js';
import { yyyyMm } from '../lib/dateMoney.js';
import { companionViews } from './companionViews.js';

const HK_HERO = '/images/hello-kitty-256.png';
const HK_MSG = '/images/hello-kitty-128.png';

export class KittyChatView {
  constructor() {
    this._messages = [];
    this._bound = false;
    this._welcomed = false;
  }

  mount() {
    if (this._bound) return;
    this._bound = true;
    $('#kitty-page-send')?.addEventListener('click', () => this.send());
    $('#kitty-page-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });
    document.querySelectorAll('[data-kitty-page-chip]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = $('#kitty-page-input');
        if (input) input.value = chip.dataset.kittyPageChip || '';
        this.send();
      });
    });
  }

  _seedWelcome(name) {
    if (this._welcomed && this._messages.length) return;
    this._messages = [
      {
        role: 'assistant',
        content:
          `Hi ${name || 'friend'}~ I'm Kitty! 🎀\n\n` +
          'Talk about feelings, budget, or your day — no judgment. ' +
          'Try the pink chips above, or pick an outfit on the right~'
      }
    ];
    this._welcomed = true;
    this._renderMessages();
  }

  async refresh() {
    if (!getToken()) return;
    this.mount();
    const month = $('#filter-month')?.value || yyyyMm(new Date());
    let displayName = 'friend';
    try {
      const data = await api(`/api/assistant/greeting?month=${encodeURIComponent(month)}`);
      displayName = data.username || displayName;
      const title = $('#kitty-page-greeting');
      const sub = $('#kitty-page-subtitle');
      if (title) title.textContent = data.greeting || `Hi ${displayName}~`;
      if (sub) sub.textContent = data.subtitle || 'Your gentle money buddy';
      if (data.holidayGreeting) {
        document.documentElement.dataset.holiday = '1';
      }
    } catch {
      /* ignore */
    }
    this._seedWelcome(displayName);
    await Promise.all([
      this._renderSuggestions(month),
      companionViews.renderWidget(),
      companionViews.renderQuickThemes('kitty-chat-theme-picks')
    ]);
  }

  async _renderSuggestions(month) {
    const box = $('#kitty-page-suggestions');
    if (!box) return;
    try {
      const data = await api(`/api/assistant/suggestions?month=${encodeURIComponent(month)}`);
      const items = data.items || [];
      box.innerHTML = items.length
        ? items
            .slice(0, 3)
            .map(
              (x) =>
                `<div class="kitty-page-tip kitty-page-tip--${escapeHtml(x.level)}"><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.message)}</span></div>`
            )
            .join('')
        : '<div class="kitty-page-tip"><span>Log expenses and I\'ll share gentle tips here~</span></div>';
    } catch {
      box.innerHTML = '<div class="kitty-page-tip"><span>Tips will appear when your ledger has data~</span></div>';
    }
  }

  _renderMessages() {
    const box = $('#kitty-page-messages');
    if (!box) return;
    box.innerHTML = this._messages
      .map(
        (m) => `
      <div class="kitty-page-msg kitty-page-msg--${escapeHtml(m.role)}">
        ${m.role === 'assistant' ? `<img class="kitty-page-msg__avatar" src="${HK_MSG}" alt="" width="44" height="44" />` : ''}
        <div class="kitty-page-msg__bubble">${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>
      </div>`
      )
      .join('');
    box.scrollTop = box.scrollHeight;
  }

  async send() {
    const input = $('#kitty-page-input');
    const text = (input?.value || '').trim();
    if (!text || !getToken()) return;
    input.value = '';
    this._messages.push({ role: 'user', content: text });
    this._renderMessages();
    const month = $('#filter-month')?.value || yyyyMm(new Date());
    const history = this._messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const sendBtn = $('#kitty-page-send');
    if (sendBtn) sendBtn.disabled = true;
    try {
      const data = await api('/api/assistant/chat', {
        method: 'POST',
        body: { message: text, month, history }
      });
      this._messages.push({ role: 'assistant', content: data.reply || '…' });
      this._renderMessages();
    } catch {
      this._messages.push({
        role: 'assistant',
        content: 'Oops — lost connection for a moment. Try again?'
      });
      this._renderMessages();
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      input?.focus();
    }
  }
}

export const kittyChatView = new KittyChatView();
