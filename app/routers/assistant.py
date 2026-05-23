"""Rule-based spending suggestions and Hello Kitty assistant chat for the SPA."""

from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import current_user
from app.db import get_db
from app.notify import publish_refresh
from app.repositories import expenses_repo, stats_repo
from app.companion_brain import build_chat_reply, friendly_name
from app.schemas import (
    AssistantChatRequest,
    AssistantQuickRecord,
    month_param_ok,
    to_amount_cents,
)

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

_CATEGORY_HINTS: dict[str, tuple[str, ...]] = {
    "Food": ("food", "coffee", "lunch", "dinner", "breakfast", "groceries", "restaurant", "meal", "snack"),
    "Transport": ("uber", "taxi", "bus", "metro", "transport", "gas", "parking", "train"),
    "Rent": ("rent", "lease"),
    "Utilities": ("utility", "utilities", "electric", "water", "internet", "bill", "phone"),
    "Entertainment": ("movie", "game", "entertainment", "concert", "netflix", "spotify"),
    "Health": ("health", "pharmacy", "doctor", "medical", "gym"),
    "Education": ("book", "course", "education", "tuition", "school"),
    "Shopping": ("shop", "shopping", "clothes", "amazon", "store"),
}

_DAILY_TIPS = (
    "Log small purchases daily — month-end reviews are much easier.",
    "Save quick-add templates for coffee, transit, and other repeat spends.",
    "When you've used 80% of your budget, Hello Kitty will nudge you to slow down.",
    "Category limits help curb impulse spending before it adds up.",
    "Attach receipt photos when you need proof for later reconciliation.",
    "Track income too — savings rate only makes sense with both sides.",
)


def _previous_month(month: str) -> str:
    year, month_num = [int(x) for x in month.split("-")]
    if month_num == 1:
        return f"{year - 1}-12"
    return f"{year}-{month_num - 1:02d}"


def _money(cents: int) -> str:
    return f"${cents / 100:.2f}"


def _item(level: str, title: str, message: str, type_: str = "insight") -> dict:
    return {"level": level, "title": title, "message": message, "type": type_}


def _time_greeting() -> str:
    hour = datetime.now().hour
    if hour < 6:
        return "It's late — rest well and we'll tidy the ledger tomorrow."
    if hour < 11:
        return "Good morning! I'm here whenever you need a tip or a little cheer."
    if hour < 14:
        return "Good afternoon! Hope your day is going well."
    if hour < 18:
        return "Good afternoon! Ready for a budget check or some encouragement?"
    if hour < 22:
        return "Good evening! Let's reflect on how today went."
    return "Good night! Rest easy — your ledger will be here tomorrow."


def _daily_bubble_greeting(name: str) -> str:
    """Primary short warm line for the floating Hello Kitty bubble."""
    return _bubble_greetings(name, count=1)[0]


def _bubble_greetings(name: str, count: int = 3) -> list[str]:
    """Rotating warm bubble lines — emotional, short, time-aware."""
    hour = datetime.now().hour
    day = datetime.now().timetuple().tm_yday

    if hour < 6:
        pool = (
            f"Still up, {name}? I'm here with you. 🌙",
            f"Rest when you can, {name} — tomorrow is a fresh start.",
            f"Hey {name}… be gentle with yourself tonight.",
        )
    elif hour < 11:
        pool = (
            f"Good morning, {name}~ glad you're here.",
            f"Hey {name}, today is a fresh start. You've got this.",
            f"Morning, {name}~ one kind step at a time.",
        )
    elif hour < 14:
        pool = (
            f"Hi {name}~ you're doing better than you think.",
            f"Hey {name}, take a breath — you deserve it.",
            f"Nice to see you, {name}.",
        )
    elif hour < 18:
        pool = (
            f"Good afternoon, {name}~ keep going gently.",
            f"Hey {name}, you're exactly where you need to be.",
            f"Half the day done, {name} — proud of you.",
        )
    elif hour < 22:
        pool = (
            f"Good evening, {name}~ you made it through today.",
            f"Hey {name}, you matter more than any number.",
            f"However today felt, {name} — you survived it.",
        )
    else:
        pool = (
            f"Good night, {name}~ rest your heart tonight.",
            f"Hey {name}, you did enough today. Truly.",
            f"Sleep well, {name} — I'll be here tomorrow.",
        )

    start = day % len(pool)
    picked: list[str] = []
    for i in range(len(pool)):
        msg = pool[(start + i) % len(pool)]
        if msg not in picked:
            picked.append(msg)
        if len(picked) >= count:
            break
    return picked


