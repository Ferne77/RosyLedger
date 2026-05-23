/**
 * Fixed-position toast element (`#toast`): show message and auto-hide after a delay.
 */

export class Toast {
  constructor() {
    this._el = document.querySelector('#toast');
    this._timer = null;
  }

  show(message) {
    if (!this._el) return;
    this._el.textContent = message;
    this._el.hidden = false;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._el.hidden = true;
    }, 2200);
  }
}

export const toast = new Toast();
