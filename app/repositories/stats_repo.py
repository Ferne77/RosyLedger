"""
Statistics aggregation: category totals (all-time or per month) and monthly rollups for trends.
"""

from datetime import datetime


def _active_match(user_oid) -> dict:
    return {
        "userId": user_oid,
        "$or": [{"deletedAt": {"$exists": False}}, {"deletedAt": None}],
    }


def _months_back(end_month: str, count: int) -> list[str]:
    y, m = map(int, end_month.split("-"))
    cur = datetime(y, m, 1)
    out = []
    for _ in range(count):
        out.insert(0, f"{cur.year:04d}-{cur.month:02d}")
        if cur.month == 1:
            cur = cur.replace(year=cur.year - 1, month=12)
        else:
            cur = cur.replace(month=cur.month - 1)
    return out

async def _merge_expense_buckets_with_categories(db, user_oid, by_cat: list) -> dict:
    """Map aggregate rows onto all category docs (zeros where missing)."""
    all_cats = (
        await db["categories"]
        .find({"userId": user_oid})
        .sort("name", 1)
        .to_list(10_000)
    )
    by_id = {r["categoryId"]: r for r in by_cat}
    items = []
    for c in all_cats:
        cid = str(c["_id"])
        row = by_id.get(cid)
        total = int(row.get("totalCents", 0)) if row else 0
        items.append(
            {
                "categoryId": cid,
                "categoryName": c["name"],
                "totalCents": total,
            }
        )
    items.sort(
        key=lambda x: (-(x["totalCents"] or 0), x["categoryName"]),
    )
    total_cents = sum(int(r["totalCents"] or 0) for r in items)
    return {"totalCents": total_cents, "items": items}


async def stats_by_category_all(db, user_oid) -> dict:
    """Sum expenses per category across all time."""
    by_cat = await db["expenses"].aggregate(
        [
            {"$match": {**_active_match(user_oid), "type": {"$ne": "income"}}},
            {"$group": {"_id": "$categoryId", "totalCents": {"$sum": "$amountCents"}}},
            {
                "$lookup": {
                    "from": "categories",
                    "localField": "_id",
                    "foreignField": "_id",
                    "as": "cat",
                }
            },
            {"$unwind": {"path": "$cat", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "categoryId": {"$toString": "$_id"},
                    "categoryName": "$cat.name",
                    "totalCents": {"$ifNull": ["$totalCents", 0]},
                }
            },
        ]
    ).to_list(10_000)
    return await _merge_expense_buckets_with_categories(db, user_oid, by_cat)


async def stats_by_category(db, user_oid, month: str) -> dict:
    by_cat = await db["expenses"].aggregate(
        [
            {
                "$match": {
                    **_active_match(user_oid),
                    "type": {"$ne": "income"},
                    "date": {"$regex": f"^{month}-"},
                }
            },
            {"$group": {"_id": "$categoryId", "totalCents": {"$sum": "$amountCents"}}},
            {
                "$lookup": {
                    "from": "categories",
                    "localField": "_id",
                    "foreignField": "_id",
                    "as": "cat",
                }
            },
            {"$unwind": {"path": "$cat", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "categoryId": {"$toString": "$_id"},
                    "categoryName": "$cat.name",
                    "totalCents": {"$ifNull": ["$totalCents", 0]},
                }
            },
        ]
    ).to_list(10_000)
    return await _merge_expense_buckets_with_categories(db, user_oid, by_cat)


