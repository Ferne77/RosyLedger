/**
 * Small DOM helpers: `$` query selector, HTML escaping, toast bridge.
 */

import { toast as toastUi } from '../ui/Toast.js';

export const $ = (sel) => document.querySelector(sel);

export function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toast(msg) {
  toastUi.show(msg);
}
