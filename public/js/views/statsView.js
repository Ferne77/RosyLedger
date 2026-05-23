/**
 * Dashboard stats: all-time pie, monthly KPIs, and line trend (Chart.js).
 * Resolves trend `from`/`to` from month inputs; runs three stat requests in parallel.
 */

import { api, getToken } from '../lib/api.js';
import { $, escapeHtml } from '../lib/dom.js';
import {
  formatMonthLabel,
  formatMonthLabelShort,
  moneyFromCents,
  yyyyMm
} from '../lib/dateMoney.js';
import { budgetBoardView } from './budgetBoardView.js';
import { state } from '../state.js';
import { updatePlanningSummaries } from '../lib/planningAccordion.js';

const PINKS = [
  '#db2777',
  '#e11d48',
  '#ec4899',
  '#d946ef',
  '#f472b6',
  '#fb7185',
  '#f43f5e',
  '#be185d'
];

const PINK_LIGHT = [
  '#fce7f3',
  '#ffe4e6',
  '#fce7f3',
  '#fae8ff',
  '#fce7f3',
  '#ffe4e6',
  '#ffe4e6',
  '#fce7f3'
];


function chartAccent() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
    '#db2777'
  );
}

/** Draw a tiny heart marker on the trend line. */
function drawHeartMarker(ctx, x, y, radius, fill, stroke) {
  ctx.save();
  ctx.translate(x, y - radius * 0.15);
  ctx.beginPath();
  const r = radius;
  ctx.moveTo(0, r * 0.35);
  ctx.bezierCurveTo(0, -r * 0.15, -r, -r * 0.15, -r, r * 0.25);
  ctx.bezierCurveTo(-r, r * 0.75, 0, r * 1.05, 0, r * 1.35);
  ctx.bezierCurveTo(0, r * 1.05, r, r * 0.75, r, r * 0.25);
  ctx.bezierCurveTo(r, -r * 0.15, 0, -r * 0.15, 0, r * 0.35);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
}

const trendAreaGradientPlugin = {
  id: 'trendAreaGradient',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const ds = chart.data.datasets[0];
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, 'rgba(251, 207, 232, 0.52)');
    g.addColorStop(0.5, 'rgba(244, 114, 182, 0.14)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ds.backgroundColor = g;
  }
};

const trendHeartPointsPlugin = {
  id: 'trendHeartPoints',
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length || meta.hidden) return;
    const { ctx, data, chartArea } = chart;
    const accent = chartAccent();
    const pts = meta.data;
    const values = data.datasets[0].data;

    pts.forEach((pt, i) => {
      if (!pt || values[i] == null) return;
      const isLast = i === pts.length - 1;
      const v = Number(values[i] || 0);
      if (isLast && v >= 0) {
        let hx = pt.x;
        if (chartArea) {
          hx = Math.min(hx, chartArea.right - 8);
          hx = Math.max(hx, chartArea.left + 8);
        }
        drawHeartMarker(ctx, hx, pt.y, 6.5, accent, '#fff');
        return;
      }
      if (v > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(252, 231, 243, 0.9)';
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });
  }
};

const trendCuteGridPlugin = {
  id: 'trendCuteGrid',
  beforeDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.06)';
    ctx.lineWidth = 1;
    const yScale = scales.y;
    if (yScale?.ticks?.length) {
      yScale.ticks.forEach((tick) => {
        const y = yScale.getPixelForValue(tick.value);
        if (y >= chartArea.top && y <= chartArea.bottom) {
          ctx.beginPath();
          ctx.setLineDash([4, 6]);
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
        }
      });
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
};

export class StatsView {
  constructor() {
    this._chartCategory = null;
    this._chartTrend = null;
    this._trendMode = 'cumulative';
    this._categoryScope = 'all';
    this._refreshSeq = 0;
    this._lastTrendPayload = null;
    this._lastCategoryPayload = null;
  }