async def _build_companion_reply(
    db,
    user: dict,
    month: str,
    *,
    title: str,
    amount_cents: int,
    record_type: str,
    category_name: str | None,
) -> str:
    """Warm, contextual message after a ledger post — emotional + one smart insight."""
    username = friendly_name(user.get("username"))
    parts: list[str] = []

    if record_type == "income":
        parts.append(
            f"Yay, {username}! Income logged — \"{title}\" ({_money(amount_cents)}). "
            "Tracking what comes in is just as important as what goes out."
        )
    elif amount_cents >= 8000:
        parts.append(
            f"Logged \"{title}\" at {_money(amount_cents)}. That's a meaningful entry — "
            "the fact that you captured it means you're in control, not guessing."
        )
    elif amount_cents >= 3000:
        parts.append(
            f"\"{title}\" ({_money(amount_cents)}) is on your ledger now. "
            "Staying consistent with entries like this is how clarity builds."
        )
    else:
        parts.append(
            f"Done — \"{title}\" ({_money(amount_cents)}) is saved. "
            "Even small spends matter; you're building an honest picture."
        )

    if record_type == "expense":
        budget = await db["budgets"].find_one({"userId": user["_id"], "month": month})
        current = await stats_repo.stats_by_category(db, user["_id"], month)
        total = int(current.get("totalCents", 0) or 0)
        budget_cents = int(budget.get("amountCents", 0)) if budget else 0
        if budget_cents > 0:
            remaining = budget_cents - total
            used_pct = total / budget_cents
            if remaining < 0:
                parts.append(
                    f"I know budgets can feel heavy — you're {_money(abs(remaining))} over for {month}. "
                    "You showed up anyway, and that counts."
                )
            elif used_pct >= 0.85:
                parts.append(
                    f"You've used about {used_pct:.0%} of this month's budget "
                    f"({_money(remaining)} left). A gentle pause on extras could help."
                )
            else:
                parts.append(
                    f"Budget-wise you're okay — {_money(remaining)} still available for {month}."
                )

        cat = (category_name or "").lower()
        title_l = title.lower()
        if cat == "food" or any(w in title_l for w in ("coffee", "lunch", "dinner", "food", "groceries")):
            parts.append(
                "Food adds up quietly. If this is a regular treat, a quick template on the Ledger page saves time later."
            )
        elif cat == "entertainment":
            parts.append("Joy matters too — just keeping it visible helps you balance fun and goals.")

    tip_payload = await suggestions(month=month, user=user)
    top = next((x for x in tip_payload.get("items", []) if x.get("type") != "budget"), None)
    if not top and tip_payload.get("items"):
        top = tip_payload["items"][0]
    if top:
        parts.append(f"Smart note: {top['title']} — {top['message']}")

    parts.append("I'm here if you want to talk more — how are you feeling about your spending?")
    return "\n\n".join(parts)


def _ledger_redirect_reply() -> str:
    return (
        "I don't post entries from chat — use the Ledger tab for that.\n\n"
        "Fill in the form there and I'll hop back here with tips and encouragement right after."
    )


def _guess_category_name(text: str) -> str | None:
    lowered = text.lower()
    for name, hints in _CATEGORY_HINTS.items():
        if any(h in lowered for h in hints):
            return name
    return None


