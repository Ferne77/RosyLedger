/**
 * Lightweight client-side store: categories, expense rows, and ledger filter fields.
 */

export const state = {
  user: null,
  categories: [],
  expenses: [],
  templates: [],
  budget: null,
  suggestions: [],
  filters: {
    month: '',
    categoryId: '',
    q: ''
  }
};
