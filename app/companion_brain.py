"""Hello Kitty companion — warm, conversational replies (LLM-style without an API)."""

from __future__ import annotations

import random
import re
from datetime import datetime

from app.repositories import stats_repo

_MONEY_WORDS = frozenset(
    """
    budget money spend spent spending expense income ledger saving savings
    afford debt bill bills cost costs price prices pay paid payment wallet
    finance financial broke overspend afford
    """.split()
)


def friendly_name(username: str | None) -> str:
    raw = (username or "").strip()
    if not raw:
        return "friend"
    if "@" in raw:
        local = raw.split("@", 1)[0]
        local = re.sub(r"[._+\-]+", " ", local).strip()
        if local and len(local) >= 2 and not local.isdigit():
            word = local.split()[0].capitalize()
            if len(word) >= 2 and not re.fullmatch(r"A\d*", word, re.I):
                return word
        return "friend"
    if re.fullmatch(r"[A-Za-z0-9_.@-]+", raw) and any(c.isdigit() for c in raw):
        return "friend"
    return raw.split()[0].capitalize() if raw else "friend"


def _mentions_money(text: str) -> bool:
    words = set(re.findall(r"[a-z']+", text.lower()))
    return bool(words & _MONEY_WORDS)


def _pick(options: list[str]) -> str:
    return random.choice(options)


def _recent_user_topics(history: list[dict]) -> str:
    for turn in reversed(history[-6:]):
        if turn.get("role") == "user":
            return (turn.get("content") or "").lower()
    return ""


