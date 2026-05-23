import { api } from '../lib/api.js';
import { $, escapeHtml, toast } from '../lib/dom.js';
import { moneyFromCents, yyyyMm } from '../lib/dateMoney.js';
import { state } from '../state.js';
import { refreshStats } from './statsView.js';
import { updatePlanningSummaries } from '../lib/planningAccordion.js';

export class BudgetBoardView {
  constructor() {
    this._allocations = new Map();
    this._poolCents = 0;
    this._selectedId = '';
    this._wired = false;
  }

  setPoolFromInputs() {
    const budget = Number($('#budget-amount')?.value || 0);
    this._poolCents = Math.round(Math.max(0, budget) * 100);
    this.render();
  }

  loadFromBudget(budget) {
    this._allocations = new Map();
    const map = budget?.categoryBudgets || {};
    Object.entries(map).forEach(([id, cents]) => {
      this._allocations.set(String(id), Number(cents || 0));
    });
    if (!this._selectedId && state.categories.length) {
      this._selectedId = String(state.categories[0].id);
    }
    this.render();
  }

  _categoryName(id) {
    return state.categories.find((c) => String(c.id) === String(id))?.name || 'Category';
  }

  _allocatedTotal(excludeId = '') {
    let total = 0;
    this._allocations.forEach((cents, id) => {
      if (String(id) !== String(excludeId)) total += cents;
    });
    return total;
  }

  _remainingFor(excludeId = '') {
    return Math.max(0, this._poolCents - this._allocatedTotal(excludeId));
  }

  _syncAmountInput() {
    const input = $('#budget-board-amount');
    const select = $('#budget-board-category');
    if (!input || !select) return;
    const id = select.value || this._selectedId;
    const cents = this._allocations.get(String(id)) || 0;
    input.value = cents ? (cents / 100).toFixed(2) : '';
  }

  _updatePreview() {
    const select = $('#budget-board-category');
    const amountInput = $('#budget-board-amount');
    const label = $('#budget-board-preview-label');
    const value = $('#budget-board-preview-value');
    const fill = $('#budget-board-preview-fill');
    const hint = $('#budget-board-preview-hint');
    if (!select || !amountInput) return;

    const id = select.value;
    const name = id ? this._categoryName(id) : 'Choose a category';
    const draftCents = Math.round(Number(amountInput.value || 0) * 100);
    const pct = this._poolCents ? Math.min(100, Math.round((draftCents / this._poolCents) * 100)) : 0;
    const maxAllowed = this._remainingFor(id) + (this._allocations.get(String(id)) || 0);

    if (label) label.textContent = name;
    if (value) value.textContent = moneyFromCents(draftCents);
    if (fill) fill.style.width = `${pct}%`;
    if (hint) {
      hint.textContent = this._poolCents
        ? `${pct}% of pool · up to ${moneyFromCents(maxAllowed)} available`
        : 'Set a monthly budget in step 1 first';
    }
  }

  renderSummary() {
    const allocated = this._allocatedTotal();
    const remaining = Math.max(0, this._poolCents - allocated);
    const allocatedCount = [...this._allocations.values()].filter((cents) => cents > 0).length;
    $('#budget-board-pool').textContent = moneyFromCents(this._poolCents);
    $('#budget-board-remaining').textContent = moneyFromCents(remaining);
    updatePlanningSummaries({
      month: $('#filter-month')?.value || yyyyMm(new Date()),
      budgetCents: this._poolCents,
      goalPercent: Number($('#goal-percent')?.value || 0),
      allocatedCount,
      poolCents: this._poolCents,
      remainingCents: remaining
    });
  }

