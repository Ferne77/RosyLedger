# RosyLedger

**Assignment 2 · submission**

**Author:** LYUYI YE · **Student ID:** 25656632 · **GitHub:** [@Ferne77](https://github.com/Ferne77) / [RosyLedger](https://github.com/Ferne77/RosyLedger)

This repository contains my **individual** coursework submission for **Assignment 2**. All design, implementation, and documentation were completed by me alone.

RosyLedger is a pink-themed personal expense tracker with a Hello Kitty companion. It combines a FastAPI + MongoDB Atlas backend with a Vanilla JS single-page frontend: ledger CRUD, budget planning, analytics, realtime sync, offline drafts, and companion features such as mood check-ins, wishlists, achievements, and weekly reports.

## Project Overview

RosyLedger helps users record daily expenses, review spending patterns, and stay motivated through a warm, companion-led experience. The backend is a FastAPI REST API with MongoDB Atlas persistence; the frontend is a lightweight ES-module SPA with Chart.js visualisations and a floating Hello Kitty assistant.

## Challenge

Personal finance tools often fail for reasons that have little to do with missing features:

- **Low engagement:** Spreadsheets and plain ledgers feel cold. Users stop logging after a few days because there is no emotional reward for showing up.
- **Anxiety without guidance:** Seeing totals and budget warnings can increase stress when the product only reports numbers — it does not help users process them.
- **Fragmented workflow:** Recording, budgeting, chart review, and getting advice usually live in separate screens or apps, so insights arrive too late to change behavior.
- **Fragile everyday use:** Mobile users lose connectivity; multi-tab users see stale data; repeat expenses are tedious to re-enter manually.
- **Full-stack complexity:** A credible demo needs authenticated multi-user storage, analytics, realtime sync, and offline resilience — not a single CRUD form.

## Solution

RosyLedger addresses these gaps with a **ledger-first dashboard** plus a **Hello Kitty companion** that separates bookkeeping from conversation:

| Challenge | RosyLedger response |
|-----------|---------------------|
| Users abandon tracking | Pink-themed SPA with KPI cards, cute trend charts, quick templates, mood check-ins, and a floating Hello Kitty assistant |
| Numbers feel punitive | **Chat** focuses on empathy and tips; **Ledger** handles formal entry. Post-entry companion replies tie budget and category context together |
| Insights are scattered | Overview, Charts, Analyst, Weekly report, and companion views share the same stats pipeline |
| Unreliable in daily use | SSE live refresh across tabs, IndexedDB offline draft queue with idempotent sync, and PWA install support |
| Hard to run or grade | One-command `run.py` launcher (venv bootstrap, port preflight, browser open) and MongoDB Atlas persistence with per-user JWT isolation |

**Hello Kitty companion (key differentiator)**

- **Chat with Kitty** — full-page conversational support, budget checks, and rule-based tips.
- **Floating assistant** — bottom-right panel with Chat and Ledger quick entry.
- **Post-entry companion** — after recording an expense, Hello Kitty returns a warm, context-aware reply built from live budget and suggestion data.
- **Daily mood check-in** — pick how you feel; Kitty responds with encouragement.
- **Spending mood tags** — tag expenses as Happy / Impulse / Necessary for monthly emotion breakdowns.
- **Wishlist & achievements** — save goals, track progress, unlock themes and celebrate milestones with confetti.
- **Weekly report** — a warm summary of the past seven days.
- **Kitty wardrobe / themes** — switch colour palettes (Rosy, Sakura, Cotton, and unlockable themes).

The companion engine (`app/companion_brain.py`) uses varied response templates, short conversation history, and ledger context — giving an LLM-like feel without external API dependencies.

## Key Features

### Core ledger & analytics

- **Accounts & isolation:** Register/login, update username/password, delete account; each user has separate categories and ledger data.
- **Expense CRUD:** Filter by month, category, or keyword; optional receipt image attachments (Data URL) with gallery preview.
- **Spending mood tags:** Optional Happy / Impulse / Necessary tag on each expense.
- **Trash:** Soft delete, restore, and permanent delete via dedicated endpoints.
- **Budget planning:** Monthly total budget, per-category budgets (single or batch), and savings goal percentage.
- **Statistics & analytics:** Category pie chart, cumulative vs monthly trend modes (cute styled line chart), monthly summary, and advanced analytics panel.
- **Quick templates:** Save reusable expense templates for one-click form fill.
- **Smart suggestions:** Rule-based spending tips from `/api/assistant/suggestions`.
- **Statement export:** `/api/export` returns ledger data; the frontend renders a designed PNG bank-style statement.

### Companion & engagement

- **Hello Kitty assistant:** Floating panel + dedicated Chat page; `/api/assistant/chat`, `/api/assistant/greeting`, `/api/assistant/record`.
- **Mood check-in:** Daily mood with Kitty reply — `/api/companion/mood`.
- **Wishlist:** Save goals and track saved amounts — `/api/companion/wishlist`.
- **Achievements:** Milestone badges with celebration animation — `/api/companion/achievements/check`.
- **Weekly report:** Seven-day spending summary — `/api/companion/weekly-report`.
- **Emotion breakdown:** Monthly spending-by-mood stats — `/api/companion/emotions`.
- **Themes:** Unlockable colour palettes stored per user — `/api/companion/theme`.
- **Holiday greetings:** Seasonal Hello Kitty messages via `/api/assistant/greeting`.

### Platform

- **Realtime sync:** SSE at `/api/events/stream`; views refresh automatically when data changes across tabs or devices (no manual Refresh buttons).
- **Offline support:** IndexedDB draft queue with idempotent `POST /api/expenses/sync`; Service Worker + Web App Manifest for installable PWA.
- **One-click dev server:** `run.py` bootstraps `.venv`, installs dependencies, checks/frees the port (macOS/Linux), and opens the browser.

## Tech Stack

| Layer | Stack |
|-------|--------|
| Backend | Python 3.10+, FastAPI, Uvicorn, Motor |
| Frontend | HTML/CSS, Vanilla JS (ES Modules) |
| Charts | Chart.js |
| Database | MongoDB Atlas |
| Realtime | Server-Sent Events (SSE) |
| Offline | IndexedDB, Service Worker |

## Project Structure

```text
<project-root>/
  app/
    config.py              # AppSettings (fixed in-code defaults)
    db.py                  # Motor client and DB accessor
    db_indexes.py          # Index creation on startup
    main.py                # FastAPI app, static routes, PWA endpoints
    auth.py / security.py  # JWT and password hashing
    event_bus.py / notify.py
    schemas.py
    default_categories.py
    mongo_id.py
    companion_brain.py     # Hello Kitty conversational reply engine
    repositories/
      companion_repo.py    # Mood, wishlist, achievements, themes
      expenses_repo.py
      categories_repo.py
      stats_repo.py
    routers/
      auth.py categories.py expenses.py stats.py
      budget.py assistant.py data_export.py
      templates.py events.py companion.py
  public/
    index.html
    manifest.json
    sw.js
    css/
      cute-theme.css companion-features.css stats.css ...
    js/
      app.js app/AppShell.js state.js
      lib/ api.js realtime.js viewRefresh.js themeManager.js ...
      views/ expensesView.js statsView.js analyticsView.js
              companionViews.js kittyChatView.js ...
      ui/ KittyAssistant.js MoodCheckin.js ConfettiCelebration.js
    images/                 # Hello Kitty assistant assets
  scripts/
    seed.py                # Seed default categories + sample expenses
    export.py              # Export snapshots to db/*.json
  run.py                   # Dev launcher (venv, port preflight, browser)
  requirements.txt
```

## Configuration

All runtime settings live in `AppSettings` (`app/config.py`) with fixed defaults in code. **No `.env` file is required.**

| Key | Description |
|-----|-------------|
| `mongodb_uri` | MongoDB Atlas connection string (preconfigured for this project) |
| `db_name` | Development database: `expense_tracker_dev` |
| `port` | Default `3000` |
| `node_env` | `development` |
| `auth_secret` | JWT signing secret |

Edit defaults in `app/config.py` to change database or port settings.

## Quick Start

### One-click run (recommended)

```bash
git clone https://github.com/Ferne77/RosyLedger.git
cd RosyLedger
python run.py
```

The default browser opens at `http://127.0.0.1:3000` (port from `config.py`).

`run.py` behavior:

- Checks for `uvicorn`, `fastapi`, `pydantic`, and `motor`.
- Creates `.venv` and runs `pip install -r requirements.txt` when dependencies are missing.
- Re-executes with `.venv` Python when needed.
- Detects port conflicts; on macOS/Linux, attempts to stop listeners on the target port.
- Enables reload on `app/` and `public/` by default; falls back to no-reload if the `watchfiles` native extension is unavailable.

### Manual setup (fallback)

```bash
cd <project-root>
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

### Run options

```bash
python run.py --no-reload
python run.py --port 8080
python run.py --host 0.0.0.0
```

> **Note:** `.venv/`, `__pycache__/`, and other cache directories are excluded via `.gitignore` and are not uploaded to GitHub. Running `run.py` recreates the virtual environment locally.

## Data Utilities

```bash
# Seed default categories and sample expenses (requires valid MongoDB)
python scripts/seed.py

# Export DB snapshots
python scripts/export.py
# → db/categories.json, db/expenses.json
```

## API Overview

Protected routes expect: `Authorization: Bearer <token>`.

### Health

- `GET /api/health` — Service and database readiness (`{"ok": true}`).

### Auth & Account

- `POST /api/auth/register` — Create user; returns bearer token.
- `POST /api/auth/login` — Sign in with username/password.
- `GET /api/auth/me` — Current session user.
- `PUT /api/auth/username` — Update username.
- `PUT /api/auth/password` — Update password (current password required).
- `DELETE /api/auth/account` — Delete account and associated ledger data.

### Categories

- `GET /api/categories/` — List categories.
- `POST /api/categories/` — Create category.
- `DELETE /api/categories/{id}` — Delete category.

### Expenses

- `GET /api/expenses/?month=&categoryId=&q=` — Filtered list.
- `POST /api/expenses/` — Create (optional `receiptDataUrl`, `receiptName`, `emotionTag`).
- `GET /api/expenses/{id}` — Single record.
- `PUT /api/expenses/{id}` — Update record.
- `DELETE /api/expenses/{id}` — Soft delete (moves to trash).
- `GET /api/expenses/trash` — Trash list.
- `POST /api/expenses/{id}/restore` — Restore from trash.
- `DELETE /api/expenses/{id}/permanent` — Permanent delete.
- `POST /api/expenses/sync` — Batch sync offline drafts (idempotent by `clientId`).

### Statistics

- `GET /api/stats/by-category?month=YYYY-MM` — Totals per category (omit `month` for all-time).
- `GET /api/stats/by-month?from=YYYY-MM&to=YYYY-MM` — Monthly trend series.
- `GET /api/stats/summary?month=YYYY-MM` — Monthly income/expense summary.
- `GET /api/stats/analytics?month=YYYY-MM` — Advanced analytics payload.

### Budget

- `GET /api/budget?month=YYYY-MM` — Monthly budget, goal %, and category budgets.
- `PUT /api/budget` — Set monthly total budget.
- `PUT /api/budget/goal` — Set savings goal percentage.
- `PUT /api/budget/category` — Set one category budget.
- `PUT /api/budget/categories/batch` — Batch-set category budgets.

### Templates

- `GET /api/templates` — List quick-add templates.
- `POST /api/templates` — Create template.
- `DELETE /api/templates/{id}` — Delete template.

### Export & Assistant

- `GET /api/export` — Export categories, expenses, and budgets (for PNG statement).
- `GET /api/assistant/greeting?month=YYYY-MM` — Time-based greeting and daily tip (includes holiday messages).
- `GET /api/assistant/suggestions?month=YYYY-MM` — Rule-based spending suggestions.
- `POST /api/assistant/chat` — Conversational companion (message + optional history).
- `POST /api/assistant/record` — Quick ledger entry from the assistant panel; returns `companionReply`.

### Companion

- `GET /api/companion/profile` — User companion profile (theme, achievements, login streak).
- `PUT /api/companion/theme` — Set active colour theme.
- `GET /api/companion/mood/today` — Today's mood check-in status.
- `POST /api/companion/mood` — Save daily mood.
- `GET /api/companion/wishlist` — List wishlist items.
- `POST /api/companion/wishlist` — Create wishlist item.
- `PUT /api/companion/wishlist/{id}/saved` — Update saved amount.
- `DELETE /api/companion/wishlist/{id}` — Delete wishlist item.
- `GET /api/companion/weekly-report` — Seven-day warm spending summary.
- `GET /api/companion/achievements/check` — Evaluate and return new achievements.
- `GET /api/companion/emotions?month=YYYY-MM` — Monthly spending mood breakdown.
- `GET /api/companion/widget` — Compact snapshot for PWA shortcuts.

### Realtime (SSE)

- `GET /api/events/stream` — `text/event-stream`; pushes refresh events on data changes, `ping` on idle.

### Static & PWA

- `GET /` — SPA (`index.html`)
- `GET /sw.js`, `GET /manifest.json` — PWA assets

## Frontend Notes

- **Navigation:** Overview · Chat with Kitty · Weekly report · Wishlist · Achievements · Charts · Analyst · Ledger · Settings.
- **Trend chart:** Cumulative and Monthly spend modes with gradient fill, heart endpoint marker, and auto-shortened axis labels for long ranges.
- **Live status:** Header shows Live / Offline / Reconnecting; SSE reconnects automatically and refreshes the active view.
- **Offline:** Drafts are stored in IndexedDB and uploaded via the sync endpoint when back online.
- **Hello Kitty:** Floating bottom-right panel for quick chat and ledger entry; full Chat page for longer conversations.
- **Themes:** Settings → Kitty wardrobe; choice persists in `localStorage` and syncs to the server profile.

## Assignment Submission

- **Coursework:** Assignment 2 code submission.
- **Work type:** Individual assignment — not a group project.
- **Author:** LYUYI YE (25656632) is the sole author of this repository.

## Notes for Graders

- MongoDB Atlas is the primary data store (not local mock storage).
- Connection credentials are configured in `app/config.py` for out-of-the-box connectivity.
- Development data uses database `expense_tracker_dev`, separate from the submitted grading database.
