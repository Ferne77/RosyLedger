/**
 * Refresh data for whichever app views are currently visible (Live / SSE driven).
 */

import { yyyyMm } from './dateMoney.js';
import { refreshExpenses } from '../views/expensesView.js';
import { refreshStats, statsView } from '../views/statsView.js';
import { analyticsView } from '../views/analyticsView.js';
import { kittyChatView } from '../views/kittyChatView.js';
import { companionViews } from '../views/companionViews.js';
import { trashView } from '../views/trashView.js';

function viewVisible(id) {
  const el = document.getElementById(id);
  return Boolean(el && !el.hidden);
}

function reportMonth() {
  return document.querySelector('#filter-month')?.value || yyyyMm(new Date());
}

/** Refresh when user opens a view. */
export async function refreshView(viewId) {
  const month = reportMonth();
  switch (viewId) {
    case 'overview':
      await refreshStats(month);
      break;
    case 'insights':
      await refreshStats(month);
      statsView.ensureChartsRendered();
      break;
    case 'analyst-panel':
      await analyticsView.refreshFromDom();
      await companionViews.renderEmotions(month);
      break;
    case 'query':
      await refreshExpenses();
      await trashView.refresh();
      break;
    case 'kitty-chat':
      await kittyChatView.refresh();
      break;
    case 'weekly-report':
      await companionViews.renderWeekly();
      break;
    case 'wishlist':
      await companionViews.renderWishlist();
      break;
    case 'achievements':
      await companionViews.renderAchievements();
      break;
    default:
      break;
  }
}

/** After SSE or month change — update visible panels only. */
export async function refreshVisibleViews({ scope = 'all' } = {}) {
  const month = reportMonth();
  const tasks = [];

  const needsStats =
    viewVisible('view-overview') || viewVisible('view-insights') || scope === 'all';

  if (needsStats) {
    tasks.push(
      refreshStats(month).then(() => {
        if (viewVisible('view-insights')) statsView.ensureChartsRendered();
      })
    );
  }

  if ((scope === 'ledger' || scope === 'all') && viewVisible('view-query')) {
    tasks.push(refreshExpenses());
    tasks.push(trashView.refresh());
  }

  if (viewVisible('view-analyst-panel')) {
    tasks.push(analyticsView.refreshFromDom());
    tasks.push(companionViews.renderEmotions(month));
  }

  if (viewVisible('view-kitty-chat')) tasks.push(kittyChatView.refresh());

  if (scope === 'companion' || scope === 'all') {
    if (viewVisible('view-weekly-report')) tasks.push(companionViews.renderWeekly());
    if (viewVisible('view-wishlist')) tasks.push(companionViews.renderWishlist());
    if (viewVisible('view-achievements')) tasks.push(companionViews.renderAchievements());
  }

  await Promise.all(tasks);
}