async def stats_by_month(db, user_oid, from_str: str, to_str: str) -> list[dict]:
    rows = await db["expenses"].aggregate(
        [
            {"$match": _active_match(user_oid)},
            {"$addFields": {"month": {"$substr": ["$date", 0, 7]}}},
            {"$match": {"month": {"$gte": from_str, "$lte": to_str}}},
            {
                "$group": {
                    "_id": "$month",
                    "expenseCents": {
                        "$sum": {
                            "$cond": [
                                {"$eq": [{"$ifNull": ["$type", "expense"]}, "income"]},
                                0,
                                "$amountCents",
                            ]
                        }
                    },
                    "incomeCents": {
                        "$sum": {
                            "$cond": [
                                {"$eq": [{"$ifNull": ["$type", "expense"]}, "income"]},
                                "$amountCents",
                                0,
                            ]
                        }
                    },
                }
            },
            {"$sort": {"_id": 1}},
            {
                "$project": {
                    "month": "$_id",
                    "totalCents": "$expenseCents",
                    "expenseCents": 1,
                    "incomeCents": 1,
                    "netCents": {"$subtract": ["$incomeCents", "$expenseCents"]},
                    "_id": 0,
                }
            },
        ]
    ).to_list(500)
    return rows


async def money_summary(db, user_oid, month: str) -> dict:
    rows = await db["expenses"].aggregate(
        [
            {"$match": {**_active_match(user_oid), "date": {"$regex": f"^{month}-"}}},
            {
                "$group": {
                    "_id": None,
                    "expenseCents": {
                        "$sum": {
                            "$cond": [
                                {"$eq": [{"$ifNull": ["$type", "expense"]}, "income"]},
                                0,
                                "$amountCents",
                            ]
                        }
                    },
                    "incomeCents": {
                        "$sum": {
                            "$cond": [
                                {"$eq": [{"$ifNull": ["$type", "expense"]}, "income"]},
                                "$amountCents",
                                0,
                            ]
                        }
                    },
                }
            },
        ]
    ).to_list(1)
    row = rows[0] if rows else {}
    income = int(row.get("incomeCents", 0) or 0)
    expense = int(row.get("expenseCents", 0) or 0)
    return {
        "incomeCents": income,
        "expenseCents": expense,
        "netCents": income - expense,
    }


