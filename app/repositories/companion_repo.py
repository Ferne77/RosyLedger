"""Companion features: mood, wishlist, achievements, engagement profile."""

from __future__ import annotations

from datetime import datetime, timedelta

from bson import ObjectId

from app.repositories import expenses_repo, stats_repo

VALID_MOODS = frozenset({"happy", "neutral", "low"})
VALID_EMOTIONS = frozenset({"happy", "impulse", "necessary", ""})

ACHIEVEMENT_DEFS: dict[str, dict] = {
    "first_expense": {
        "title": "First step",
        "description": "Log your first ledger entry",
        "sticker": "star",
        "emoji": "⭐",
    },
    "first_budget": {
        "title": "Planner",
        "description": "Set a monthly budget",
        "sticker": "ribbon",
        "emoji": "🎀",
    },
    "streak_7": {
        "title": "Week warrior",
        "description": "Log expenses 7 days in a row",
        "sticker": "fire",
        "emoji": "🔥",
    },
    "no_impulse_week": {
        "title": "Mindful week",
        "description": "Zero impulse spending this week",
        "sticker": "leaf",
        "emoji": "🌿",
    },
    "savings_20": {
        "title": "Super saver",
        "description": "Savings rate over 20% this month",
        "sticker": "piggy",
        "emoji": "🐷",
    },
    "first_wish": {
        "title": "Dreamer",
        "description": "Add your first wishlist item",
        "sticker": "cloud",
        "emoji": "☁️",
    },
    "first_mood": {
        "title": "Feeling check",
        "description": "Complete your first mood check-in",
        "sticker": "sparkle",
        "emoji": "✨",
    },
    "mood_streak_7": {
        "title": "Heart open",
        "description": "Mood check-in 7 days in a row",
        "sticker": "heart",
        "emoji": "💗",
    },
}

THEME_DEFS: dict[str, dict] = {
    "rosy": {"label": "Rosy default", "unlock": None, "emoji": "🌸"},
    "sakura": {"label": "Sakura blush", "unlock": None, "emoji": "🌺"},
    "cotton": {"label": "Cotton candy", "unlock": None, "emoji": "🍭"},
    "lavender": {"label": "Lavender dream", "unlock": "streak_7", "emoji": "💜"},
    "mint": {"label": "Mint candy", "unlock": "no_impulse_week", "emoji": "🍬"},
    "starlight": {"label": "Starlight", "unlock": "savings_20", "emoji": "🌟"},
}

MOOD_REPLIES: dict[str, tuple[str, ...]] = {
    "happy": (
        "Your good mood is contagious! Let's keep that sparkle going today~",
        "Love seeing you happy! Maybe note what made today special in your ledger notes?",
        "Yay~ when you're feeling good, small wins feel even sweeter!",
    ),
    "neutral": (
        "Neutral days are totally okay. Steady is its own kind of strength.",
        "Some days are just… days. I'm glad you're here anyway.",
        "No pressure to feel amazing — showing up is already enough.",
    ),
    "low": (
        "I'm sending you the biggest hug. You don't have to be productive to deserve kindness.",
        "Rough days happen. Your worth isn't measured by your spending or your mood.",
        "Thank you for telling me. Be gentle with yourself — I'm right here with you.",
    ),
}


def _today() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def _week_start() -> str:
    now = datetime.utcnow()
    start = now - timedelta(days=now.weekday())
    return start.strftime("%Y-%m-%d")


def _week_end() -> str:
    now = datetime.utcnow()
    start = now - timedelta(days=now.weekday())
    end = start + timedelta(days=6)
    return end.strftime("%Y-%m-%d")


