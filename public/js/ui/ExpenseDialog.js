/**
 * Modal `<dialog>` for create/edit expense; reads/writes form fields and `#expense-form` dataset.
 */

import { $ } from '../lib/dom.js';
import { yyyyMmDd } from '../lib/dateMoney.js';
import { state } from '../state.js';

const CATEGORY_KEYWORDS = {
  Food: ['coffee', 'cafe', 'lunch', 'dinner', 'breakfast', 'grocery', 'groceries', 'restaurant', 'meal', 'food'],
  Transport: ['uber', 'train', 'metro', 'bus', 'taxi', 'fuel', 'parking', 'transport'],
  Rent: ['rent', 'lease'],
  Utilities: ['electricity', 'water', 'gas', 'internet', 'phone', 'bill', 'utility'],
  Entertainment: ['movie', 'cinema', 'game', 'netflix', 'spotify', 'concert'],
  Health: ['pharmacy', 'doctor', 'medicine', 'health', 'dental', 'clinic'],
  Education: ['course', 'book', 'tuition', 'school', 'education', 'class'],
  Shopping: ['shopping', 'clothes', 'shoes', 'sneaker', 'amazon', 'target', 'kmart']
};

function categoryByName(name) {
  return state.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

function guessCategory(text) {
  const haystack = text.toLowerCase();
  for (const c of state.categories) {
    if (haystack.includes(c.name.toLowerCase())) return c;
  }
  for (const [name, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((word) => haystack.includes(word))) return categoryByName(name);
  }
  return null;
}

function categoryGuesses(text) {
  const haystack = text.toLowerCase();
  const matches = [];
  for (const c of state.categories) {
    let score = haystack.includes(c.name.toLowerCase()) ? 4 : 0;
    const words = CATEGORY_KEYWORDS[c.name] || [];
    score += words.filter((word) => haystack.includes(word)).length * 2;
    if (score > 0) matches.push({ category: c, score });
  }
  return matches
    .sort((a, b) => b.score - a.score || a.category.name.localeCompare(b.category.name))
    .slice(0, 3)
    .map((x) => x.category);
}

function guessAmount(text) {
  const match = text.match(/(?:\$|aud\s*)?(\d+(?:\.\d{1,2})?)/i);
  return match ? Number(match[1]) : null;
}

function guessDate(text) {
  const haystack = text.toLowerCase();
  const d = new Date();
  if (haystack.includes('yesterday')) {
    d.setDate(d.getDate() - 1);
    return yyyyMmDd(d);
  }
  if (haystack.includes('today')) return yyyyMmDd(d);
  const iso = haystack.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return iso ? iso[1] : null;
}

export class ExpenseDialog {
  constructor() {
    this._dialog = /** @type {HTMLDialogElement|null} */ (document.querySelector('#expense-dialog'));
    this._form = /** @type {HTMLFormElement|null} */ (document.querySelector('#expense-form'));
    this._receiptDataUrl = '';
    this._receiptName = '';
  }

  open(mode, existing, preferredType = 'expense') {
    const recordType = existing?.type || preferredType || 'expense';
    if (recordType === 'expense' && !state.categories.length) {
      location.hash = '#query';
      return { ok: false, reason: 'no_categories' };
    }
    $('#expense-form-error').hidden = true;

    const title = mode === 'edit'
      ? `Edit ${recordType === 'income' ? 'income' : 'expense'}`
      : `Add ${recordType === 'income' ? 'income' : 'expense'}`;
    $('#expense-dialog-title').textContent = title;

    this._form.dataset.mode = mode;
    this._form.dataset.id = existing?.id ? String(existing.id) : '';

    $('#f-title').value = existing?.title || '';
    $('#f-amount').value =
      existing?.amountCents != null
        ? (Number(existing.amountCents) / 100).toFixed(2)
        : '';
    $('#f-date').value = existing?.date || yyyyMmDd(new Date());
    $('#f-description').value = existing?.description || '';
    this.setRecordType(recordType);
    this._receiptDataUrl = existing?.receiptDataUrl || '';
    this._receiptName = existing?.receiptName || '';
    const receiptInput = $('#f-receipt');
    if (receiptInput) receiptInput.value = '';
    const receiptFileName = $('#receipt-file-name');
    if (receiptFileName) {
      receiptFileName.textContent = this._receiptName || 'No receipt selected';
    }
    this.renderReceiptPreview();

    const catId =
      existing?.categoryId != null
        ? String(existing.categoryId)
        : state.categories[0]?.id
          ? String(state.categories[0].id)
          : '';
    $('#f-category').value = catId;
    $('#expense-smart').hidden = mode === 'edit' || recordType === 'income';
    $('#expense-smart-text').textContent = 'Type a title or notes, then RosyLedger can infer category, amount, or date.';
    $('#expense-smart-chips').innerHTML = '';

    const emotion = existing?.emotionTag || '';
    document.querySelectorAll('input[name="emotionTag"]').forEach((el) => {
      el.checked = el.value === emotion || (!emotion && el.value === '');
    });
    const emotionField = $('#expense-emotion-field');
    if (emotionField) emotionField.hidden = recordType === 'income';

    this._dialog.showModal();
    setTimeout(() => $('#f-title').focus(), 0);
    return { ok: true };
  }

  close() {
    this._dialog?.close();
  }

  getModeAndId() {
    return {
      mode: this._form.dataset.mode || 'add',
      id: this._form.dataset.id
    };
  }

  readPayload() {
    const type = this._form.dataset.type || 'expense';
    const emotionEl = document.querySelector('input[name="emotionTag"]:checked');
    const emotionVal = emotionEl?.value?.trim();
    return {
      type,
      title: $('#f-title').value.trim(),
      amount: Number($('#f-amount').value),
      date: $('#f-date').value,
      categoryId: type === 'income' ? null : String($('#f-category').value),
      description: $('#f-description').value.trim(),
      emotionTag: type === 'expense' && emotionVal ? emotionVal : null,
      receiptDataUrl: type === 'income' ? null : this._receiptDataUrl || null,
      receiptName: type === 'income' ? '' : this._receiptName || ''
    };
  }

  setRecordType(type) {
    const normalized = type === 'income' ? 'income' : 'expense';
    this._form.dataset.type = normalized;
    $('#btn-record-expense')?.classList.toggle('is-active', normalized === 'expense');
    $('#btn-record-income')?.classList.toggle('is-active', normalized === 'income');
    const categoryField = $('#expense-category-field');
    const receiptField = $('#expense-receipt-field');
    if (categoryField) categoryField.hidden = normalized === 'income';
    if (receiptField) receiptField.hidden = normalized === 'income';
    const emotionField = $('#expense-emotion-field');
    if (emotionField) emotionField.hidden = normalized === 'income';
    const category = $('#f-category');
    if (category) category.required = normalized === 'expense';
    if (normalized === 'income') {
      this.clearReceipt();
      $('#expense-smart').hidden = true;
      $('#expense-dialog-subtitle').textContent = 'Income record';
    } else {
      $('#expense-dialog-subtitle').textContent = 'Private ledger entry';
    }
  }

  setReceipt(dataUrl, name) {
    this._receiptDataUrl = dataUrl || '';
    this._receiptName = name || '';
    const receiptFileName = $('#receipt-file-name');
    if (receiptFileName) {
      receiptFileName.textContent = this._receiptName || 'No receipt selected';
    }
    this.renderReceiptPreview();
  }

  clearReceipt() {
    this.setReceipt('', '');
    const input = $('#f-receipt');
    if (input) input.value = '';
  }

  renderReceiptPreview() {
    const wrap = $('#receipt-preview');
    const img = $('#receipt-preview-img');
    if (!wrap || !img) return;
    if (!this._receiptDataUrl) {
      wrap.hidden = true;
      img.removeAttribute('src');
      return;
    }
    img.src = this._receiptDataUrl;
    wrap.hidden = false;
  }

  applyTemplate(template) {
    const templates = {
      coffee: {
        title: 'Coffee',
        amount: '5.50',
        category: 'Food',
        description: 'Quick add coffee'
      },
      groceries: {
        title: 'Groceries',
        amount: '74.25',
        category: 'Food',
        description: 'Weekly groceries'
      },
      uber: {
        title: 'Uber ride',
        amount: '18.00',
        category: 'Transport',
        description: 'Quick add transport'
      }
    };
    const item = templates[template];
    if (!item) return;
    $('#f-title').value = item.title;
    $('#f-amount').value = item.amount;
    $('#f-date').value = yyyyMmDd(new Date());
    $('#f-description').value = item.description;
    const category = categoryByName(item.category);
    if (category) $('#f-category').value = String(category.id);
    this.showTemplateApplied(item.title, category?.name || item.category);
  }

  applyTemplateObject(item) {
    $('#f-title').value = item.title || '';
    $('#f-amount').value =
      item.amountCents != null ? (Number(item.amountCents) / 100).toFixed(2) : '';
    $('#f-date').value = yyyyMmDd(new Date());
    $('#f-description').value = item.description || '';
    if (item.categoryId) $('#f-category').value = String(item.categoryId);
    this.showTemplateApplied(item.title || 'Template', item.categoryName || 'Selected category');
  }

  showTemplateApplied(title, categoryName) {
    $('#expense-smart').hidden = false;
    $('#expense-smart-text').textContent = `${title} template filled. Category: ${categoryName}.`;
    $('#expense-smart-chips').innerHTML = '';
  }

  applySmartRecognition({ force = false } = {}) {
    if ((this._form.dataset.type || 'expense') === 'income') return;
    const text = `${$('#f-title').value} ${$('#f-description').value}`.trim();
    const box = $('#expense-smart');
    const out = $('#expense-smart-text');
    const chips = $('#expense-smart-chips');
    if (!text) {
      box.hidden = false;
      out.textContent = 'Type a title or notes, then RosyLedger can infer category, amount, or date.';
      chips.innerHTML = '';
      return;
    }
    const updates = [];
    const guesses = categoryGuesses(text);
    const category = guesses[0] || guessCategory(text);
    if (category && (force || $('#f-category').value !== String(category.id))) {
      $('#f-category').value = String(category.id);
      updates.push(`category: ${category.name}`);
    }
    const amount = guessAmount(text);
    if (amount && (force || !$('#f-amount').value)) {
      $('#f-amount').value = amount.toFixed(2);
      updates.push(`amount: $${amount.toFixed(2)}`);
    }
    const date = guessDate(text);
    if (date && (force || !$('#f-date').value)) {
      $('#f-date').value = date;
      updates.push(`date: ${date}`);
    }
    box.hidden = false;
    chips.innerHTML = guesses
      .map(
        (c, i) =>
          `<button class="smart-chip" type="button" data-smart-category="${c.id}">${i === 0 ? 'Best' : 'Option'}: ${c.name}</button>`
      )
      .join('');
    out.textContent = updates.length
      ? `Recognized ${updates.join(', ')}.`
      : 'No confident match yet. Try words like coffee, rent, uber, pharmacy, or today.';
  }

  applySuggestedCategory(categoryId) {
    if (!categoryId) return;
    $('#f-category').value = String(categoryId);
    const category = state.categories.find((c) => String(c.id) === String(categoryId));
    $('#expense-smart').hidden = false;
    $('#expense-smart-text').textContent = category
      ? `Applied predicted category: ${category.name}.`
      : 'Applied predicted category.';
  }
}

export const expenseDialog = new ExpenseDialog();