async def advanced_analytics(db, user_oid, end_month: str) -> dict:
    months = _months_back(end_month, 6)
    start_month = months[0]
    base_match = {
        **_active_match(user_oid),
        "date": {"$gte": f"{start_month}-01", "$lte": f"{end_month}-31"},
    }

    rows = await db["expenses"].aggregate(
        [
            {"$match": base_match},
            {
                "$addFields": {
                    "month": {"$substr": ["$date", 0, 7]},
                    "recordType": {"$ifNull": ["$type", "expense"]},
                }
            },
            {
                "$facet": {
                    "monthlySavings": [
                        {
                            "$group": {
                                "_id": "$month",
                                "incomeCents": {
                                    "$sum": {
                                        "$cond": [
                                            {"$eq": ["$recordType", "income"]},
                                            "$amountCents",
                                            0,
                                        ]
                                    }
                                },
                                "expenseCents": {
                                    "$sum": {
                                        "$cond": [
                                            {"$eq": ["$recordType", "income"]},
                                            0,
                                            "$amountCents",
                                        ]
                                    }
                                },
                            }
                        },
                        {
                            "$project": {
                                "month": "$_id",
                                "incomeCents": 1,
                                "expenseCents": 1,
                                "netCents": {
                                    "$subtract": ["$incomeCents", "$expenseCents"]
                                },
                                "savingsRate": {
                                    "$cond": [
                                        {"$gt": ["$incomeCents", 0]},
                                        {
                                            "$divide": [
                                                {
                                                    "$subtract": [
                                                        "$incomeCents",
                                                        "$expenseCents",
                                                    ]
                                                },
                                                "$incomeCents",
                                            ]
                                        },
                                        0,
                                    ]
                                },
                                "_id": 0,
                            }
                        },
                        {"$sort": {"month": 1}},
                    ],
                    "categorySpend": [
                        {"$match": {"recordType": {"$ne": "income"}}},
                        {
                            "$group": {
                                "_id": "$categoryId",
                                "spentCents": {"$sum": "$amountCents"},
                            }
                        },
                        {
                            "$lookup": {
                                "from": "categories",
                                "localField": "_id",
                                "foreignField": "_id",
                                "as": "cat",
                            }
                        },
                        {
                            "$unwind": {
                                "path": "$cat",
                                "preserveNullAndEmptyArrays": True,
                            }
                        },
                        {
                            "$project": {
                                "categoryId": {"$toString": "$_id"},
                                "categoryName": {
                                    "$ifNull": ["$cat.name", "Category"]
                                },
                                "spentCents": 1,
                                "_id": 0,
                            }
                        },
                        {"$sort": {"spentCents": -1}},
                    ],
                    "monthIncome": [
                        {"$match": {"recordType": "income"}},
                        {
                            "$group": {
                                "_id": "$month",
                                "incomeCents": {"$sum": "$amountCents"},
                            }
                        },
                        {"$sort": {"_id": 1}},
                    ],
                    "incomeBuckets": [
                        {"$match": {"recordType": "income"}},
                        {
                            "$bucket": {
                                "groupBy": "$amountCents",
                                "boundaries": [0, 5000, 20000, 50000, 10000000],
                                "default": "large",
                                "output": {
                                    "count": {"$sum": 1},
                                    "totalCents": {"$sum": "$amountCents"},
                                },
                            }
                        },
                    ],
                    "currentMonthCategory": [
                        {"$match": {"recordType": {"$ne": "income"}, "month": end_month}},
                        {
                            "$group": {
                                "_id": "$categoryId",
                                "spentCents": {"$sum": "$amountCents"},
                            }
                        },
                        {
                            "$lookup": {
                                "from": "categories",
                                "localField": "_id",
                                "foreignField": "_id",
                                "as": "cat",
                            }
                        },
                        {
                            "$unwind": {
                                "path": "$cat",
                                "preserveNullAndEmptyArrays": True,
                            }
                        },
                        {
                            "$project": {
                                "categoryId": {"$toString": "$_id"},
                                "categoryName": {
                                    "$ifNull": ["$cat.name", "Category"]
                                },
                                "spentCents": 1,
                                "_id": 0,
                            }
                        },
                    ],
                }
            },
        ]
    ).to_list(1)

    facet = rows[0] if rows else {}
    monthly = facet.get("monthlySavings", [])
    by_month = {x["month"]: x for x in monthly}
    savings_trend = [
        by_month.get(
            m,
            {
                "month": m,
                "incomeCents": 0,
                "expenseCents": 0,
                "netCents": 0,
                "savingsRate": 0,
            },
        )
        for m in months
    ]

    month_income = [int(x.get("incomeCents", 0) or 0) for x in facet.get("monthIncome", [])]
    if len(month_income) >= 2:
        avg = sum(month_income) / len(month_income)
        variance = sum((x - avg) ** 2 for x in month_income) / len(month_income)
        std = variance**0.5
        stability = max(0, min(100, int(100 - (std / avg * 100)) if avg else 0))
    elif month_income:
        stability = 100
    else:
        stability = 0

    budget_doc = await db["budgets"].find_one({"userId": user_oid, "month": end_month})
    category_budgets = (budget_doc or {}).get("categoryBudgets", {})
    overspend = []
    for row in facet.get("currentMonthCategory", []):
        cid = row.get("categoryId")
        limit = int(category_budgets.get(cid, 0) or 0)
        spent = int(row.get("spentCents", 0) or 0)
        if limit <= 0:
            continue
        overspend.append(
            {
                "categoryId": cid,
                "categoryName": row.get("categoryName") or "Category",
                "spentCents": spent,
                "budgetCents": limit,
                "overCents": max(0, spent - limit),
                "usageRate": round(spent / limit, 3) if limit else 0,
            }
        )
    overspend.sort(key=lambda x: (-x["overCents"], -x["usageRate"]))

    return {
        "month": end_month,
        "range": {"from": start_month, "to": end_month},
        "savingsTrend": savings_trend,
        "categoryOverspendRank": overspend[:10],
        "topOverBudgetCategories": overspend[:3],
        "incomeStabilityScore": stability,
        "incomeBuckets": facet.get("incomeBuckets", []),
        "categorySpendRank": facet.get("categorySpend", [])[:10],
    }
