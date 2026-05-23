/**
 * RosyLedger browser entry: bootstraps AppShell and surfaces init errors in-page.
 */

import { $ } from './lib/dom.js';
import { AppShell } from './app/AppShell.js';

const shell = new AppShell();

shell.init().catch((e) => {
  const box = $('#expenses-error');
  if (box) {
    box.textContent = e.message;
    box.hidden = false;
  } else {
    console.error(e);
  }
});
