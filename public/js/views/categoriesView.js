/**
 * Loads categories into `state` and fills `<select>` elements for filters and dialogs.
 */

import { api, getToken } from '../lib/api.js';
import { $, toast } from '../lib/dom.js';
import { state } from '../state.js';

export class CategoriesView {
  fillCategoryOptions(selectEl, { includeAll = false, placeholder = '' } = {}) {
    selectEl.innerHTML = '';
    if (placeholder) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      opt.disabled = true;
      opt.selected = true;
      selectEl.appendChild(opt);
    }
    if (includeAll) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'All categories';
      selectEl.appendChild(opt);
    }
    if (!state.categories.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = includeAll
        ? 'No categories (server should seed on startup)'
        : 'No categories';
      opt.disabled = true;
      opt.selected = true;
      selectEl.appendChild(opt);
      return;
    }
    for (const c of state.categories) {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      opt.textContent = c.name;
      selectEl.appendChild(opt);
    }
  }

  renderCategoryBudgetChoices() {
    // Overview category chips removed; allocation lives in budget board step 3.
  }

  async refresh() {
    if (!getToken()) return;
    try {
      const data = await api('/api/categories');
      state.categories = data.items || [];

      this.fillCategoryOptions($('#filter-category'), { includeAll: true });
      this.fillCategoryOptions($('#f-category'));
      const budgetCategory = $('#settings-category-budget-category');
      if (budgetCategory) {
        this.fillCategoryOptions(budgetCategory, { placeholder: 'Choose category' });
      }

      $('#filter-category').value = state.filters.categoryId;
    } catch (e) {
      if (e.status === 401) return;
      toast(`Failed to load categories: ${e.message}`);
    }
  }
}

export const categoriesView = new CategoriesView();

export const refreshCategories = () => categoriesView.refresh();
