import { $ } from './dom.js';
import { formatMonthLabel, moneyFromCents } from './dateMoney.js';

export function initPlanningAccordion() {
  const root = $('#planning-accordion');
  if (!root) return;

  const panels = [...root.querySelectorAll('details.planning-section')];
  panels.forEach((panel) => {
    panel.addEventListener('toggle', () => {
      if (!panel.open) return;
      panels.forEach((other) => {
        if (other !== panel) other.open = false;
      });
    });
  });
}

export function openPlanningStep(step) {
  const panel = document.querySelector(`#planning-accordion [data-planning-step="${step}"]`);
  if (!panel) return;
  document.querySelectorAll('#planning-accordion details.planning-section').forEach((other) => {
    other.open = other === panel;
  });
}

export function updatePlanningSummaries({ month, budgetCents, goalPercent, allocatedCount, poolCents, remainingCents }) {
  const step1 = $('#planning-step-1-meta');
  const step2 = $('#planning-step-2-meta');
  const step3 = $('#planning-step-3-meta');

  if (step1) {
    if (!budgetCents) {
      step1.textContent = month ? `${formatMonthLabel(month)} · no budget yet` : 'Not configured';
    } else {
      step1.textContent = `${formatMonthLabel(month)} · ${moneyFromCents(budgetCents)}`;
    }
  }

  if (step2) {
    step2.textContent = goalPercent ? `Save ${goalPercent}% of monthly budget` : 'No target set';
  }

  if (step3) {
    if (!poolCents) {
      step3.textContent = 'Set monthly budget first';
    } else if (!allocatedCount) {
      step3.textContent = `${moneyFromCents(remainingCents)} unassigned`;
    } else {
      step3.textContent = `${allocatedCount} categor${allocatedCount === 1 ? 'y' : 'ies'} · ${moneyFromCents(remainingCents)} left`;
    }
  }
}