  renderChips() {
    const box = $('#budget-board-chips');
    if (!box) return;
    const items = state.categories
      .map((cat) => {
        const cents = this._allocations.get(String(cat.id)) || 0;
        if (!cents) return '';
        const isActive = String(cat.id) === String(this._selectedId);
        return `
          <button
            type="button"
            class="budget-board-chip${isActive ? ' is-active' : ''}"
            data-board-chip="${cat.id}"
          >
            <span>${escapeHtml(cat.name)}</span>
            <strong>${moneyFromCents(cents)}</strong>
          </button>
        `;
      })
      .filter(Boolean);

    box.innerHTML = items.length
      ? items.join('')
      : '<span class="budget-board-chips__empty">No categories allocated yet</span>';
  }

  renderSelect() {
    const select = $('#budget-board-category');
    if (!select) return;
    select.innerHTML = state.categories.length
      ? state.categories
          .map(
            (cat) =>
              `<option value="${cat.id}"${String(cat.id) === String(this._selectedId) ? ' selected' : ''}>${escapeHtml(cat.name)}</option>`
          )
          .join('')
      : '<option value="" disabled selected>No categories</option>';
    if (state.categories.length && !this._selectedId) {
      this._selectedId = String(state.categories[0].id);
      select.value = this._selectedId;
    }
  }

  render() {
    this.renderSelect();
    this.renderSummary();
    this.renderChips();
    this._syncAmountInput();
    this._updatePreview();
  }

  applyCurrent() {
    const select = $('#budget-board-category');
    const amountInput = $('#budget-board-amount');
    if (!select?.value) {
      toast('Choose a category first');
      return;
    }
    const id = String(select.value);
    let cents = Math.round(Number(amountInput.value || 0) * 100);
    const maxAllowed = this._remainingFor(id) + (this._allocations.get(id) || 0);
    if (cents > maxAllowed) {
      cents = maxAllowed;
      amountInput.value = cents ? (cents / 100).toFixed(2) : '';
      toast(`Capped at ${moneyFromCents(cents)} — pool limit reached`);
    }
    if (cents <= 0) {
      this._allocations.delete(id);
    } else {
      this._allocations.set(id, cents);
    }
    this._selectedId = id;
    this.render();
    toast(`${this._categoryName(id)} updated`);
  }

  adjustAmount(deltaCents) {
    const amountInput = $('#budget-board-amount');
    if (!amountInput) return;
    const current = Math.round(Number(amountInput.value || 0) * 100);
    amountInput.value = Math.max(0, current + deltaCents) / 100;
    this._updatePreview();
  }

  selectCategory(id) {
    this._selectedId = String(id);
    const select = $('#budget-board-category');
    if (select) select.value = this._selectedId;
    this.renderChips();
    this._syncAmountInput();
    this._updatePreview();
  }

  wireEvents() {
    if (this._wired) return;
    this._wired = true;

    $('#budget-board-category')?.addEventListener('change', (e) => {
      this._selectedId = e.target.value;
      this.renderChips();
      this._syncAmountInput();
      this._updatePreview();
    });

    $('#budget-board-amount')?.addEventListener('input', () => this._updatePreview());

    $('#budget-board-minus')?.addEventListener('click', () => this.adjustAmount(-500));
    $('#budget-board-plus')?.addEventListener('click', () => this.adjustAmount(500));

    $('#btn-apply-budget-board')?.addEventListener('click', () => this.applyCurrent());

    $('#budget-board-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-board-chip]');
      if (!chip) return;
      this.selectCategory(chip.dataset.boardChip);
    });

    $('#btn-save-budget-board')?.addEventListener('click', () => this.save());
    $('#budget-amount')?.addEventListener('input', () => this.setPoolFromInputs());
  }

  async save() {
    const month = $('#filter-month')?.value || yyyyMm(new Date());
    const allocations = {};
    this._allocations.forEach((cents, id) => {
      allocations[id] = cents / 100;
    });
    await api('/api/budget/categories/batch', {
      method: 'PUT',
      body: { month, allocations }
    });
    await refreshStats(month);
    toast('Category budgets saved');
  }
}

export const budgetBoardView = new BudgetBoardView();