async def build_chat_reply(
    *,
    text: str,
    user: dict,
    month: str,
    db,
    history: list[dict],
    money_fmt,
    suggestions_fn,
    time_greeting_fn,
    ledger_redirect_fn,
) -> dict:
    """Return {reply, intent} for a single chat turn."""
    lowered = text.lower().strip()
    name = friendly_name(user.get("username"))
    recent = _recent_user_topics(history)

    if any(k in lowered for k in ("record ", "add expense", "log expense", "post entry", "log ")):
        return {"reply": ledger_redirect_fn(), "intent": "ledger_redirect"}

    # --- Identity & personality ---
    if any(
        p in lowered
        for p in (
            "your name",
            "what's your name",
            "whats your name",
            "who are you",
            "what are you",
            "introduce yourself",
        )
    ):
        return {
            "reply": _pick(
                [
                    f"I'm Hello Kitty — white cat, red bow, big heart. 🎀\n\n"
                    f"I'm not a spreadsheet robot, {name}. I'm here to listen, cheer you up, "
                    "and sprinkle in gentle money wisdom when you want it.\n\n"
                    "What would you like to talk about?",
                    "Hello! I'm Hello Kitty. Some people know me from Sanrio — here in RosyLedger "
                    f"I'm your little companion. I love kindness, pink things, and helping "
                    f"{name} feel a little lighter about life (and money).\n\n"
                    "Ask me anything — silly, serious, or somewhere in between.",
                ]
            ),
            "intent": "identity",
        }

    if any(p in lowered for p in ("how old", "your age", "where are you from", "where do you live")):
        return {
            "reply": _pick(
                [
                    "I'm timeless — like a good friendship! 🎀 I live in your corner of the app, "
                    "always a click away when you need company or a pep talk.",
                    "Age is just a number, and mine is 'forever young'! I'm from a world where "
                    "kindness comes first — and right now, that world includes chatting with you.",
                ]
            ),
            "intent": "identity",
        }

    if any(p in lowered for p in ("favorite", "favourite", "what do you like", "what do you love")):
        return {
            "reply": _pick(
                [
                    "Bowties, baking, sunny afternoons, and friends who try their best — that's me! 🎀\n\n"
                    f"What about you, {name}? What's been making you smile lately?",
                    "I love small happy things: a warm drink, a kind message, making someone feel seen. "
                    f"You checking in with me counts as one of those things, {name}.",
                ]
            ),
            "intent": "chat",
        }

    # --- Greetings ---
    if any(k in lowered for k in ("hello", "hi ", " hi", "hey", "kitty", "good morning", "good evening", "good afternoon")):
        return {
            "reply": _pick(
                [
                    f"{time_greeting_fn()} So glad you're here, {name}.\n\n"
                    "We can chat about anything — your day, how you're feeling, or your budget when you're ready. "
                    "No pressure.",
                    f"Hi {name}! 🎀 {time_greeting_fn()}\n\n"
                    "I was hoping you'd stop by. Tell me what's on your mind — I'm all ears.",
                ]
            ),
            "intent": "greeting",
        }

    if any(p in lowered for p in ("how are you", "how r u", "how're you", "you okay", "are you ok")):
        return {
            "reply": _pick(
                [
                    f"I'm doing lovely, thank you for asking! 🎀 Days are better when friends like you show up.\n\n"
                    f"How are *you* feeling today, {name}?",
                    "I'm warm and cozy in my little corner of the app — especially now that you're here.\n\n"
                    "Honestly though, I care more about how *you're* doing. Tell me?",
                ]
            ),
            "intent": "chat",
        }

    if any(k in lowered for k in ("help", "how to", "what can you", "commands")):
        return {
            "reply": (
                f"I'm like a chat buddy who also knows your ledger, {name}.\n\n"
                "• Talk to me about feelings, your day, or random thoughts\n"
                "• Ask \"how am I doing?\" or \"budget check\" when you want numbers\n"
                "• Try \"if I skip 3 coffees how much do I save?\" for a mini simulation\n"
                "• Ask \"how many takeouts can I afford?\" for a rough meal count\n"
                "• Say \"give me tips\" for gentle advice\n"
                "• Use the **Ledger** tab to post entries — I'll celebrate with you after\n\n"
                "There's no wrong way to start. What's on your mind?"
            ),
            "intent": "help",
        }

    sim = await _try_budget_simulator(lowered, name, db, user, month, money_fmt)
    if sim:
        return sim
    meal = await _try_meal_budget_query(lowered, name, db, user, month, money_fmt)
    if meal:
        return meal

    # --- Emotional support (priority, warm) ---
    if any(k in lowered for k in ("stress", "worried", "anxious", "scared", "overwhelmed", "hard time", "can't cope", "crying")):
        reply = _pick(
            [
                f"Oh {name}… come here. 🎀 What you're feeling is valid — money and life can both be heavy.",
                f"I'm really glad you told me, {name}. You don't have to carry this alone in your head.",
                f"That sounds exhausting, {name}. Thank you for trusting me with it.",
            ]
        )
        if _mentions_money(lowered) or _mentions_money(recent):
            budget = await db["budgets"].find_one({"userId": user["_id"], "month": month})
            current = await stats_repo.stats_by_category(db, user["_id"], month)
            total = int(current.get("totalCents", 0) or 0)
            budget_cents = int(budget.get("amountCents", 0)) if budget else 0
            if budget_cents > 0 and total <= budget_cents:
                reply += (
                    f"\n\nFor what it's worth — you're still inside your budget this month "
                    f"({money_fmt(budget_cents - total)} left). That's not everything, but it's something."
                )
        reply += (
            "\n\nYou showed up today. That already takes courage. "
            "Want to tell me more, or would a distraction help?"
        )
        return {"reply": reply, "intent": "support"}

    if any(k in lowered for k in ("guilty", "bad at money", "mess up", "failed", "ashamed", "embarrassed")):
        return {
            "reply": _pick(
                [
                    f"{name}, listen — one rough week doesn't define you. 🎀\n\n"
                    "People who never look at their spending feel 'fine' until they're not. "
                    "You're already ahead by caring.\n\n"
                    "Be as kind to yourself as you'd be to a friend. What happened?",
                    f"Hey… guilt is loud, but it's not the truth. You're human, {name}.\n\n"
                    "Budgets are maps, not report cards. You get to try again every single day.\n\n"
                    "I'm not disappointed in you. Not even a little.",
                ]
            ),
            "intent": "support",
        }

    if any(k in lowered for k in ("sad", "lonely", "depressed", "down", "upset", "hurt")):
        return {
            "reply": _pick(
                [
                    f"I'm sorry you're going through this, {name}. 🎀\n\n"
                    "You deserve softness right now — not lectures. I'm here to listen.",
                    f"Sending you a virtual hug, {name}. Some days are just hard.\n\n"
                    "If you want to vent, I'm listening. If you want distraction, we can talk about anything else too.",
                ]
            ),
            "intent": "support",
        }

    if any(k in lowered for k in ("tired", "exhausted", "burned out", "burnt out", "no energy")):
        return {
            "reply": (
                f"Rest is productive too, {name}. 🎀\n\n"
                "You don't have to optimize every moment. Even Hello Kitty takes naps.\n\n"
                "Is it life in general, or something about money that's draining you?"
            ),
            "intent": "support",
        }

    if any(k in lowered for k in ("happy", "excited", "great day", "good day", "amazing", "won", "celebrate")):
        return {
            "reply": _pick(
                [
                    f"Yay!! I love this energy, {name}! 🎀 Tell me everything — what happened?",
                    f"That makes me so happy to hear! 🎀 You deserve good days, {name}. What was the best part?",
                ]
            ),
            "intent": "support",
        }

    if any(k in lowered for k in ("bored", "nothing to do", "entertain me")):
        return {
            "reply": (
                f"Boredom is underrated — it's where ideas show up, {name}. 🎀\n\n"
                "We could: swap fun facts, dream up a tiny treat budget, or you could tell me "
                "about the last thing that made you laugh. Your pick!"
            ),
            "intent": "chat",
        }

    # --- Thanks / affection ---
    if any(k in lowered for k in ("thank", "thanks", "love you", "luv u", "appreciate")):
        return {
            "reply": _pick(
                [
                    f"You're so welcome, {name}. 🎀 Knowing I helped even a little makes my whole day.",
                    f"Aww, {name}! That's so sweet. I'm always on your team — win or learn.",
                    f"Thank *you* for being here. This little chat corner is my favorite when it's you.",
                ]
            ),
            "intent": "thanks",
        }

    if any(k in lowered for k in ("cute", "adorable", "pretty", "beautiful")):
        return {
            "reply": _pick(
                [
                    f"You're making me blush! 🎀 But honestly, {name} — taking care of yourself is what's really beautiful.",
                    "Eee, thank you! 🎀 You're pretty wonderful yourself for saying that.",
                ]
            ),
            "intent": "thanks",
        }

    if any(k in lowered for k in ("bye", "goodbye", "see you", "gtg", "gotta go")):
        return {
            "reply": _pick(
                [
                    f"Bye for now, {name}! 🎀 I'll be right here whenever you need me.",
                    f"See you soon, {name}! Take something kind with you today.",
                ]
            ),
            "intent": "bye",
        }

    # --- Money intents (only when clearly asked) ---
    if any(
        k in lowered
        for k in (
            "how much",
            "this month",
            "total spend",
            "spending total",
            "spent so far",
            "how am i doing",
            "my spending",
            "spending look",
        )
    ):
        current = await stats_repo.stats_by_category(db, user["_id"], month)
        total = int(current.get("totalCents", 0) or 0)
        count = await db["expenses"].count_documents(
            {"userId": user["_id"], "date": {"$regex": f"^{month}-"}, "type": {"$ne": "income"}}
        )
        top = next(
            (x for x in current.get("items", []) if int(x.get("totalCents", 0)) > 0),
            None,
        )
        opener = _pick(
            [
                f"Okay {name}, let's look together — no judgment, just facts. 🎀",
                f"Here's your snapshot, {name}. Remember: numbers inform you, they don't define you.",
            ]
        )
        stats = f"\n\n{month}: {count} expense(s), {money_fmt(total)} total."
        if top:
            stats += f"\nBiggest category: {top['categoryName']} ({money_fmt(top['totalCents'])})."
        stats += "\n\nHow does that land emotionally for you?"
        return {"reply": opener + stats, "intent": "stats"}

    if any(k in lowered for k in ("budget", "remaining", "left to spend", "budget check")):
        budget = await db["budgets"].find_one({"userId": user["_id"], "month": month})
        current = await stats_repo.stats_by_category(db, user["_id"], month)
        total = int(current.get("totalCents", 0) or 0)
        budget_cents = int(budget.get("amountCents", 0)) if budget else 0
        if budget_cents <= 0:
            return {
                "reply": (
                    f"No budget set yet, {name} — and that's okay. 🎀\n\n"
                    "When you're ready, add one on Overview. Until then, I'm still here to chat."
                ),
                "intent": "budget",
            }
        remaining = budget_cents - total
        used_pct = total / budget_cents
        if remaining < 0:
            reply = (
                f"I won't sugarcoat it — you're {money_fmt(abs(remaining))} over for {month}. 🎀\n\n"
                f"But {name}, you're *looking* at it. That already puts you ahead of avoid-and-hope.\n\n"
                "Want to talk through how you're feeling about it?"
            )
        elif used_pct >= 0.8:
            reply = (
                f"You're at {used_pct:.0%} of your budget — {money_fmt(remaining)} left. 🎀\n\n"
                "Getting close to the line can feel tense. Be gentle with yourself this week."
            )
        else:
            reply = (
                f"You're in decent shape: {money_fmt(remaining)} left of {money_fmt(budget_cents)} "
                f"({used_pct:.0%} used). 🎀\n\n"
                f"Nice work staying aware, {name}."
            )
        return {"reply": reply, "intent": "budget"}

    if any(k in lowered for k in ("tip", "tips", "suggest", "advice", "recommend", "insight", "encourage")):
        payload = await suggestions_fn(month=month, user=user)
        lines = [f"• {x['title']}: {x['message']}" for x in payload["items"][:3]]
        opener = _pick(
            [
                f"I peeked at your ledger with love, not judgment. 🎀 Here's what I notice:",
                f"Some gentle thoughts for you, {name}:",
            ]
        )
        return {
            "reply": opener + "\n\n" + "\n".join(lines),
            "intent": "suggestions",
            "suggestions": payload["items"],
        }

    # --- Follow-ups using history ---
    if any(p in lowered for p in ("tell me more", "go on", "and then", "what else", "continue")):
        if _mentions_money(recent):
            payload = await suggestions_fn(month=month, user=user)
            if payload.get("items"):
                item = payload["items"][0]
                return {
                    "reply": (
                        f"Sure, {name}. 🎀 Digging a bit deeper — {item['title']}: {item['message']}\n\n"
                        "Does that resonate, or feel off?"
                    ),
                    "intent": "followup",
                }
        return {
            "reply": _pick(
                [
                    f"Of course! 🎀 What's been weighing on you most lately, {name}?",
                    f"I'm here — take your time. What part would you like to unpack?",
                ]
            ),
            "intent": "followup",
        }

    if lowered in {"yes", "yeah", "yep", "sure", "ok", "okay"} or lowered.startswith("yes ") or lowered.startswith("yeah "):
        return {
            "reply": _pick(
                [
                    f"Okay! 🎀 What's the main thing on your heart right now, {name}?",
                    "I'm listening — go ahead, no rush.",
                ]
            ),
            "intent": "followup",
        }

    if lowered in {"no", "nah", "not really", "nope"}:
        return {
            "reply": _pick(
                [
                    f"That's totally fine, {name}. 🎀 We can just sit here quietly together, or talk about something lighter.",
                    "No pressure at all. Want to switch topics? I'm good either way.",
                ]
            ),
            "intent": "followup",
        }

    # --- Generic conversational fallback (NO ledger dump) ---
    return await _conversational_fallback(
        text=text,
        lowered=lowered,
        name=name,
        month=month,
        user=user,
        db=db,
        money_fmt=money_fmt,
        suggestions_fn=suggestions_fn,
    )


