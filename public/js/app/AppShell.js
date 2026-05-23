/**
 * Wires DOM events to views: report month, trend range, ledger filters, expense dialog.
 * Initializes default month inputs and loads categories + first expense/stats fetch.
 */

import { $, escapeHtml, toast } from '../lib/dom.js';
import { api, getToken, setToken } from '../lib/api.js';
import { exportStatementImage } from '../lib/statementImage.js';
import { yyyyMm } from '../lib/dateMoney.js';
import { state } from '../state.js';
import { refreshCategories } from '../views/categoriesView.js';
import { expenseDialog } from '../ui/ExpenseDialog.js';
import {
  handleDeleteExpense,
  handleSaveExpense,
  openExpenseDialog,
  refreshExpenses
} from '../views/expensesView.js';
import { refreshStats, statsView } from '../views/statsView.js';
import { startRealtime, stopRealtime } from '../lib/realtime.js';
import { flushDrafts, registerOfflineSync } from '../lib/offlineQueue.js';
import { analyticsView } from '../views/analyticsView.js';
import { trashView } from '../views/trashView.js';
import { budgetBoardView } from '../views/budgetBoardView.js';
import { initPlanningAccordion, openPlanningStep } from '../lib/planningAccordion.js';
import { refreshView, refreshVisibleViews } from '../lib/viewRefresh.js';
import { companionViews } from '../views/companionViews.js';
import { moodCheckin } from '../ui/MoodCheckin.js';
import { kittyAssistant } from '../ui/KittyAssistant.js';

export class AppShell {
  constructor() {
    this._searchDebounce = null;
    this._authMode = 'login';
  }

