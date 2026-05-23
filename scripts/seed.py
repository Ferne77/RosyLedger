#!/usr/bin/env python3
"""Seed MongoDB Atlas with default categories and sample expenses (if empty)."""

import sys
from datetime import datetime
from pathlib import Path

from pymongo import MongoClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import settings
from app.default_categories import DEFAULT_CATEGORY_NAMES

CATEGORIES = list(DEFAULT_CATEGORY_NAMES)

SAMPLE_EXPENSES = [
    {
        "title": "Groceries",
        "categoryName": "Food",
        "amountCents": 7425,
        "date": "2026-03-01",
        "description": "Weekly groceries",
    },
    {
        "title": "Coffee",
        "categoryName": "Food",
        "amountCents": 550,
        "date": "2026-03-02",
        "description": "Morning coffee",
    },
    {
        "title": "Metro card top-up",
        "categoryName": "Transport",
        "amountCents": 2500,
        "date": "2026-02-25",
        "description": "Public transport",
    },
    {
        "title": "Phone bill",
        "categoryName": "Utilities",
        "amountCents": 3999,
        "date": "2026-02-20",
        "description": "Monthly plan",
    },
    {
        "title": "Movie night",
        "categoryName": "Entertainment",
        "amountCents": 1800,
        "date": "2026-02-15",
        "description": "Cinema ticket",
    },
    {
        "title": "Online course",
        "categoryName": "Education",
        "amountCents": 12900,
        "date": "2026-01-28",
        "description": "Programming course",
    },
    {
        "title": "Pharmacy",
        "categoryName": "Health",
        "amountCents": 2340,
        "date": "2026-01-18",
        "description": "Basic medicine",
    },
    {
        "title": "Sneakers",
        "categoryName": "Shopping",
        "amountCents": 8900,
        "date": "2026-01-10",
        "description": "Running shoes",
    },
]


def main() -> int:
    if not settings.has_valid_mongodb_uri():
        print(
            "Set a valid MONGODB_URI in app/config.py."
        )
        return 1
    print("Connecting to MongoDB Atlas...")
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=15000)
    try:
        client.admin.command("ping")
        print("Connected. Seeding database...")
        db = client[settings.db_name]
        cats_col = db["categories"]
        exp_col = db["expenses"]

        if cats_col.find_one({}):
            print(
                "Database already has data; skipping seed. Clear collections in Atlas to reset."
            )
            return 0

        cat_ids = {}
        for name in CATEGORIES:
            r = cats_col.insert_one({"name": name})
            cat_ids[name] = r.inserted_id
        print("Inserted categories:", len(CATEGORIES))

        now = datetime.utcnow()
        for e in SAMPLE_EXPENSES:
            cid = cat_ids.get(e["categoryName"])
            if not cid:
                continue
            exp_col.insert_one(
                {
                    "title": e["title"],
                    "categoryId": cid,
                    "amountCents": e["amountCents"],
                    "date": e["date"],
                    "description": e.get("description") or "",
                    "createdAt": now,
                    "updatedAt": now,
                }
            )
        print("Inserted sample expenses:", len(SAMPLE_EXPENSES))
        print("Seed complete. Database:", settings.db_name)
        return 0
    except Exception as err:
        print("Seed failed:", err)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