async def _conversational_fallback(
    *,
    text: str,
    lowered: str,
    name: str,
    month: str,
    user: dict,
    db,
    money_fmt,
    suggestions_fn,
) -> dict:
    """Natural, varied reply — only touches ledger if the user brought up money."""
    if "?" in text:
        reflective = _pick(
            [
                f"That's a thoughtful question, {name}. 🎀 I don't have every answer — but I care about what made you ask.",
                f"Hmm, good one! 🎀 I'm a feelings-first kind of cat. What's your gut telling you?",
                f"I love that you're curious, {name}. Tell me what you're really wondering about underneath that?",
            ]
        )
        if _mentions_money(lowered):
            reflective += "\n\n(Sounds money-adjacent — say \"budget check\" anytime if you want specifics.)"
        return {"reply": reflective, "intent": "chat"}

    if _mentions_money(lowered):
        payload = await suggestions_fn(month=month, user=user)
        item = payload["items"][0] if payload.get("items") else None
        reply = _pick(
            [
                f"I hear you, {name}. Money stuff can stir up a lot. 🎀",
                f"Thanks for sharing that, {name}. Let's take it one breath at a time. 🎀",
            ]
        )
        if item:
            reply += f"\n\nIf it helps — one thing from your ledger: {item['message']}"
        reply += "\n\nWant to talk feelings, or want the numbers?"
        return {"reply": reply, "intent": "chat"}

    # Pure small talk — no ledger
    templates = [
        (
            f"Mm, I hear you, {name}. 🎀 "
            "Sometimes I think the bravest thing is just showing up and saying what's on your mind — like you did."
        ),
        (
            f"Thanks for telling me that, {name}. 🎀 "
            "I'm not here to judge — I'm here to keep you company."
        ),
        (
            f"You know what? Chatting with you is the best part of my day, {name}. 🎀 "
            "What's been on your mind besides money?"
        ),
        (
            f"That makes sense to me, {name}. 🎀 "
            "Life's a lot sometimes. I'm glad you're not carrying it all alone."
        ),
        (
            f"Oh {name}… 🎀 "
            "I wish I could offer you a warm cookie through the screen. "
            "Until then — I'm listening."
        ),
        (
            f"I get it, {name}. 🎀 "
            "Want to vent more, or should we talk about something that makes you happy?"
        ),
    ]
    hour = datetime.now().hour
    if hour >= 22 or hour < 6:
        templates.append(
            f"It's getting late, {name}. 🎀 However today went — you made it through. That counts."
        )

    return {"reply": _pick(templates), "intent": "chat"}