  wireEvents() {
    $('#auth-form').addEventListener('submit', (e) =>
      this.handleAuth(e, this._authMode)
    );
    $('#btn-register').addEventListener('click', () =>
      this.setAuthMode(this._authMode === 'login' ? 'register' : 'login')
    );
    $('#btn-logout').addEventListener('click', () => this.logout());
    $('#btn-account').addEventListener('click', () => this.showSettings());
    $('#btn-settings-save-username').addEventListener('click', () => this.saveSettingsUsername());
    $('#btn-settings-save-password').addEventListener('click', () => this.saveSettingsPassword());
    $('#btn-settings-delete-account').addEventListener('click', () => this.deleteAccount());
    $('#btn-settings-save-budget').addEventListener('click', () => this.saveSettingsBudget());
    $('#btn-settings-save-goal').addEventListener('click', () => this.saveSettingsGoal());
    $('#btn-settings-save-category-budget').addEventListener('click', () =>
      this.saveSettingsCategoryBudget()
    );
    $('#btn-settings-save-template').addEventListener('click', () => this.saveSettingsTemplate());
    $('#btn-settings-export').addEventListener('click', () => this.exportData());
    $('#btn-settings-logout').addEventListener('click', () => this.logout());
    $('#btn-close-account-dialog').addEventListener('click', () => $('#account-dialog').close());
    $('#btn-save-username').addEventListener('click', () => this.saveUsername());
    $('#btn-save-password').addEventListener('click', () => this.savePassword());
    $('#btn-delete-account').addEventListener('click', () => this.deleteAccount());
    $('#btn-export-data').addEventListener('click', () => this.exportData());
    $('#btn-save-budget').addEventListener('click', () => this.saveBudget());
    $('#btn-save-goal').addEventListener('click', () => this.saveGoal());
    $('#btn-save-template').addEventListener('click', () => this.saveTemplate());
    $('#btn-category-scope-all').addEventListener('click', () => {
      statsView.setCategoryScope('all');
      statsView.renderCategoryFromCache();
    });
    $('#btn-category-scope-month').addEventListener('click', () => {
      statsView.setCategoryScope('month');
      statsView.renderCategoryFromCache();
    });
    document.querySelectorAll('[data-trend-months]').forEach((btn) => {
      btn.addEventListener('click', () => this.setTrendRange(Number(btn.dataset.trendMonths)));
    });

    $('#btn-add-expense').addEventListener('click', () =>
      openExpenseDialog('add', null, 'expense')
    );
    $('#btn-add-income').addEventListener('click', () =>
      openExpenseDialog('add', null, 'income')
    );
    document.addEventListener('click', (e) => {
      const templateBtn = e.target.closest('[data-template]');
      if (templateBtn) {
        openExpenseDialog('add');
        expenseDialog.applyTemplate(templateBtn.dataset.template);
        toast(`${templateBtn.textContent.trim().replace(/\s+/g, ' ')} filled in`);
      }
    });
    $('#custom-template-list').addEventListener('click', async (e) => {
      const useBtn = e.target.closest('[data-custom-template]');
      const delBtn = e.target.closest('[data-delete-template]');
      if (useBtn) {
        const item = state.templates.find((x) => String(x.id) === String(useBtn.dataset.customTemplate));
        if (item) {
          openExpenseDialog('add');
          expenseDialog.applyTemplateObject(item);
        }
      }
      if (delBtn) {
        await this.deleteTemplate(delBtn.dataset.deleteTemplate);
      }
    });
    $('#settings-custom-template-list').addEventListener('click', async (e) => {
      const useBtn = e.target.closest('[data-custom-template]');
      const delBtn = e.target.closest('[data-delete-template]');
      if (useBtn) {
        const item = state.templates.find((x) => String(x.id) === String(useBtn.dataset.customTemplate));
        if (item) {
          this._showView?.('query');
          openExpenseDialog('add');
          expenseDialog.applyTemplateObject(item);
        }
      }
      if (delBtn) {
        await this.deleteTemplate(delBtn.dataset.deleteTemplate);
      }
    });

    $('#expense-form').addEventListener('submit', handleSaveExpense);
    $('#f-title').addEventListener('input', () =>
      expenseDialog.applySmartRecognition()
    );
    $('#f-description').addEventListener('input', () =>
      expenseDialog.applySmartRecognition()
    );
    $('#btn-smart-recognize').addEventListener('click', () =>
      expenseDialog.applySmartRecognition({ force: true })
    );
    $('#f-receipt').addEventListener('change', (e) => this.handleReceiptFile(e));
    $('#btn-clear-receipt').addEventListener('click', () => expenseDialog.clearReceipt());
    $('#btn-record-expense').addEventListener('click', () => expenseDialog.setRecordType('expense'));
    $('#btn-record-income').addEventListener('click', () => expenseDialog.setRecordType('income'));
    $('#expense-smart-chips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-smart-category]');
      if (!btn) return;
      expenseDialog.applySuggestedCategory(btn.dataset.smartCategory);
    });

    $('#btn-close-expense-dialog').addEventListener('click', () =>
      expenseDialog.close()
    );
    $('#btn-expense-cancel').addEventListener('click', () => expenseDialog.close());

    $('#btn-clear-filters').addEventListener('click', () => {
      state.filters.categoryId = '';
      state.filters.q = '';
      state.filters.month = '';
      $('#ledger-month').value = '';
      $('#filter-category').value = '';
      $('#filter-q').value = '';
      refreshExpenses();
    });

    $('#trash-list')?.addEventListener('click', async (e) => {
      const restoreBtn = e.target.closest('[data-restore]');
      const purgeBtn = e.target.closest('[data-purge]');
      if (restoreBtn) await trashView.restore(restoreBtn.dataset.restore);
      if (purgeBtn) await trashView.purge(purgeBtn.dataset.purge);
    });
    budgetBoardView.wireEvents();
    initPlanningAccordion();

    $('#filter-month').addEventListener('change', async () => {
      await refreshVisibleViews();
    });

    const onTrendRangeChange = () => {
      const m = $('#filter-month').value || yyyyMm(new Date());
      refreshStats(m);
    };
    $('#trend-start-month').addEventListener('change', onTrendRangeChange);
    $('#trend-end-month').addEventListener('change', onTrendRangeChange);
    $('#btn-trend-mode-cumulative').addEventListener('click', () => {
      statsView.setTrendMode('cumulative');
      if (!statsView.renderTrendFromCache()) onTrendRangeChange();
    });
    $('#btn-trend-mode-monthly').addEventListener('click', () => {
      statsView.setTrendMode('monthly');
      if (!statsView.renderTrendFromCache()) onTrendRangeChange();
    });

    $('#ledger-month').addEventListener('change', () => refreshExpenses());

    $('#filter-category').addEventListener('change', (e) => {
      state.filters.categoryId = e.target.value || '';
      refreshExpenses();
    });
    $('#filter-q').addEventListener('input', (e) => {
      state.filters.q = e.target.value || '';
      clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => refreshExpenses(), 250);
    });

    $('#expenses-tbody').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const editId = btn.getAttribute('data-edit');
      const delId = btn.getAttribute('data-del');
      const receiptId = btn.getAttribute('data-receipt');
      if (editId) {
        const item = state.expenses.find((x) => String(x.id) === String(editId));
        openExpenseDialog('edit', item);
      }
      if (delId) {
        await handleDeleteExpense(delId);
      }
      if (receiptId) {
        const item = state.expenses.find((x) => String(x.id) === String(receiptId));
        if (item?.receiptDataUrl) window.open(item.receiptDataUrl, '_blank');
      }
    });
    document.addEventListener('rosyledger:expenses-rendered', () =>
      this.renderReceiptGallery()
    );

    this.setupSectionNavigation();
  }

  setupSectionNavigation() {
    const links = Array.from(document.querySelectorAll('[data-section-link]'));
    const views = Array.from(document.querySelectorAll('[data-app-view]'));
    const viewIds = new Set(views.map((view) => view.dataset.appView));

    const showView = (id, { scrollTop = true } = {}) => {
      const targetId = viewIds.has(id) ? id : 'overview';
      links.forEach((link) =>
        link.classList.toggle('is-active', link.dataset.sectionLink === targetId)
      );
      views.forEach((view) => {
        view.hidden = view.dataset.appView !== targetId;
      });
      if (location.hash !== `#${targetId}`) {
        history.replaceState(null, '', `#${targetId}`);
      }
      if (scrollTop) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      if (targetId === 'settings') {
        this.syncSettingsPage();
      }
      refreshView(targetId);
    };

    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        showView(link.dataset.sectionLink);
      });
    });

    window.addEventListener('hashchange', () => {
      const id = location.hash.replace(/^#/, '');
      if (viewIds.has(id)) showView(id, { scrollTop: false });
    });

    const initial = location.hash.replace(/^#/, '');
    showView(viewIds.has(initial) ? initial : 'overview', { scrollTop: false });
    this._showView = showView;
  }

  _setSession(active) {
    document.documentElement.dataset.session = active ? 'in' : 'out';
  }

  showAuth() {
    this._setSession(false);
    $('#auth-screen').hidden = false;
    $('#app-shell').hidden = true;
    $('#auth-password').value = '';
    $('#auth-confirm-password').value = '';
    this.setAuthMode('login');
    if (location.hash) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
    setTimeout(() => $('#auth-username').focus(), 0);
  }

  setAuthMode(mode) {
    this._authMode = mode === 'register' ? 'register' : 'login';
    const isRegister = this._authMode === 'register';
    $('#auth-title').textContent = isRegister ? 'Create account' : 'Welcome back';
    $('#auth-copy').textContent = isRegister
      ? 'Create a private ledger account with your own categories, budget, and suggestions.'
      : 'Sign in to keep your ledger, budget, and smart suggestions private.';
    $('#btn-auth-submit').textContent = isRegister ? 'Create account' : 'Login';
    $('#btn-register').textContent = isRegister ? 'Back to login' : 'Create account';
    $('#auth-confirm-wrap').hidden = !isRegister;
    $('#auth-confirm-password').required = isRegister;
    $('#auth-password').autocomplete = isRegister ? 'new-password' : 'current-password';
    $('#auth-error').hidden = true;
  }

  async showApp() {
    this._setSession(true);
    $('#auth-screen').hidden = true;
    $('#app-shell').hidden = false;
    this.renderUserIdentity();
    startRealtime();
    await companionViews.onLogin();
    await kittyAssistant.onLogin();
    const moodShown = await moodCheckin.maybeShow();
    if (!moodShown) {
      /* login bubble handled by kittyAssistant */
    }
  }

  renderUserIdentity() {
    const username = state.user?.username || 'Signed in';
    const safeUsername = escapeHtml(username);
    $('#nav-user').innerHTML = `
      <span class="nav-user__avatar">${escapeHtml(username.slice(0, 1).toUpperCase())}</span>
      <span>
        <span class="nav-user__hello">Welcome back</span>
        <span class="nav-user__name">${safeUsername}</span>
      </span>
    `;
    const settingsSummary = $('#settings-account-summary');
    const settingsAvatar = $('#settings-user-avatar');
    if (settingsSummary) settingsSummary.textContent = username;
    if (settingsAvatar) settingsAvatar.textContent = username.slice(0, 1).toUpperCase();
  }

  showSettings() {
    if ($('#app-shell').hidden) this.showApp();
    this._showView?.('settings');
  }

  syncSettingsPage() {
    const username = state.user?.username || 'Signed in';
    $('#settings-account-summary').textContent = username;
    $('#settings-user-avatar').textContent = username.slice(0, 1).toUpperCase();
    $('#settings-username').value = username;
    $('#settings-current-password').value = '';
    $('#settings-new-password').value = '';
    $('#settings-month').value = $('#filter-month').value || yyyyMm(new Date());
    $('#settings-budget-amount').value = $('#budget-amount').value || '';
    $('#settings-goal-percent').value = $('#goal-percent').value || '';
    this.populateSettingsCategorySelects();
    this.renderTemplates();
    $('#settings-error').hidden = true;
  }

  async handleAuth(e, mode) {
    e.preventDefault();
    const box = $('#auth-error');
    box.hidden = true;
    const username = $('#auth-username').value.trim();
    const password = $('#auth-password').value;
    const confirmPassword = $('#auth-confirm-password').value;
    if (mode === 'register' && password !== confirmPassword) {
      box.textContent = 'Passwords do not match';
      box.hidden = false;
      return;
    }
    try {
      const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const data = await api(path, {
        method: 'POST',
        body: { username, password },
        auth: false
      });
      setToken(data.token);
      state.user = data.user;
      await this.showApp();
      await this.initializeLedger();
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }

  logout() {
    stopRealtime();
    kittyAssistant.onLogout();
    setToken('');
    state.user = null;
    state.categories = [];
    state.expenses = [];
    $('#account-dialog')?.close();
    $('#expense-dialog')?.close();
    this.showAuth();
  }

  openAccountDialog() {
    $('#account-error').hidden = true;
    $('#account-dialog-subtitle').textContent = 'Private account';
    $('#account-username').value = state.user?.username || '';
    $('#account-current-password').value = '';
    $('#account-new-password').value = '';
    $('#account-dialog').showModal();
  }

  async saveUsername() {
    const box = $('#account-error');
    box.hidden = true;
    try {
      const username = $('#account-username').value.trim();
      const data = await api('/api/auth/username', { method: 'PUT', body: { username } });
      setToken(data.token);
      state.user = data.user;
      await this.showApp();
      $('#account-dialog-subtitle').textContent = 'Username updated';
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }

  async savePassword() {
    const box = $('#account-error');
    box.hidden = true;
    try {
      await api('/api/auth/password', {
        method: 'PUT',
        body: {
          currentPassword: $('#account-current-password').value,
          newPassword: $('#account-new-password').value
        }
      });
      $('#account-current-password').value = '';
      $('#account-new-password').value = '';
      $('#account-dialog-subtitle').textContent = 'Password updated';
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }

  async saveSettingsUsername() {
    const box = $('#settings-error');
    box.hidden = true;
    try {
      const username = $('#settings-username').value.trim();
      const data = await api('/api/auth/username', { method: 'PUT', body: { username } });
      setToken(data.token);
      state.user = data.user;
      this.renderUserIdentity();
      toast('Username updated');
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }

  async saveSettingsPassword() {
    const box = $('#settings-error');
    box.hidden = true;
    try {
      await api('/api/auth/password', {
        method: 'PUT',
        body: {
          currentPassword: $('#settings-current-password').value,
          newPassword: $('#settings-new-password').value
        }
      });
      $('#settings-current-password').value = '';
      $('#settings-new-password').value = '';
      toast('Password updated');
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }

  async deleteAccount() {
    const password = prompt('Type your password to delete this account and all its data.');
    if (!password) return;
    if (!confirm('Delete this account permanently?')) return;
    try {
      await api('/api/auth/account', { method: 'DELETE', body: { password } });
      this.logout();
    } catch (err) {
      const box = !$('#view-settings')?.hidden ? $('#settings-error') : $('#account-error');
      box.textContent = err.message;
      box.hidden = false;
    }
  }

  async saveBudget() {
    const month = $('#filter-month').value || yyyyMm(new Date());
    const amount = Number($('#budget-amount').value || 0);
    await api('/api/budget', { method: 'PUT', body: { month, amount } });
    await refreshStats(month);
    openPlanningStep(2);
    toast('Budget saved');
  }

  async saveGoal() {
    const month = $('#filter-month').value || yyyyMm(new Date());
    const percent = Number($('#goal-percent').value || 0);
    await api('/api/budget/goal', { method: 'PUT', body: { month, percent } });
    await refreshStats(month);
    openPlanningStep(3);
    toast('Spending goal saved');
  }

  async saveCategoryBudget() {
    const month = $('#filter-month').value || yyyyMm(new Date());
    const categoryId = $('#settings-category-budget-category')?.value;
    const amount = Number($('#settings-category-budget-amount')?.value || 0);
    if (!categoryId) {
      toast('Choose a category first');
      return;
    }
    await api('/api/budget/category', {
      method: 'PUT',
      body: { month, categoryId, amount }
    });
    await refreshStats(month);
    toast('Category budget saved');
  }

  async saveSettingsBudget() {
    $('#filter-month').value = $('#settings-month').value || yyyyMm(new Date());
    $('#budget-amount').value = $('#settings-budget-amount').value || '';
    await this.saveBudget();
  }

  async saveSettingsGoal() {
    $('#filter-month').value = $('#settings-month').value || yyyyMm(new Date());
    $('#goal-percent').value = $('#settings-goal-percent').value || '';
    await this.saveGoal();
  }

  async saveSettingsCategoryBudget() {
    $('#filter-month').value = $('#settings-month').value || yyyyMm(new Date());
    await this.saveCategoryBudget();
  }

  async refreshTemplates() {
    const data = await api('/api/templates');
    state.templates = data.items || [];
    this.renderTemplates();
  }

  renderTemplates() {
    const box = $('#custom-template-list');
    const settingsBox = $('#settings-custom-template-list');
    const html = state.templates.length
      ? state.templates
          .map(
            (t) => `
              <span class="custom-template-pill">
                <button type="button" data-custom-template="${t.id}">${escapeHtml(t.title)} · ${(Number(t.amountCents || 0) / 100).toFixed(2)}</button>
                <button type="button" aria-label="Delete template" data-delete-template="${t.id}">x</button>
              </span>
            `
          )
          .join('')
      : '';
    if (box) box.innerHTML = html;
    if (settingsBox) settingsBox.innerHTML = html;
    const summary = $('#settings-template-summary');
    if (summary) {
      summary.textContent = state.templates.length
        ? `${state.templates.length} custom template(s)`
        : 'No custom templates yet';
    }
  }

  async saveTemplate() {
    const title = $('#template-title').value.trim();
    const amount = Number($('#template-amount').value || 0);
    const categoryId = $('#template-category').value;
    if (!title || !amount || !categoryId) {
      toast('Add title, amount, and category for the template');
      return;
    }
    await api('/api/templates', {
      method: 'POST',
      body: { title, amount, categoryId, description: `Template: ${title}` }
    });
    $('#template-title').value = '';
    $('#template-amount').value = '';
    await this.refreshTemplates();
    toast('Template saved');
  }

  async saveSettingsTemplate() {
    const title = $('#settings-template-title').value.trim();
    const amount = Number($('#settings-template-amount').value || 0);
    const categoryId = $('#settings-template-category').value;
    if (!title || !amount || !categoryId) {
      toast('Add title, amount, and category for the template');
      return;
    }
    await api('/api/templates', {
      method: 'POST',
      body: { title, amount, categoryId, description: `Template: ${title}` }
    });
    $('#settings-template-title').value = '';
    $('#settings-template-amount').value = '';
    await this.refreshTemplates();
    toast('Template saved');
  }

  async deleteTemplate(id) {
    await api(`/api/templates/${id}`, { method: 'DELETE' });
    await this.refreshTemplates();
    toast('Template removed');
  }

  renderReceiptGallery() {
    const gallery = $('#receipt-gallery');
    const grid = $('#receipt-gallery-grid');
    if (!gallery || !grid) return;
    const receipts = state.expenses.filter((x) => x.receiptDataUrl);
    gallery.hidden = receipts.length === 0;
    grid.innerHTML = receipts
      .map(
        (x) => `
          <button class="receipt-thumb" type="button" data-receipt="${x.id}">
            <img src="${x.receiptDataUrl}" alt="${escapeHtml(x.title)} receipt" />
            <span>${escapeHtml(x.title)}</span>
          </button>
        `
      )
      .join('');
  }

  setTrendRange(monthCount) {
    const end = $('#filter-month').value || yyyyMm(new Date());
    const { from, to } = statsView.lastNMonthsRange(monthCount, end);
    $('#trend-start-month').value = from;
    $('#trend-end-month').value = to;
    document.querySelectorAll('[data-trend-months]').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.trendMonths) === monthCount);
    });
    refreshStats(end);
  }

  handleReceiptFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image receipt');
      return;
    }
    if (file.size > 1_200_000) {
      toast('Receipt image is too large; choose one under 1.2MB');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => expenseDialog.setReceipt(String(reader.result || ''), file.name);
    reader.readAsDataURL(file);
  }

  async exportData() {
    const data = await api('/api/export');
    const isSettingsOpen = !$('#view-settings')?.hidden;
    const month = (isSettingsOpen ? $('#settings-month').value : $('#filter-month').value) || yyyyMm(new Date());
    exportStatementImage(data, { month });
    toast('Statement image exported');
  }

  async initializeLedger() {
    const now = new Date();
    const reportMonth = yyyyMm(now);
    state.filters.month = '';
    $('#filter-month').value = reportMonth;
    $('#ledger-month').value = '';
    $('#trend-end-month').value = reportMonth;
    const { from: trendFrom } = statsView.lastNMonthsRange(6, reportMonth);
    $('#trend-start-month').value = trendFrom;

    await refreshCategories();
    this.populateTemplateCategorySelect();
    await this.refreshTemplates();
    await refreshExpenses();
    await analyticsView.refreshFromDom();
    await trashView.refresh();
    budgetBoardView.setPoolFromInputs();
    await flushDrafts();
  }

  populateTemplateCategorySelect() {
    const select = $('#template-category');
    if (!select) return;
    select.innerHTML = state.categories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
    this.populateSettingsCategorySelects();
  }

  populateSettingsCategorySelects() {
    const options = state.categories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
    const templateSelect = $('#settings-template-category');
    const budgetSelect = $('#settings-category-budget-category');
    if (templateSelect) templateSelect.innerHTML = options;
    if (budgetSelect) budgetSelect.innerHTML = options;
  }

  async init() {
    registerOfflineSync();
    if (!getToken()) {
      this.showAuth();
      this.wireEvents();
      return;
    }
    this.wireEvents();
    try {
      const data = await api('/api/auth/me');
      state.user = data.user;
      await this.showApp();
      await this.initializeLedger();
    } catch (_err) {
      this.logout();
    }
  }
}
