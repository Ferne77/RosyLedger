/**
 * Expense table: fetch with query params, render rows, delegate save/delete to API.
 * After each successful list load, refreshes dashboard stats for the report month.
 */

import { api, getToken } from '../lib/api.js';
import { $, escapeHtml, toast } from '../lib/dom.js';
import { moneyFromCents, yyyyMm } from '../lib/dateMoney.js';
import { state } from '../state.js';
import { expenseDialog } from '../ui/ExpenseDialog.js';
import { makeClientId, queueDraft } from '../lib/offlineQueue.js';
import { refreshStats } from './statsView.js';

export class ExpensesView {
  expenseRowHtml(e) {
    const isIncome = e.type === 'income';
    const amountText = `${isIncome ? '+' : '-'}${moneyFromCents(e.amountCents)}`;
    return `
    <tr class="${isIncome ? 'row-income' : ''}">
      <td>${escapeHtml(e.date)}</td>
      <td>
        <div class="cell-title">${escapeHtml(e.title)}</div>
        ${
          e.description
            ? `<div class="row-note">${escapeHtml(e.description)}</div>`
            : ''
        }
        ${
          e.receiptDataUrl
            ? `<button type="button" class="receipt-badge" data-receipt="${e.id}">Receipt attached</button>`
            : ''
        }
      </td>
      <td><span class="tag ${isIncome ? 'tag--income' : ''}">${escapeHtml(isIncome ? 'Income' : e.categoryName)}</span></td>
      <td class="right amt ${isIncome ? 'amt--income' : 'amt--expense'}">${amountText}</td>
      <td class="right">
        <div class="table-actions">
          <button type="button" class="btn-icon-t" data-edit="${e.id}" aria-label="Edit">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button type="button" class="btn-icon-t btn-icon-t--danger" data-del="${e.id}" aria-label="Delete">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `;
  }

  render() {
    const tbody = $('#expenses-tbody');
    tbody.innerHTML = state.expenses.map((e) => this.expenseRowHtml(e)).join('');
    $('#expenses-empty').hidden = state.expenses.length !== 0;
    $('#kpi-items').textContent = String(state.expenses.length);
    const receiptCount = state.expenses.filter((e) => e.receiptDataUrl).length;
    const receiptEl = $('#overview-receipt-count');
    if (receiptEl) {
      receiptEl.textContent = `${receiptCount} attached`;
    }
    const nextStep = $('#overview-next-step');
    if (nextStep) {
      nextStep.textContent = state.expenses.length
        ? 'Review smart suggestions'
        : 'Add your first expense';
    }
    document.dispatchEvent(new CustomEvent('rosyledger:expenses-rendered'));
  }

  async refresh() {
    if (!getToken()) return;
    $('#expenses-error').hidden = true;

    state.filters.month = $('#ledger-month').value || '';

    const qs = new URLSearchParams();
    if (state.filters.month) qs.set('month', state.filters.month);
    if (state.filters.categoryId) qs.set('categoryId', state.filters.categoryId);
    if (state.filters.q) qs.set('q', state.filters.q);

    try {
      const data = await api(`/api/expenses?${qs.toString()}`);
      state.expenses = data.items || [];
      this.render();
      const chartMonth = $('#filter-month').value || yyyyMm(new Date());
      await refreshStats(chartMonth);
    } catch (e) {
      const box = $('#expenses-error');
      box.textContent = e.message;
      box.hidden = false;
    }
  }

  openDialog(mode, existing, preferredType = 'expense') {
    const r = expenseDialog.open(mode, existing, preferredType);
    if (r && r.ok === false && r.reason === 'no_categories') {
      toast('Categories unavailable — check DB connection or restart the server.');
    }
  }

  async handleSave(e) {
    e.preventDefault();
    $('#expense-form-error').hidden = true;

    const { mode, id } = expenseDialog.getModeAndId();
    const body = expenseDialog.readPayload();

    if (!navigator.onLine && mode !== 'edit') {
      await queueDraft({ ...body, clientId: makeClientId() });
      expenseDialog.close();
      toast('Saved offline — will sync when you reconnect');
      return;
    }

    try {
      if (mode === 'edit' && id) {
        await api(`/api/expenses/${id}`, { method: 'PUT', body });
        toast(body.type === 'income' ? 'Income updated' : 'Expense updated');
      } else {
        const res = await api('/api/expenses', { method: 'POST', body });
        toast(body.type === 'income' ? 'Income added' : 'Expense added');
        if (res?.newAchievements?.length) {
          const { companionViews } = await import('./companionViews.js');
          companionViews.handleNewAchievements(res.newAchievements);
        }
      }
      expenseDialog.close();
      await this.refresh();
    } catch (err) {
      const box = $('#expense-form-error');
      box.textContent = err.message;
      box.hidden = false;
    }
  }

  async handleDelete(id) {
    if (!confirm('Delete this record?')) return;
    try {
      await api(`/api/expenses/${id}`, { method: 'DELETE' });
      toast('Deleted');
      await this.refresh();
    } catch (e) {
      toast(e.message);
    }
  }
}

export const expensesView = new ExpensesView();

export const refreshExpenses = () => expensesView.refresh();
export const openExpenseDialog = (mode, existing, preferredType) =>
  expensesView.openDialog(mode, existing, preferredType);
export const handleSaveExpense = (e) => expensesView.handleSave(e);
export const handleDeleteExpense = (id) => expensesView.handleDelete(id);