async def _resolve_category_id(
    db, user_id, text: str, explicit: str | None = None
) -> tuple[str | None, str | None]:
    if explicit:
        try:
            cat = await db["categories"].find_one({"userId": user_id, "_id": ObjectId(explicit)})
            if cat:
                return str(cat["_id"]), cat["name"]
        except Exception:
            pass
    guess = _guess_category_name(text)
    if not guess:
        cat = await db["categories"].find_one({"userId": user_id})
        if cat:
            return str(cat["_id"]), cat["name"]
        return None, None
    cat = await db["categories"].find_one({"userId": user_id, "name": guess})
    if cat:
        return str(cat["_id"]), cat["name"]
    cat = await db["categories"].find_one({"userId": user_id})
    if cat:
        return str(cat["_id"]), cat["name"]
    return None, None


def _holiday_greeting(name: str) -> str | None:
    now = datetime.now()
    m, d = now.month, now.day
    if m == 12 and d >= 20:
        return f"Merry Christmas, {name}! 🎄 Kitty brought extra sparkles today~"
    if m == 1 and d <= 3:
        return f"Happy New Year, {name}! 🎊 Fresh pages, fresh hopes~"
    if m == 2 and d == 14:
        return f"Happy Valentine's, {name}! 💗 You deserve all the kindness~"
    if m == 10 and 25 <= d <= 31:
        return f"Happy Halloween, {name}! 🎃 Even spooky days need gentle budgets~"
    return None


@router.get("/greeting")
async def greeting(
    month: str | None = Query(None),
    user: dict = Depends(current_user),
):
    month = month or datetime.utcnow().strftime("%Y-%m")
    if not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})

    db = get_db()
    display_name = friendly_name(user.get("username"))
    current = await stats_repo.stats_by_category(db, user["_id"], month)
    total = int(current.get("totalCents", 0) or 0)
    budget = await db["budgets"].find_one({"userId": user["_id"], "month": month})
    budget_cents = int(budget.get("amountCents", 0)) if budget else 0

    tip_idx = datetime.now().day % len(_DAILY_TIPS)
    subtitle = f"Logged {_money(total)} this month"
    if budget_cents > 0:
        remaining = budget_cents - total
        subtitle += f" · {_money(max(remaining, 0))} budget left"

    holiday = _holiday_greeting(display_name)
    bubble = holiday or _daily_bubble_greeting(display_name)
    bubbles = _bubble_greetings(display_name, count=3)
    if holiday:
        bubbles = [holiday] + bubbles[:2]

    return {
        "month": month,
        "greeting": holiday or _time_greeting(),
        "bubbleGreeting": bubble,
        "bubbleGreetings": bubbles,
        "holidayGreeting": holiday,
        "username": display_name,
        "subtitle": subtitle,
        "tip": _DAILY_TIPS[tip_idx],
    }