async def get_or_create_profile(db, user_oid: ObjectId) -> dict:
    doc = await db["companionProfiles"].find_one({"userId": user_oid})
    if doc:
        return doc
    now = datetime.utcnow()
    doc = {
        "userId": user_oid,
        "theme": "rosy",
        "achievements": [],
        "stickers": [],
        "loginStreak": 0,
        "lastLoginDate": "",
        "recordStreak": 0,
        "lastRecordDate": "",
        "moodStreak": 0,
        "lastMoodDate": "",
        "birthday": "",
        "createdAt": now,
        "updatedAt": now,
    }
    await db["companionProfiles"].insert_one(doc)
    return doc


def _serialize_profile(doc: dict) -> dict:
    achievements = doc.get("achievements") or []
    unlocked = {a["id"]: a for a in achievements if isinstance(a, dict)}
    catalog = []
    for aid, meta in ACHIEVEMENT_DEFS.items():
        entry = unlocked.get(aid)
        catalog.append(
            {
                "id": aid,
                "title": meta["title"],
                "description": meta["description"],
                "sticker": meta["sticker"],
                "emoji": meta["emoji"],
                "unlocked": bool(entry),
                "unlockedAt": entry.get("unlockedAt") if entry else None,
            }
        )
    themes = []
    for tid, tmeta in THEME_DEFS.items():
        req = tmeta.get("unlock")
        themes.append(
            {
                "id": tid,
                "label": tmeta["label"],
                "emoji": tmeta["emoji"],
                "unlocked": req is None or req in unlocked,
                "active": doc.get("theme") == tid,
            }
        )
    return {
        "theme": doc.get("theme") or "rosy",
        "stickers": doc.get("stickers") or [],
        "loginStreak": int(doc.get("loginStreak") or 0),
        "recordStreak": int(doc.get("recordStreak") or 0),
        "moodStreak": int(doc.get("moodStreak") or 0),
        "birthday": doc.get("birthday") or "",
        "achievements": catalog,
        "themes": themes,
    }


async def touch_login(db, user_oid: ObjectId) -> dict:
    profile = await get_or_create_profile(db, user_oid)
    today = _today()
    last = profile.get("lastLoginDate") or ""
    streak = int(profile.get("loginStreak") or 0)
    if last == today:
        return _serialize_profile(profile)
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    if last == yesterday:
        streak += 1
    else:
        streak = 1
    await db["companionProfiles"].update_one(
        {"userId": user_oid},
        {
            "$set": {
                "loginStreak": streak,
                "lastLoginDate": today,
                "updatedAt": datetime.utcnow(),
            }
        },
    )
    profile["loginStreak"] = streak
    profile["lastLoginDate"] = today
    return _serialize_profile(profile)


async def get_mood_today(db, user_oid: ObjectId) -> dict | None:
    doc = await db["moodCheckins"].find_one({"userId": user_oid, "date": _today()})
    if not doc:
        return None
    return {"date": doc["date"], "mood": doc["mood"], "kittyReply": doc.get("kittyReply") or ""}


async def save_mood(db, user_oid: ObjectId, mood: str) -> dict:
    if mood not in VALID_MOODS:
        raise ValueError("invalid_mood")
    import random

    today = _today()
    reply = random.choice(MOOD_REPLIES[mood])
    now = datetime.utcnow()
    await db["moodCheckins"].update_one(
        {"userId": user_oid, "date": today},
        {
            "$set": {"mood": mood, "kittyReply": reply, "updatedAt": now},
            "$setOnInsert": {"userId": user_oid, "date": today, "createdAt": now},
        },
        upsert=True,
    )
    profile = await get_or_create_profile(db, user_oid)
    last_mood = profile.get("lastMoodDate") or ""
    mood_streak = int(profile.get("moodStreak") or 0)
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    if last_mood == today:
        pass
    elif last_mood == yesterday:
        mood_streak += 1
    else:
        mood_streak = 1
    await db["companionProfiles"].update_one(
        {"userId": user_oid},
        {
            "$set": {
                "moodStreak": mood_streak,
                "lastMoodDate": today,
                "updatedAt": now,
            }
        },
    )
    new_achievements = await _evaluate_achievements(db, user_oid)
    return {"date": today, "mood": mood, "kittyReply": reply, "newAchievements": new_achievements}


