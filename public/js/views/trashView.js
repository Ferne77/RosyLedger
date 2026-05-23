import { api, getToken } from '../lib/api.js';
import { $, escapeHtml, toast } from '../lib/dom.js';
import { moneyFromCents } from '../lib/dateMoney.js';
import { refreshExpenses } from './expensesView.js';

export class TrashView {
  async refresh() {
    if (!getToken()) return;
    const box = $('#trash-error');
    if (box) box.hidden = true;
    try {
      const data = await api('/api/expenses/trash');
      this.render(data.items || []);
    } catch (err) {
      if (box) {
        box.textContent = err.message;
        box.hidden = false;
      }
    }
  }

  render(items) {
    const list = $('#trash-list');
    const empty = $('#trash-empty');
    if (!list) return;
    list.innerHTML = items
      .map(
        (x) => `
          <div class="trash-row">
            <div>
              <strong>${escapeHtml(x.title)}</strong>
              <span>${escapeHtml(x.date)} · ${x.type === 'income' ? 'Income' : escapeHtml(x.categoryName || 'Expense')}</span>
            </div>
            <div class="trash-row__actions">
              <span>${x.type === 'income' ? '+' : '-'}${moneyFromCents(x.amountCents)}</span>
              <button class="btn btn--ghost" type="button" data-restore="${x.id}">Restore</button>
              <button class="btn danger" type="button" data-purge="${x.id}">Delete forever</button>
            </div>
          </div>
        `
      )
      .join('');
    if (empty) empty.hidden = items.length > 0;
    const count = $('#trash-count');
    if (count) count.textContent = `${items.length} item(s)`;
  }

  async restore(id) {
    await api(`/api/expenses/${id}/restore`, { method: 'POST' });
    toast('Record restored');
    await this.refresh();
    await refreshExpenses();
  }

  async purge(id) {
    if (!confirm('Permanently delete this record?')) return;
    await api(`/api/expenses/${id}/permanent`, { method: 'DELETE' });
    toast('Record permanently deleted');
    await this.refresh();
  }
}

export const trashView = new TrashView();