async def _try_budget_simulator(
    lowered: str, name: str, db, user: dict, month: str, money_fmt
) -> dict | None:
    """Rough 'skip N coffees' style simulation."""
    triggers = (
        "skip",
        "less ",
        "fewer",
        "cut back",
        "save if",
        "少喝",
        "少点",
        "simulator",
        "simulate",
    )
    if not any(t in lowered for t in triggers):
        return None
    count_match = re.search(r"(\d+)\s*(?:cup|cups|coffee|times|杯|次)", lowered)
    amount_match = re.search(r"\$?\s*(\d+(?:\.\d{1,2})?)", lowered)
    count = int(count_match.group(1)) if count_match else 3
    unit_cents = int(float(amount_match.group(1)) * 100) if amount_match else 550
    saved = count * unit_cents
    year_saved = saved * 52
    return {
        "reply": (
            f"Let's imagine together, {name}~ 🎀\n\n"
            f"If you skipped {count} × {money_fmt(unit_cents)} treats per week, "
            f"that's about **{money_fmt(saved)}** freed up weekly — "
            f"roughly **{money_fmt(year_saved)}** over a year.\n\n"
            "It's not about guilt — just seeing what tiny shifts could grow into. "
            "Want to set a wishlist goal with that number?"
        ),
        "intent": "simulator",
    }