async def list_wishes(db, user_oid: ObjectId) -> list[dict]:
    rows = (
        await db["wishlist"]
        .find({"userId": user_oid})
        .sort("createdAt", -1)
        .to_list(100)
    )
    out = []
    for r in rows:
        target = int(r.get("targetAmountCents") or 0)
        saved = int(r.get("savedAmountCents") or 0)
        remaining = max(target - saved, 0)
        out.append(
            {
                "id": str(r["_id"]),
                "title": r.get("title") or "",
                "targetAmountCents": target,
                "savedAmountCents": saved,
                "remainingCents": remaining,
                "progress": min(saved / target, 1.0) if target > 0 else 0,
                "kittyHint": f"Just {_money(remaining)} more to go~" if remaining > 0 else "You did it!",
                "createdAt": r.get("createdAt"),
            }
        )
    return out


def _money(cents: int) -> str:
    return f"${cents / 100:.2f}"


async def create_wish(db, user_oid: ObjectId, title: str, target_cents: int) -> str:
    now = datetime.utcnow()
    doc = {
        "userId": user_oid,
        "title": title.strip(),
        "targetAmountCents": target_cents,
        "savedAmountCents": 0,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db["wishlist"].insert_one(doc)
    await _evaluate_achievements(db, user_oid)
    return str(result.inserted_id)


async def update_wish_saved(
    db, user_oid: ObjectId, wish_oid: ObjectId, saved_cents: int
) -> bool:
    result = await db["wishlist"].update_one(
        {"_id": wish_oid, "userId": user_oid},
        {"$set": {"savedAmountCents": saved_cents, "updatedAt": datetime.utcnow()}},
    )
    return result.matched_count > 0


async def delete_wish(db, user_oid: ObjectId, wish_oid: ObjectId) -> bool:
    result = await db["wishlist"].delete_one({"_id": wish_oid, "userId": user_oid})
    return result.deleted_count > 0


async def _has_expense(db, user_oid: ObjectId) -> bool:
    doc = await db["expenses"].find_one(
        {"userId": user_oid, **expenses_repo.active_filter()}
    )
    return doc is not None


async def _has_budget(db, user_oid: ObjectId) -> bool:
    doc = await db["budgets"].find_one({"userId": user_oid})
    return doc is not None


async def _record_streak(db, user_oid: ObjectId) -> int:
    profile = await get_or_create_profile(db, user_oid)
    return int(profile.get("recordStreak") or 0)


async def _update_record_streak(db, user_oid: ObjectId, date: str) -> None:
    profile = await get_or_create_profile(db, user_oid)
    last = profile.get("lastRecordDate") or ""
    streak = int(profile.get("recordStreak") or 0)
    if last == date:
        return
    try:
        last_dt = datetime.strptime(last, "%Y-%m-%d") if last else None
        cur_dt = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        last_dt = None
        cur_dt = datetime.utcnow()
    if last_dt and (cur_dt - last_dt).days == 1:
        streak += 1
    elif last != date:
        streak = 1
    await db["companionProfiles"].update_one(
        {"userId": user_oid},
        {
            "$set": {
                "recordStreak": streak,
                "lastRecordDate": date,
                "updatedAt": datetime.utcnow(),
            }
        },
    )


async def on_expense_created(db, user_oid: ObjectId, date: str) -> list[dict]:
    await _update_record_streak(db, user_oid, date)
    return await _evaluate_achievements(db, user_oid)


async def _unlock(db, user_oid: ObjectId, achievement_id: str) -> dict | None:
    if achievement_id not in ACHIEVEMENT_DEFS:
        return None
    profile = await get_or_create_profile(db, user_oid)
    existing = {a.get("id") for a in (profile.get("achievements") or [])}
    if achievement_id in existing:
        return None
    meta = ACHIEVEMENT_DEFS[achievement_id]
    now = datetime.utcnow()
    entry = {"id": achievement_id, "unlockedAt": now.isoformat() + "Z"}
    sticker = meta.get("sticker")
    update: dict = {
        "$push": {"achievements": entry},
        "$set": {"updatedAt": now},
    }
    if sticker:
        update["$addToSet"] = {"stickers": sticker}
    await db["companionProfiles"].update_one({"userId": user_oid}, update)
    return {
        "id": achievement_id,
        "title": meta["title"],
        "description": meta["description"],
        "emoji": meta["emoji"],
        "sticker": meta["sticker"],
    }


async def _evaluate_achievements(db, user_oid: ObjectId) -> list[dict]:
    unlocked: list[dict] = []
    profile = await get_or_create_profile(db, user_oid)

    if await _has_expense(db, user_oid):
        item = await _unlock(db, user_oid, "first_expense")
        if item:
            unlocked.append(item)
    if await _has_budget(db, user_oid):
        item = await _unlock(db, user_oid, "first_budget")
        if item:
            unlocked.append(item)

    mood_count = await db["moodCheckins"].count_documents({"userId": user_oid})
    if mood_count >= 1:
        item = await _unlock(db, user_oid, "first_mood")
        if item:
            unlocked.append(item)
    if int(profile.get("moodStreak") or 0) >= 7:
        item = await _unlock(db, user_oid, "mood_streak_7")
        if item:
            unlocked.append(item)

    streak = int(profile.get("recordStreak") or 0)
    if streak >= 7:
        item = await _unlock(db, user_oid, "streak_7")
        if item:
            unlocked.append(item)

    wish_count = await db["wishlist"].count_documents({"userId": user_oid})
    if wish_count >= 1:
        item = await _unlock(db, user_oid, "first_wish")
        if item:
            unlocked.append(item)

    week_start = _week_start()
    week_end = _week_end()
    impulse_count = await db["expenses"].count_documents(
        {
            "userId": user_oid,
            "type": "expense",
            "emotionTag": "impulse",
            "date": {"$gte": week_start, "$lte": week_end},
            **expenses_repo.active_filter(),
        }
    )
    expense_week_count = await db["expenses"].count_documents(
        {
            "userId": user_oid,
            "type": "expense",
            "date": {"$gte": week_start, "$lte": week_end},
            **expenses_repo.active_filter(),
        }
    )
    if expense_week_count >= 3 and impulse_count == 0:
        item = await _unlock(db, user_oid, "no_impulse_week")
        if item:
            unlocked.append(item)

    month = datetime.utcnow().strftime("%Y-%m")
    summary = await stats_repo.money_summary(db, user_oid, month)
    income = int(summary.get("incomeCents") or 0)
    expense = int(summary.get("expenseCents") or 0)
    if income > 0:
        savings_rate = (income - expense) / income
        if savings_rate >= 0.2:
            item = await _unlock(db, user_oid, "savings_20")
            if item:
                unlocked.append(item)

    return unlocked


async def set_theme(db, user_oid: ObjectId, theme_id: str) -> dict:
    if theme_id not in THEME_DEFS:
        raise ValueError("invalid_theme")
    profile = await get_or_create_profile(db, user_oid)
    req = THEME_DEFS[theme_id].get("unlock")
    if req:
        unlocked = {a.get("id") for a in (profile.get("achievements") or [])}
        if req not in unlocked:
            raise ValueError("theme_locked")
    await db["companionProfiles"].update_one(
        {"userId": user_oid},
        {"$set": {"theme": theme_id, "updatedAt": datetime.utcnow()}},
    )
    return {"theme": theme_id}


async def emotion_breakdown(db, user_oid: ObjectId, month: str) -> dict:
    pipeline = [
        {
            "$match": {
                "userId": user_oid,
                "type": "expense",
                "date": {"$regex": f"^{month}-"},
                **expenses_repo.active_filter(),
            }
        },
        {
            "$group": {
                "_id": {"$ifNull": ["$emotionTag", "unset"]},
                "totalCents": {"$sum": "$amountCents"},
                "count": {"$sum": 1},
            }
        },
    ]
    rows = await db["expenses"].aggregate(pipeline).to_list(10)
    items = []
    total = 0
    for r in rows:
        cents = int(r.get("totalCents") or 0)
        total += cents
        tag = r["_id"] if r["_id"] != "unset" else "unset"
        items.append({"emotion": tag, "totalCents": cents, "count": int(r["count"])})
    items.sort(key=lambda x: x["totalCents"], reverse=True)
    top = items[0]["emotion"] if items else None
    labels = {
        "happy": "Happy spending",
        "impulse": "Impulse",
        "necessary": "Necessary",
        "unset": "No mood tagged",
    }
    return {
        "month": month,
        "items": items,
        "totalCents": total,
        "topEmotion": top,
        "topLabel": labels.get(top or "", "—"),
    }


async def weekly_report(db, user_oid: ObjectId) -> dict:
    week_start = _week_start()
    week_end = _week_end()
    match = {
        "userId": user_oid,
        "date": {"$gte": week_start, "$lte": week_end},
        **expenses_repo.active_filter(),
    }
    expenses = await db["expenses"].find(match).to_list(500)
    spent = sum(int(x.get("amountCents") or 0) for x in expenses if x.get("type") != "income")
    income = sum(int(x.get("amountCents") or 0) for x in expenses if x.get("type") == "income")
    saved = max(income - spent, 0)
    impulse = sum(
        int(x.get("amountCents") or 0)
        for x in expenses
        if x.get("type") == "expense" and x.get("emotionTag") == "impulse"
    )
    moods = (
        await db["moodCheckins"]
        .find({"userId": user_oid, "date": {"$gte": week_start, "$lte": week_end}})
        .sort("date", 1)
        .to_list(7)
    )
    mood_summary = moods[-1]["mood"] if moods else None

    import random

    if saved > 0 and impulse == 0:
        kitty = random.choice(
            [
                "What a gentle week! You saved money and kept impulses in check — proud of you~",
                "This week felt balanced. Small steps really do add up!",
            ]
        )
    elif impulse > spent * 0.3:
        kitty = random.choice(
            [
                "Impulse spending showed up this week — no shame. Awareness is the first step.",
                "A few impulse moments, but you tracked them. That honesty matters more than perfection.",
            ]
        )
    elif spent == 0:
        kitty = "Quiet week on the ledger — rest is allowed too!"
    else:
        kitty = random.choice(
            [
                f"You logged {_money(spent)} this week. Showing up to your ledger is a win.",
                "Another week documented — you're building a clearer picture of your life.",
            ]
        )

    return {
        "weekStart": week_start,
        "weekEnd": week_end,
        "spentCents": spent,
        "incomeCents": income,
        "savedCents": saved,
        "impulseCents": impulse,
        "entryCount": len(expenses),
        "moodDays": len(moods),
        "latestMood": mood_summary,
        "kittyReview": kitty,
        "isSunday": datetime.utcnow().weekday() == 6,
    }


async def widget_snapshot(db, user_oid: ObjectId) -> dict:
    month = datetime.utcnow().strftime("%Y-%m")
    budget = await db["budgets"].find_one({"userId": user_oid, "month": month})
    stats = await stats_repo.stats_by_category(db, user_oid, month)
    total = int(stats.get("totalCents") or 0)
    budget_cents = int(budget.get("amountCents") or 0) if budget else 0
    remaining = budget_cents - total if budget_cents > 0 else None
    import random

    tips = (
        "One kind step at a time~",
        "Your budget buddy is here!",
        "Small wins count too!",
    )
    return {
        "month": month,
        "spentCents": total,
        "budgetCents": budget_cents,
        "remainingCents": remaining,
        "kittyLine": random.choice(tips),
    }
