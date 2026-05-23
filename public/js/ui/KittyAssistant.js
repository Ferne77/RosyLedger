/**
 * Hello Kitty companion — chat for tips & encouragement; ledger tab for entries.
 */

import { api, getToken } from '../lib/api.js';
import { $, escapeHtml, toast } from '../lib/dom.js';
import { yyyyMm } from '../lib/dateMoney.js';
import { refreshExpenses } from '../views/expensesView.js';
import { refreshStats } from '../views/statsView.js';
import { state } from '../state.js';

const HK_AVATAR = '/images/hello-kitty-128.png';
const HK_PANEL = '/images/hello-kitty-256.png';
const BUBBLE_AUTO_HIDE_MS = 9000;

function kittyImg(src, className = 'hello-kitty-img') {
  return `<img class="${className}" src="${src}" alt="Hello Kitty" width="128" height="128" loading="lazy" />`;
}

export class KittyAssistant {
  constructor() {
    this._open = false;
    this._tab = 'chat';
    this._messages = [];
    this._greetingLoaded = false;
    this._bound = false;
    this._recordType = 'expense';
    this._bubbleTimer = null;
    this._bubbleDelayTimer = null;
    this._loginBubbleShown = false;
    this._pendingBubbleText = '';
  }

  mount() {
    if (this._bound) return;
    this._bound = true;
    this._renderChips();
    this._injectAvatars();
    this._initRecordForm();
    this._wireEvents();
  }

  _injectAvatars() {
    document.querySelectorAll('[data-hello-kitty-slot="panel"]').forEach((el) => {
      el.innerHTML = kittyImg(HK_PANEL, 'hello-kitty-img hello-kitty-img--panel');
    });
    document.querySelectorAll('[data-hello-kitty-slot="toggle"]').forEach((el) => {
      el.innerHTML = kittyImg(HK_AVATAR, 'hello-kitty-img hello-kitty-img--toggle');
    });
  }