async def _try_meal_budget_query(
    lowered: str, name: str, db, user: dict, month: str, money_fmt
) -> dict | None:
    """Answer 'how many takeouts can I afford' using remaining budget."""
    triggers = (
        "how many",
        "how much left",
        "can i afford",
        "takeout",
        "take away",
        "外卖",
        "还能吃",
        "几次",
    )
    if not any(t in lowered for t in triggers):
        return None
    budget = await db["budgets"].find_one({"userId": user["_id"], "month": month})
    current = await stats_repo.stats_by_category(db, user["_id"], month)
    total = int(current.get("totalCents", 0) or 0)
    budget_cents = int(budget.get("amountCents", 0)) if budget else 0
    if budget_cents <= 0:
        return {
            "reply": (
                f"I'd love to help count meals, {name}, but there's no budget set for {month} yet. "
                "Add one on Overview and I can do the math~"
            ),
            "intent": "data_query",
        }
    remaining = budget_cents - total
    meal_match = re.search(r"\$?\s*(\d+(?:\.\d{1,2})?)", lowered)
    meal_cents = int(float(meal_match.group(1)) * 100) if meal_match else 1500
    if remaining <= 0:
        return {
            "reply": (
                f"Budget's tight for {month} — about {money_fmt(abs(remaining))} over. "
                "No shame; maybe fewer takeouts or a lighter option this week?"
            ),
            "intent": "data_query",
        }
    meals = max(remaining // meal_cents, 0)
    return {
        "reply": (
            f"Based on your {month} budget, you have about {money_fmt(remaining)} left. "
            f"At ~{money_fmt(meal_cents)} per takeout, that's roughly **{meals} meals** — "
            "give or take. Treat yourself mindfully~ 🎀"
        ),
        "intent": "data_query",
    }