@router.get("/suggestions")
async def suggestions(
    month: str | None = Query(None),
    user: dict = Depends(current_user),
):
    month = month or datetime.utcnow().strftime("%Y-%m")
    if not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})

    db = get_db()
    current = await stats_repo.stats_by_category(db, user["_id"], month)
    previous_month = _previous_month(month)
    previous = await stats_repo.stats_by_category(db, user["_id"], previous_month)
    budget = await db["budgets"].find_one({"userId": user["_id"], "month": month})
    budget_cents = int(budget.get("amountCents", 0)) if budget else 0
    total = int(current.get("totalCents", 0) or 0)
    previous_total = int(previous.get("totalCents", 0) or 0)
    items: list[dict] = []

    if budget_cents > 0:
        used_pct = total / budget_cents
        remaining = budget_cents - total
        if used_pct >= 1:
            items.append(
                _item(
                    "danger",
                    "Budget exceeded",
                    f"You are {_money(abs(remaining))} over the {month} budget.",
                    "budget",
                )
            )
        elif used_pct >= 0.8:
            items.append(
                _item(
                    "warning",
                    "Close to monthly budget",
                    f"You have used {used_pct:.0%}; {_money(remaining)} remains.",
                    "budget",
                )
            )
        else:
            items.append(
                _item(
                    "success",
                    "Budget is healthy",
                    f"You still have {_money(remaining)} left for {month}.",
                    "budget",
                )
            )
    else:
        items.append(
            _item(
                "info",
                "Set a monthly budget",
                "Add a budget on Overview so Hello Kitty can warn you early.",
                "budget",
            )
        )

    top = next(
        (x for x in current.get("items", []) if int(x.get("totalCents", 0)) > 0),
        None,
    )
    if top:
        share = int(top["totalCents"]) / total if total else 0
        items.append(
            _item(
                "info",
                f"Top category: {top['categoryName']}",
                f"{top['categoryName']} accounts for {share:.0%} of this month's spending.",
                "category",
            )
        )

    if previous_total > 0:
        delta = total - previous_total
        pct = delta / previous_total
        if pct >= 0.2:
            items.append(
                _item(
                    "warning",
                    "Spending increased",
                    f"This month is {pct:.0%} higher than {previous_month}. Review large items.",
                    "trend",
                )
            )
        elif pct <= -0.15:
            items.append(
                _item(
                    "success",
                    "Spending improved",
                    f"This month is {abs(pct):.0%} lower than {previous_month}.",
                    "trend",
                )
            )

    big_expense = await db["expenses"].find_one(
        {"userId": user["_id"], "date": {"$regex": f"^{month}-"}},
        sort=[("amountCents", -1)],
    )
    if big_expense and int(big_expense.get("amountCents", 0)) >= max(
        5000,
        total * 0.35,
    ):
        items.append(
            _item(
                "info",
                "Largest expense noticed",
                f"{big_expense['title']} is your largest item at {_money(big_expense['amountCents'])}.",
                "expense",
            )
        )

    if not items:
        items.append(
            _item(
                "info",
                "No spending yet",
                "Add expenses and Hello Kitty will generate personalized suggestions.",
            )
        )
    return {"month": month, "items": items[:5]}


@router.post("/chat")
async def chat(body: AssistantChatRequest, user: dict = Depends(current_user)):
    month = body.month or datetime.utcnow().strftime("%Y-%m")
    if not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})

    db = get_db()
    history = [{"role": t.role, "content": t.content} for t in body.history]

    return await build_chat_reply(
        text=body.message.strip(),
        user=user,
        month=month,
        db=db,
        history=history,
        money_fmt=_money,
        suggestions_fn=suggestions,
        time_greeting_fn=_time_greeting,
        ledger_redirect_fn=_ledger_redirect_reply,
    )


@router.post("/record")
async def quick_record(body: AssistantQuickRecord, user: dict = Depends(current_user)):
    db = get_db()
    record_type = body.type
    month = (body.date or datetime.utcnow().strftime("%Y-%m-%d"))[:7]
    today = body.date or datetime.utcnow().strftime("%Y-%m-%d")
    amount_cents = to_amount_cents(body.amount)
    category_id, category_name = await _resolve_category_id(
        db, user["_id"], body.title, body.categoryId
    )
    if record_type == "expense" and not category_id:
        raise HTTPException(status_code=400, detail={"error": "Category required for expenses"})
    try:
        record_id = await expenses_repo.create_expense(
            db,
            user_oid=user["_id"],
            title=body.title.strip(),
            type_=record_type,
            category_id=category_id,
            amount_cents=amount_cents,
            date=today,
            description="Hello Kitty ledger entry",
            emotion_tag=body.emotionTag,
        )
    except InvalidId:
        raise HTTPException(status_code=400, detail={"error": "Invalid categoryId"})
    except ValueError as err:
        if str(err) == "category_not_found":
            raise HTTPException(status_code=404, detail={"error": "Category not found"})
        raise
    publish_refresh(user["_id"], "ledger")
    companion = await _build_companion_reply(
        db,
        user,
        month,
        title=body.title.strip(),
        amount_cents=amount_cents,
        record_type=record_type,
        category_name=category_name,
    )
    return {
        "id": record_id,
        "title": body.title,
        "amountCents": amount_cents,
        "categoryName": category_name,
        "type": record_type,
        "date": today,
        "message": f"Posted \"{body.title}\" {_money(amount_cents)} to the ledger.",
        "companionReply": companion,
    }