  _initRecordForm() {
    const dateEl = $('#kitty-record-date');
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toISOString().slice(0, 10);
    }
    this._updateAmountPreview();
  }

  show() {
    const root = $('#kitty-assistant');
    if (root) root.hidden = false;
  }

  hide() {
    const root = $('#kitty-assistant');
    if (root) root.hidden = true;
    this._open = false;
    this._syncPanel();
  }

  async onLogin() {
    this.show();
    this.mount();
    if (!this._greetingLoaded) {
      await this.loadGreeting();
    }
    this._triggerLoginBubble();
  }

  onLogout() {
    this.hide();
    clearTimeout(this._bubbleDelayTimer);
    clearTimeout(this._bubbleTimer);
    this._hideLoginBubble(true);
    this._loginBubbleShown = false;
    this._pendingBubbleText = '';
    this._messages = [];
    this._greetingLoaded = false;
    this._renderMessages();
  }

  _triggerLoginBubble() {
    if (this._loginBubbleShown || !getToken()) return;
    clearTimeout(this._bubbleDelayTimer);
    const text = this._pendingBubbleText || this._fallbackBubbleText();
    this._bubbleDelayTimer = setTimeout(() => {
      if (getToken() && !this._loginBubbleShown) {
        this._showLoginBubble(text);
      }
    }, 700);
  }

  _friendlyName() {
    const raw = (state.user?.username || 'friend').split('@')[0];
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'friend';
  }

  _fallbackBubbleText() {
    const hour = new Date().getHours();
    const name = this._friendlyName();
    if (hour < 11) return `Good morning, ${name}~ glad you're here today.`;
    if (hour < 18) return `Hey ${name}~ you're doing better than you think.`;
    return `Good evening, ${name}~ you made it through today.`;
  }

  _pickBubbleText(data) {
    if (data?.bubbleGreeting) return data.bubbleGreeting;
    if (Array.isArray(data?.bubbleGreetings) && data.bubbleGreetings[0]) {
      return data.bubbleGreetings[0];
    }
    return this._fallbackBubbleText();
  }

  _showLoginBubble(text) {
    if (this._open || !text || this._loginBubbleShown) return;
    const bubble = $('#kitty-daily-bubble');
    const textEl = $('#kitty-daily-bubble-text');
    if (!bubble || !textEl) return;

    this._loginBubbleShown = true;
    textEl.textContent = text;
    bubble.hidden = false;
    bubble.classList.remove('is-leaving');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => bubble.classList.add('is-visible'));
    });

    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => this._hideLoginBubble(), BUBBLE_AUTO_HIDE_MS);
  }

  _hideLoginBubble(instant = false) {
    const bubble = $('#kitty-daily-bubble');
    if (!bubble) return;
    clearTimeout(this._bubbleTimer);
    clearTimeout(this._bubbleDelayTimer);

    if (instant || !bubble.classList.contains('is-visible')) {
      bubble.classList.remove('is-visible', 'is-leaving');
      bubble.hidden = true;
      return;
    }

    bubble.classList.add('is-leaving');
    bubble.classList.remove('is-visible');
    setTimeout(() => {
      bubble.hidden = true;
      bubble.classList.remove('is-leaving');
    }, 560);
  }

  _renderChips() {
    const chips = [
      { label: 'Say hello', text: 'Hello Kitty!' },
      { label: 'How are you?', text: 'How are you?' },
      { label: 'Get tips', text: 'Give me tips' },
      { label: 'Encourage me', text: 'I feel stressed about money' },
    ];
    const box = $('#kitty-chips');
    if (!box) return;
    box.innerHTML = chips
      .map(
        (c) =>
          `<button type="button" class="kitty-chip" data-kitty-chip="${escapeHtml(c.text)}">${escapeHtml(c.label)}</button>`
      )
      .join('');
  }

  _currentMonth() {
    return $('#filter-month')?.value || yyyyMm(new Date());
  }

  _wireEvents() {
    $('#kitty-toggle')?.addEventListener('click', () => {
      this._hideLoginBubble();
      this.toggle();
    });
    $('#kitty-close')?.addEventListener('click', () => this.close());
    $('#kitty-daily-bubble-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideLoginBubble();
    });
    $('#kitty-send')?.addEventListener('click', () => this.sendChat());
    $('#kitty-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendChat();
      }
    });
    $('#kitty-record-btn')?.addEventListener('click', () => this.submitRecord());
    $('#kitty-record-amount')?.addEventListener('input', () => this._updateAmountPreview());
    $('#kitty-record-type-expense')?.addEventListener('click', () => this.setRecordType('expense'));
    $('#kitty-record-type-income')?.addEventListener('click', () => this.setRecordType('income'));
    document.querySelectorAll('[data-kitty-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this.setTab(btn.dataset.kittyTab));
    });
    $('#kitty-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-kitty-chip]');
      if (!chip) return;
      const input = $('#kitty-input');
      if (input) input.value = chip.dataset.kittyChip;
      this.setTab('chat');
      this.sendChat();
    });
  }

  setRecordType(type) {
    this._recordType = type === 'income' ? 'income' : 'expense';
    $('#kitty-record-type-expense')?.classList.toggle('is-active', this._recordType === 'expense');
    $('#kitty-record-type-income')?.classList.toggle('is-active', this._recordType === 'income');
    const catField = $('#kitty-record-category-wrap');
    if (catField) catField.hidden = this._recordType === 'income';
    this._updateAmountPreview();
  }

  _updateAmountPreview() {
    const amount = Number($('#kitty-record-amount')?.value || 0);
    const preview = $('#kitty-record-preview-amount');
    if (!preview) return;
    const prefix = this._recordType === 'income' ? '+' : '−';
    preview.textContent = amount > 0 ? `${prefix}$${amount.toFixed(2)}` : '$0.00';
    preview.classList.toggle('kitty-ledger-preview__amount--income', this._recordType === 'income');
  }

  toggle() {
    this._open = !this._open;
    this._syncPanel();
    if (this._open && !this._greetingLoaded) {
      this.loadGreeting();
    }
    if (this._open && this._tab === 'record') {
      this.populateCategories();
      this._initRecordForm();
    }
  }

  close() {
    this._open = false;
    this._syncPanel();
  }

  _syncPanel() {
    const panel = $('#kitty-panel');
    const toggle = $('#kitty-toggle');
    if (panel) panel.hidden = !this._open;
    if (toggle) toggle.classList.toggle('is-open', this._open);
    toggle?.setAttribute('aria-expanded', String(this._open));
    if (this._open) this._hideLoginBubble();
  }

  setTab(tab) {
    this._tab = tab;
    document.querySelectorAll('[data-kitty-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.kittyTab === tab);
    });
    document.querySelectorAll('[data-kitty-pane]').forEach((pane) => {
      pane.hidden = pane.dataset.kittyPane !== tab;
    });
    if (tab === 'record') {
      this.populateCategories();
      this._initRecordForm();
    }
  }

  populateCategories() {
    const select = $('#kitty-record-category');
    if (!select) return;
    select.innerHTML = state.categories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
  }

  addMessage(role, text) {
    this._messages.push({ role, text, at: Date.now() });
    this._renderMessages();
  }

  _renderMessages() {
    const box = $('#kitty-messages');
    if (!box) return;
    box.innerHTML = this._messages
      .map(
        (m) => `
        <div class="kitty-msg kitty-msg--${m.role}">
          ${m.role === 'bot' ? `<span class="kitty-msg__avatar" aria-hidden="true">${kittyImg(HK_AVATAR, 'hello-kitty-img hello-kitty-img--chat')}</span>` : ''}
          <div class="kitty-msg__bubble">${escapeHtml(m.text)}</div>
        </div>
      `
      )
      .join('');
    box.scrollTop = box.scrollHeight;
  }

  async loadGreeting() {
    if (!getToken()) return;
    try {
      const month = this._currentMonth();
      const data = await api(`/api/assistant/greeting?month=${encodeURIComponent(month)}`);
      const subEl = $('#kitty-greeting-sub');
      const tipEl = $('#kitty-tip-banner');
      if (subEl) subEl.textContent = data.greeting || 'Your companion for tips & encouragement';
      if (tipEl) tipEl.textContent = data.tip || '';
      if (this._messages.length === 0) {
        const who = data.username && data.username !== 'friend' ? `, ${data.username}` : '';
        this.addMessage(
          'bot',
          `${data.greeting}${who}!\n\nI'm here to chat — your day, your feelings, or your budget when you're ready. What's on your mind?`
        );
      }
      this._pendingBubbleText = this._pickBubbleText(data);
      this._greetingLoaded = true;
    } catch {
      this._pendingBubbleText = this._fallbackBubbleText();
      this._greetingLoaded = true;
    }
  }

  async sendChat() {
    const input = $('#kitty-input');
    const text = input?.value.trim();
    if (!text || !getToken()) return;
    input.value = '';
    const history = this._messages.slice(-10).map((m) => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.text,
    }));
    this.addMessage('user', text);
    const sendBtn = $('#kitty-send');
    if (sendBtn) sendBtn.disabled = true;
    try {
      const data = await api('/api/assistant/chat', {
        method: 'POST',
        body: {
          message: text,
          month: this._currentMonth(),
          history,
        },
      });
      this.addMessage('bot', data.reply || "I'm here for you!");
      if (data.intent === 'ledger_redirect') {
        /* keep user in chat; message already explains ledger tab */
      }
    } catch (err) {
      this.addMessage('bot', `Something went wrong: ${err.message}`);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      input?.focus();
    }
  }

  async submitRecord() {
    const title = $('#kitty-record-title')?.value.trim();
    const amount = Number($('#kitty-record-amount')?.value || 0);
    const categoryId = $('#kitty-record-category')?.value;
    const date = $('#kitty-record-date')?.value;
    const notes = $('#kitty-record-notes')?.value.trim();
    if (!title || !amount || !date) {
      toast('Title, amount, and date are required');
      return;
    }
    if (this._recordType === 'expense' && !categoryId) {
      toast('Select a category for expenses');
      return;
    }
    const btn = $('#kitty-record-btn');
    if (btn) btn.disabled = true;
    try {
      const payload = { title, amount, date, type: this._recordType };
      if (this._recordType === 'expense') payload.categoryId = categoryId;
      const data = await api('/api/assistant/record', {
        method: 'POST',
        body: payload,
      });
      if (notes && data.id) {
        await api(`/api/expenses/${data.id}`, {
          method: 'PUT',
          body: { description: notes },
        }).catch(() => {});
      }
      toast(data.message || 'Entry posted');
      await this._afterRecord();

      this.setTab('chat');
      if (data.companionReply) {
        this.addMessage('bot', data.companionReply);
      }

      $('#kitty-record-title').value = '';
      $('#kitty-record-amount').value = '';
      $('#kitty-record-notes').value = '';
      this._initRecordForm();
    } catch (err) {
      toast(err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async _afterRecord() {
    const month = this._currentMonth();
    await refreshExpenses();
    await refreshStats(month);
    await this.loadGreeting();
  }
}

export const kittyAssistant = new KittyAssistant();
