import { api, getToken } from '../lib/api.js';
import { $, escapeHtml } from '../lib/dom.js';
import { formatMonthLabel, moneyFromCents, yyyyMm } from '../lib/dateMoney.js';
import { companionViews } from './companionViews.js';

const GAUGE_RADIUS = 46;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_RADIUS;

export class AnalyticsView {
  async refresh(month) {
    if (!getToken()) return;
    const box = $('#analytics-error');
    if (box) box.hidden = true;
    try {
      const data = await api(`/api/stats/analytics?month=${encodeURIComponent(month)}`);
      this.render(data);
      await companionViews.renderEmotions(month);
    } catch (err) {
      if (box) {
        box.textContent = err.message;
        box.hidden = false;
      }
    }
  }

  refreshFromDom() {
    const month = $('#filter-month')?.value || yyyyMm(new Date());
    return this.refresh(month);
  }

  renderGauge(score) {
    const value = Math.max(0, Math.min(100, Number(score || 0)));
    const offset = GAUGE_CIRC * (1 - value / 100);
    const tier =
      value >= 70 ? 'good' : value >= 40 ? 'fair' : 'poor';
    const hint =
      value >= 70
        ? 'Steady income pattern'
        : value >= 40
          ? 'Some month-to-month variation'
          : 'Income swings need attention';

    return `
      <div class="analytics-gauge analytics-gauge--${tier}">
        <svg viewBox="0 0 120 120" class="analytics-gauge__svg" aria-hidden="true">
          <circle class="analytics-gauge__track" cx="60" cy="60" r="${GAUGE_RADIUS}" />
          <circle
            class="analytics-gauge__fill"
            cx="60"
            cy="60"
            r="${GAUGE_RADIUS}"
            stroke-dasharray="${GAUGE_CIRC.toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}"
          />
        </svg>
        <div class="analytics-gauge__center">
          <strong>${value}</strong>
          <span>/ 100</span>
        </div>
        <p class="analytics-gauge__hint">${hint}</p>
      </div>
    `;
  }

  renderSavingsTrend(items) {
    if (!items.length) {
      return '<div class="analytics-empty">No savings history yet.</div>';
    }

    const maxAbs = Math.max(
      ...items.map((row) => Math.abs(Number(row.savingsRate || 0))),
      0.01
    );

    return items
      .map((row, index) => {
        const rate = Number(row.savingsRate || 0);
        const ratePct = Math.round(rate * 100);
        const barWidth = Math.max(4, Math.round((Math.abs(rate) / maxAbs) * 100));
        const isNegative = rate < 0;
        const isCurrent = index === items.length - 1;

        return `
          <div class="analytics-trend-row${isCurrent ? ' is-current' : ''}${isNegative ? ' is-negative' : ''}">
            <span class="analytics-trend-row__month">${escapeHtml(formatMonthLabel(row.month))}</span>
            <div class="analytics-trend-row__bar" aria-hidden="true">
              <span style="width:${barWidth}%"></span>
            </div>
            <span class="analytics-trend-row__rate">${ratePct}%</span>
            <span class="analytics-trend-row__net">${moneyFromCents(row.netCents)}</span>
          </div>
        `;
      })
      .join('');
  }

  renderOverspend(items) {
    if (!items.length) {
      return `
        <div class="analytics-empty analytics-empty--ok">
          <span class="analytics-empty__icon analytics-empty__icon--check" aria-hidden="true">✓</span>
          <span>All cozy — every category is within budget!</span>
        </div>
      `;
    }

    const maxOver = Math.max(...items.map((x) => Number(x.overCents || 0)), 1);

    return items
      .map((x) => {
        const usage = Math.min(100, Math.round(Number(x.usageRate || 0) * 100));
        const barWidth = Math.max(8, Math.round((Number(x.overCents || 0) / maxOver) * 100));
        return `
          <div class="analytics-warn-row">
            <div class="analytics-warn-row__top">
              <span class="analytics-warn-row__name">${escapeHtml(x.categoryName)}</span>
              <strong>${moneyFromCents(x.overCents)} over</strong>
            </div>
            <div class="analytics-warn-row__bar" aria-hidden="true">
              <span style="width:${barWidth}%"></span>
            </div>
            <span class="analytics-warn-row__meta">${usage}% of limit used</span>
          </div>
        `;
      })
      .join('');
  }

  renderCategoryRank(items) {
    const rows = (items || []).slice(0, 5);
    if (!rows.length) {
      return '<div class="analytics-empty">No spending recorded this month.</div>';
    }

    const maxSpent = Math.max(...rows.map((x) => Number(x.spentCents || 0)), 1);

    return rows
      .map((x, i) => {
        const width = Math.max(6, Math.round((Number(x.spentCents || 0) / maxSpent) * 100));
        return `
          <div class="analytics-rank-row">
            <span class="analytics-rank-row__badge">${i + 1}</span>
            <div class="analytics-rank-row__body">
              <div class="analytics-rank-row__top">
                <span>${escapeHtml(x.categoryName)}</span>
                <strong>${moneyFromCents(x.spentCents)}</strong>
              </div>
              <div class="analytics-rank-row__bar" aria-hidden="true">
                <span style="width:${width}%"></span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  render(data) {
    const savingsEl = $('#analytics-savings');
    if (savingsEl) {
      savingsEl.innerHTML = this.renderSavingsTrend(data.savingsTrend || []);
    }

    const overspendEl = $('#analytics-overspend');
    if (overspendEl) {
      overspendEl.innerHTML = this.renderOverspend(data.topOverBudgetCategories || []);
    }

    const stabilityEl = $('#analytics-stability');
    if (stabilityEl) {
      stabilityEl.innerHTML = this.renderGauge(data.incomeStabilityScore || 0);
    }

    const rankEl = $('#analytics-category-rank');
    if (rankEl) {
      rankEl.innerHTML = this.renderCategoryRank(data.categorySpendRank || []);
    }
  }
}

export const analyticsView = new AnalyticsView();