  lastNMonthsRange(n, endYyyyMm) {
    const [y, m] = endYyyyMm.split('-').map(Number);
    const end = new Date(y, m - 1, 1);
    const start = new Date(end);
    start.setMonth(start.getMonth() - (n - 1));
    return { from: yyyyMm(start), to: yyyyMm(end) };
  }

  /** Inclusive month count from YYYY-MM to YYYY-MM. */
  monthsInclusive(fromYyyyMm, toYyyyMm) {
    const [fy, fm] = fromYyyyMm.split('-').map(Number);
    const [ty, tm] = toYyyyMm.split('-').map(Number);
    let n = 0;
    const cur = new Date(fy, fm - 1, 1);
    const end = new Date(ty, tm - 1, 1);
    while (cur <= end) {
      n += 1;
      cur.setMonth(cur.getMonth() + 1);
    }
    return n;
  }

  trendEndMonth(fallbackReportMonth) {
    const v = $('#trend-end-month')?.value;
    if (v && /^\d{4}-\d{2}$/.test(v)) return v;
    return fallbackReportMonth || yyyyMm(new Date());
  }

  previousMonth(month) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return yyyyMm(d);
  }

  _destroyCharts() {
    if (this._chartCategory) {
      this._chartCategory.destroy();
      this._chartCategory = null;
    }
    if (this._chartTrend) {
      this._chartTrend.destroy();
      this._chartTrend = null;
    }
  }

  _insightsVisible() {
    const view = document.getElementById('view-insights');
    return Boolean(view && !view.hidden);
  }

  ensureChartsRendered() {
    if (!this._insightsVisible()) return;
    requestAnimationFrame(() => {
      if (this._lastCategoryPayload) this.renderCategoryFromCache();
      if (this._lastTrendPayload) this.renderTrendFromCache();
      requestAnimationFrame(() => {
        this._chartCategory?.resize();
        this._chartTrend?.resize();
      });
    });
  }

  _destroyCategoryChart() {
    if (this._chartCategory) {
      this._chartCategory.destroy();
      this._chartCategory = null;
    }
  }

  _destroyTrendChart() {
    if (this._chartTrend) {
      this._chartTrend.destroy();
      this._chartTrend = null;
    }
  }

  renderCategoryChart(byCat) {
    const Chart = window.Chart;
    const canvas = $('#chart-category');
    const empty = $('#category-empty');
    if (!canvas || !Chart) return;
    if (!this._insightsVisible()) return;

    this._destroyCategoryChart();

    const items = (byCat.items || []).filter(
      (x) => Number(x.totalCents || 0) > 0
    );
    if (items.length === 0) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    const labels = items.map((x) => x.categoryName);
    const data = items.map((x) => Number(x.totalCents || 0));
    const total = data.reduce((a, b) => a + b, 0);

    const gradientPlugin = {
      id: 'pieSliceGradients',
      beforeDatasetsDraw(chart) {
        const ds = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        if (!meta?.data?.length || ds._gradientsBuilt) return;
        const ctx = chart.ctx;
        ds.backgroundColor = meta.data.map((arc, i) => {
          const { x, y, outerRadius, innerRadius } = arc;
          const r0 = innerRadius || 0;
          const r1 = outerRadius || 100;
          const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
          g.addColorStop(0, PINK_LIGHT[i % PINK_LIGHT.length]);
          g.addColorStop(0.45, PINKS[i % PINKS.length]);
          g.addColorStop(1, '#831843');
          return g;
        });
        ds._gradientsBuilt = true;
      }
    };

    this._chartCategory = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: PINKS.map((c) => c),
            borderColor: '#ffffff',
            borderWidth: 3,
            hoverBorderWidth: 4,
            hoverBorderColor: '#ffffff',
            hoverOffset: 10
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        spacing: 4,
        layout: { padding: 12 },
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 900,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: {
            position: 'bottom',
            align: 'center',
            labels: {
              color: '#5c3d4a',
              boxWidth: 14,
              boxHeight: 14,
              padding: 14,
              usePointStyle: true,
              pointStyle: 'rectRounded',
              font: { size: 12, weight: '500' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            titleColor: '#3d1f2e',
            bodyColor: '#831843',
            borderColor: 'rgba(219, 39, 119, 0.25)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 12,
            displayColors: true,
            callbacks: {
              label(ctx) {
                const v = ctx.raw;
                const pct =
                  total > 0 ? ((Number(v) / total) * 100).toFixed(1) : '0';
                return ` ${moneyFromCents(v)} (${pct}%)`;
              }
            }
          }
        },
        elements: {
          arc: {
            borderJoinStyle: 'round',
            borderRadius: 8
          }
        }
      },
      plugins: [gradientPlugin]
    });
  }

  setCategoryScope(scope) {
    this._categoryScope = scope === 'month' ? 'month' : 'all';
    $('#btn-category-scope-all')?.classList.toggle('is-active', this._categoryScope === 'all');
    $('#btn-category-scope-month')?.classList.toggle('is-active', this._categoryScope === 'month');
  }

  renderCategoryFromCache() {
    if (!this._lastCategoryPayload) return false;
    const payload =
      this._categoryScope === 'month'
        ? this._lastCategoryPayload.byMonth
        : this._lastCategoryPayload.byAll;
    const totalEl = $('#stats-total');
    if (totalEl) totalEl.textContent = moneyFromCents(payload.totalCents);
    this.renderCategoryChart(payload);
    return true;
  }

  setTrendMode(mode) {
    if (mode !== 'cumulative' && mode !== 'monthly') return;
    this._trendMode = mode;
    this.updateTrendModeButtons();
    this.updateTrendModeSubtitle();
  }

  updateTrendModeButtons() {
    const btnCum = $('#btn-trend-mode-cumulative');
    const btnMon = $('#btn-trend-mode-monthly');
    if (!btnCum || !btnMon) return;
    const isCum = this._trendMode === 'cumulative';
    btnCum.classList.toggle('is-active', isCum);
    btnMon.classList.toggle('is-active', !isCum);
    btnCum.setAttribute('aria-pressed', isCum ? 'true' : 'false');
    btnMon.setAttribute('aria-pressed', isCum ? 'false' : 'true');
  }

  updateTrendModeSubtitle() {
    const el = $('#trend-mode-sub');
    if (!el) return;
    if (this._trendMode === 'cumulative') {
      el.textContent = 'Mode: watching your spend grow gently~';
      return;
    }
    el.textContent = 'Mode: each month on its own little bar ♡';
  }

  renderTrendFromCache() {
    if (!this._lastTrendPayload) return false;
    this.renderTrendChart(this._lastTrendPayload.trend, {
      from: this._lastTrendPayload.from,
      to: this._lastTrendPayload.to
    });
    return true;
  }

  renderTrendChart(trend, { from, to }) {
    const Chart = window.Chart;
    const canvas = $('#chart-trend');
    if (!canvas || !Chart) return;
    if (!this._insightsVisible()) return;

    const map = new Map(
      (trend.items || []).map((x) => [x.month, Number(x.totalCents || 0)])
    );

    const months = [];
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    let cur = new Date(fy, fm - 1, 1);
    const end = new Date(ty, tm - 1, 1);
    while (cur <= end) {
      months.push(yyyyMm(cur));
      cur.setMonth(cur.getMonth() + 1);
    }

    const monthlyValues = months.map((m) => map.get(m) || 0);
    this.updateTrendSummary(months, monthlyValues);
    const cumulativeValues = [];
    let running = 0;
    monthlyValues.forEach((v) => {
      running += Number(v || 0);
      cumulativeValues.push(running);
    });
    const isCumulative = this._trendMode === 'cumulative';
    const values = isCumulative ? cumulativeValues : monthlyValues;
    const useShortLabels = months.length >= 7;
    const formatAxisLabel = useShortLabels ? formatMonthLabelShort : formatMonthLabel;
    const xLabels = months.map((m) => formatAxisLabel(m));
    const accent = chartAccent();
    const lineLabel = isCumulative ? 'Cumulative spend' : 'Monthly spend';
    const trendBox = canvas.closest('.chart-box--trendline');

    this._destroyTrendChart();

    this._chartTrend = new Chart(canvas, {
      type: 'line',
      data: {
        labels: xLabels,
        datasets: [
          {
            label: lineLabel,
            data: values,
            borderColor: accent,
            backgroundColor: 'rgba(244, 114, 182, 0.15)',
            fill: true,
            tension: 0.42,
            borderWidth: 3,
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
            pointRadius: 0,
            pointHoverRadius: 0,
            pointHitRadius: 14,
            clip: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 18,
            right: useShortLabels ? 28 : 20,
            bottom: 6,
            left: 8
          }
        },
        interaction: { mode: 'index', intersect: false },
        animation: {
          duration: 720,
          easing: 'easeOutQuart'
        },
        scales: {
          x: {
            offset: true,
            grid: {
              display: false,
              drawBorder: false
            },
            border: { display: false },
            ticks: {
              color: '#9d174d',
              font: {
                family: 'Nunito',
                size: useShortLabels ? 10 : 11,
                weight: '600'
              },
              padding: 6,
              maxRotation: 0,
              autoSkip: months.length > 14,
              maxTicksLimit: months.length > 14 ? 12 : months.length
            }
          },
          y: {
            beginAtZero: true,
            grace: '12%',
            suggestedMax: Math.max(...values, 0) <= 0 ? 10 : undefined,
            grid: {
              display: false,
              drawBorder: false
            },
            border: { display: false },
            ticks: {
              color: 'rgba(157, 23, 77, 0.65)',
              font: { family: 'Nunito', size: 11, weight: '600' },
              padding: 10,
              maxTicksLimit: 6,
              callback(v) {
                return moneyFromCents(Number(v));
              }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.97)',
            titleColor: '#831843',
            bodyColor: '#9d174d',
            borderColor: 'rgba(244, 114, 182, 0.28)',
            borderWidth: 1.5,
            padding: 12,
            cornerRadius: 14,
            titleFont: { family: 'Nunito', size: 12, weight: '700' },
            bodyFont: { family: 'Nunito', size: 12, weight: '600' },
            displayColors: false,
            callbacks: {
              title(items) {
                const i = items[0]?.dataIndex;
                return i != null && months[i] ? `♡ ${formatMonthLabel(months[i])}` : '';
              },
              label(ctx) {
                return ` ${lineLabel}: ${moneyFromCents(ctx.raw)}`;
              }
            }
          }
        }
      },
      plugins: [trendCuteGridPlugin, trendAreaGradientPlugin, trendHeartPointsPlugin]
    });

    if (trendBox) {
      trendBox.classList.remove('is-animating');
      // Force reflow so animation can replay on each mode switch/refresh.
      void trendBox.offsetWidth;
      trendBox.classList.add('is-animating');
    }
  }

  updateTrendSummary(months, monthlyValues) {
    const total = monthlyValues.reduce((sum, x) => sum + Number(x || 0), 0);
    const avg = months.length ? Math.round(total / months.length) : 0;
    let peakIndex = -1;
    let peakValue = -1;
    monthlyValues.forEach((value, index) => {
      if (value > peakValue) {
        peakValue = value;
        peakIndex = index;
      }
    });
    const totalEl = $('#trend-summary-total');
    const avgEl = $('#trend-summary-average');
    const peakEl = $('#trend-summary-peak');
    if (totalEl) totalEl.textContent = moneyFromCents(total);
    if (avgEl) avgEl.textContent = moneyFromCents(avg);
    if (peakEl) {
      peakEl.textContent =
        peakIndex >= 0 && peakValue > 0
          ? `${formatMonthLabel(months[peakIndex])} · ${moneyFromCents(peakValue)}`
          : 'No spending yet';
    }
  }

  updateTrendRangeDisplay(from, to, n) {
    const startEl = $('#trend-range-start');
    const endEl = $('#trend-range-end');
    if (startEl) startEl.textContent = formatMonthLabel(from);
    if (endEl) endEl.textContent = formatMonthLabel(to);
    const sub = $('#trend-range-sub');
    if (sub) sub.textContent = `${from} → ${to} · ${n} months`;
  }

  updateKpisFromByCategory(byCat, month) {
    $('#kpi-total-month').textContent = moneyFromCents(byCat.totalCents);
    $('#kpi-total-month-sub').textContent = month ? `Month · ${month}` : '—';

    const top = (byCat.items || []).find((x) => Number(x.totalCents || 0) > 0);
    if (!top) {
      $('#kpi-top-category').textContent = '—';
      $('#kpi-top-category-sub').textContent = 'No data';
    } else {
      $('#kpi-top-category').textContent = top.categoryName;
      $('#kpi-top-category-sub').textContent = moneyFromCents(top.totalCents);
    }
  }

  healthScoreTier(score) {
    if (score >= 70) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  healthScoreIconSvg(tier) {
    const heart =
      '<path class="ico-fill" d="M12 20.5s-6.5-4.35-8.5-7.5C2 10.5 2.5 7 5.5 5.5 8 4.5 10 5.5 12 7.5 14 5.5 16 4.5 18.5 5.5 21.5 7 22 10.5 20 13 12 20.5 12 20.5z"/>';
    const outline =
      '<path d="M12 20.5s-6.5-4.35-8.5-7.5C2 10.5 2.5 7 5.5 5.5 8 4.5 10 5.5 12 7.5 14 5.5 16 4.5 18.5 5.5 21.5 7 22 10.5 20 13 12 20.5 12 20.5z"/>';
    if (tier === 'good') {
      return `<svg viewBox="0 0 24 24">${heart}<path d="m8.5 12.5 2.2 2.2 4.8-4.9" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    if (tier === 'fair') {
      return `<svg viewBox="0 0 24 24">${outline}</svg>`;
    }
    return `<svg viewBox="0 0 24 24">${outline}<path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>`;
  }

  updateHealthScoreCard(score) {
    const card = $('#overview-health-card');
    const icon = $('#overview-health-icon');
    if (!card) return;
    const tier = this.healthScoreTier(score);
    card.classList.remove(
      'overview-score-card--good',
      'overview-score-card--fair',
      'overview-score-card--poor',
      'overview-score-card--neutral'
    );
    card.classList.add(`overview-score-card--${tier}`);
    if (icon) icon.innerHTML = this.healthScoreIconSvg(tier);
  }

  updateOverviewHealth({ budget, byMonth, previousMonthStats, summary }) {
    const scoreEl = $('#overview-health-score');
    const changeEl = $('#overview-month-change');
    if (!scoreEl || !changeEl) return;
    const total = Number(summary?.expenseCents ?? byMonth?.totalCents ?? 0);
    const income = Number(summary?.incomeCents || 0);
    const net = Number(summary?.netCents || 0);
    const budgetCents = Number(budget?.amountCents || 0);
    const previous = Number(previousMonthStats?.totalCents || 0);
    let score = 50;
    if (budgetCents > 0) {
      const ratio = total / budgetCents;
      if (ratio <= 0.65) score += 22;
      else if (ratio <= 0.85) score += 16;
      else if (ratio <= 1) score += 8;
      else score -= Math.min(30, Math.round((ratio - 1) * 50));
    } else {
      score -= 6;
    }
    if (income > 0) {
      const savingsRate = net / income;
      if (savingsRate >= 0.25) score += 24;
      else if (savingsRate >= 0.1) score += 16;
      else if (savingsRate >= 0) score += 8;
      else score -= 22;
    } else {
      score -= total > 0 ? 18 : 8;
    }
    if (previous > 0 && total < previous) score += 5;
    if (Number(budget?.goalPercent || 0) > 0) score += 4;
    score = Math.max(0, Math.min(100, score));
    scoreEl.textContent = `${score}/100`;
    this.updateHealthScoreCard(score);

    if (previous <= 0) {
      changeEl.textContent = 'No previous month';
      return;
    }
    const delta = total - previous;
    const pct = Math.round((Math.abs(delta) / previous) * 100);
    changeEl.textContent =
      delta <= 0
        ? `${moneyFromCents(Math.abs(delta))} less (${pct}%)`
        : `${moneyFromCents(delta)} more (${pct}%)`;
  }

  renderCategoryBudgetHtml(item) {
    const pct = item.amountCents > 0 ? Math.min(100, Math.round((item.spent / item.amountCents) * 100)) : 0;
    const isOver = item.spent > item.amountCents;
    return `
      <div class="category-budget-progress">
        <div class="category-budget-progress__top">
          <span>${escapeHtml(item.name)}</span>
          <span>${moneyFromCents(item.spent)} / ${moneyFromCents(item.amountCents)}</span>
        </div>
        <div class="category-budget-progress__bar">
          <span class="${isOver ? 'is-over' : ''}" style="width:${pct}%"></span>
        </div>
      </div>
    `;
  }

  updateBudgetCard(budget, byMonth) {
    const budgetCents = Number(budget?.amountCents || 0);
    const spentCents = Number(byMonth?.totalCents || 0);
    const title = $('#kpi-budget');
    const sub = $('#kpi-budget-sub');
    const input = $('#budget-amount');
    const goalInput = $('#goal-percent');
    const meter = $('#budget-meter-fill');
    const meterLabel = $('#budget-meter-label');
    const month = $('#filter-month')?.value || yyyyMm(new Date());
    const categoryBudgets = budget?.categoryBudgets || {};
    const allocatedCents = Object.values(categoryBudgets).reduce(
      (sum, cents) => sum + Number(cents || 0),
      0
    );
    const allocatedCount = Object.values(categoryBudgets).filter((cents) => Number(cents) > 0).length;

    if (input) input.value = budgetCents ? (budgetCents / 100).toFixed(2) : '';
    if (goalInput) goalInput.value = budget?.goalPercent ? String(budget.goalPercent) : '';

    updatePlanningSummaries({
      month,
      budgetCents,
      goalPercent: Number(budget?.goalPercent || 0),
      allocatedCount,
      poolCents: budgetCents,
      remainingCents: Math.max(0, budgetCents - allocatedCents)
    });

    if (!title || !sub) return;
    if (!budgetCents) {
      title.textContent = 'Not set';
      sub.textContent = 'Add a monthly budget';
      if (meter) {
        meter.style.width = '0%';
        meter.classList.remove('is-over');
      }
      if (meterLabel) meterLabel.textContent = 'Set a budget to start tracking progress.';
      this.renderCategoryBudgets(budget, byMonth);
      budgetBoardView.loadFromBudget(budget);
      budgetBoardView.setPoolFromInputs();
      return;
    }
    const remaining = budgetCents - spentCents;
    title.textContent = remaining >= 0 ? `${moneyFromCents(remaining)} left` : `${moneyFromCents(Math.abs(remaining))} over`;
    sub.textContent = `${moneyFromCents(spentCents)} of ${moneyFromCents(budgetCents)} used`;
    const pct = Math.min(100, Math.round((spentCents / budgetCents) * 100));
    if (meter) {
      meter.style.width = `${pct}%`;
      meter.classList.toggle('is-over', spentCents > budgetCents);
    }
    if (meterLabel) {
      const goal = Number(budget?.goalPercent || 0);
      meterLabel.textContent =
        spentCents > budgetCents
          ? `${pct}% used. Budget exceeded.`
          : `${pct}% used. ${moneyFromCents(remaining)} remaining.${goal ? ` Goal: spend ${goal}% less.` : ''}`;
    }
    this.renderCategoryBudgets(budget, byMonth);
    budgetBoardView.loadFromBudget(budget);
    budgetBoardView.setPoolFromInputs();
  }

  renderCategoryBudgets(budget, byMonth) {
    const box = $('#category-budget-list');
    if (!box) return;
    const budgets = budget?.categoryBudgets || {};
    const byCategory = new Map(
      (byMonth?.items || []).map((x) => [String(x.categoryId), Number(x.totalCents || 0)])
    );
    const items = Object.entries(budgets)
      .map(([categoryId, amountCents]) => {
        const category = (byMonth?.items || []).find((x) => String(x.categoryId) === categoryId);
        const name =
          category?.categoryName ||
          state.categories.find((c) => String(c.id) === categoryId)?.name ||
          'Category';
        const spent = byCategory.get(categoryId) || 0;
        return { name, spent, amountCents: Number(amountCents || 0) };
      })
      .filter((x) => x.amountCents > 0);
    box.innerHTML = items.length
      ? items
          .map((x) => this.renderCategoryBudgetHtml(x))
          .join('')
      : '<span class="category-budget-empty">No category budgets yet</span>';
  }

  renderSuggestions(payload) {
    const box = $('#assistant-list');
    if (!box) return;
    const items = payload?.items || [];
    if (!items.length) {
      box.innerHTML = '<div class="suggestion-card">No suggestions yet.</div>';
      return;
    }
    box.innerHTML = items
      .map(
        (x) => `
        <article class="suggestion-card suggestion-card--${escapeHtml(x.level)}">
          <div class="suggestion-card__top">
            <div class="suggestion-card__title">${escapeHtml(x.title)}</div>
            <span class="suggestion-level suggestion-level--${escapeHtml(x.level)}">${escapeHtml(x.level)}</span>
          </div>
          <p class="suggestion-card__message">${escapeHtml(x.message)}</p>
        </article>
      `
      )
      .join('');
  }

  async refresh(month) {
    if (!getToken()) return;
    $('#stats-error').hidden = true;
    if (!month) return;
    this.updateTrendModeButtons();
    this.updateTrendModeSubtitle();
    const seq = ++this._refreshSeq;

    try {
      let to = this.trendEndMonth(month);
      let from = $('#trend-start-month')?.value;
      if (!from || !/^\d{4}-\d{2}$/.test(from)) {
        from = to;
        const startEl = $('#trend-start-month');
        if (startEl) startEl.value = from;
      }
      if (from > to) {
        const a = from;
        from = to;
        to = a;
        const startEl = $('#trend-start-month');
        const endEl = $('#trend-end-month');
        if (startEl) startEl.value = from;
        if (endEl) endEl.value = to;
      }
      const nShown = this.monthsInclusive(from, to);
      this.updateTrendRangeDisplay(from, to, nShown);

      /*
       * Parallel stat requests: all-time categories, report-month KPIs, trend series.
       */
      const previousMonth = this.previousMonth(month);
      const [byAll, byMonth, previousMonthStats, trend, budget, suggestions, summary] = await Promise.all([
        api('/api/stats/by-category'),
        api(`/api/stats/by-category?month=${encodeURIComponent(month)}`),
        api(`/api/stats/by-category?month=${encodeURIComponent(previousMonth)}`),
        api(
          `/api/stats/by-month?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        ),
        api(`/api/budget?month=${encodeURIComponent(month)}`),
        api(`/api/assistant/suggestions?month=${encodeURIComponent(month)}`),
        api(`/api/stats/summary?month=${encodeURIComponent(month)}`)
      ]);
      if (seq !== this._refreshSeq) return;

      this._lastCategoryPayload = { byAll, byMonth };
      this.renderCategoryFromCache();
      this.updateKpisFromByCategory(byMonth, month);
      this.updateBudgetCard(budget, byMonth);
      this.updateOverviewHealth({ budget, byMonth, previousMonthStats, summary });
      this.renderSuggestions(suggestions);
      this._lastTrendPayload = { trend, from, to };
      this.renderTrendChart(trend, { from, to });
      this.ensureChartsRendered();
    } catch (e) {
      this._destroyCharts();
      const box = $('#stats-error');
      box.textContent = e.message;
      box.hidden = false;
    }
  }
}

export const statsView = new StatsView();

export const refreshStats = (month) => statsView.refresh(month);
