#!/usr/bin/env python3
"""Export categories and expenses to db/*.json for submission."""

import json
import sys
from pathlib import Path

from bson import ObjectId
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import settings


def stringify_doc(doc: dict) -> dict:
    out = dict(doc)
    if "_id" in out and isinstance(out["_id"], ObjectId):
        out["_id"] = str(out["_id"])
    if "categoryId" in out and isinstance(out["categoryId"], ObjectId):
        out["categoryId"] = str(out["categoryId"])
    return out


def main() -> int:
    if not settings.has_valid_mongodb_uri():
        print("Set a valid MONGODB_URI in app/config.py")
        return 1
    print("Connecting to MongoDB Atlas...")
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=15000)
    try:
        db = client[settings.db_name]
        categories = list(db["categories"].find({}).sort("name", 1))
        expenses = list(db["expenses"].find({}).sort([("date", -1), ("_id", -1)]))

        out_dir = ROOT / "db"
        out_dir.mkdir(parents=True, exist_ok=True)

        with open(out_dir / "categories.json", "w", encoding="utf-8") as f:
            json.dump([stringify_doc(d) for d in categories], f, indent=2)

        with open(out_dir / "expenses.json", "w", encoding="utf-8") as f:
            json.dump([stringify_doc(d) for d in expenses], f, indent=2)

        print(f"Wrote db/categories.json ({len(categories)} documents)")
        print(f"Wrote db/expenses.json ({len(expenses)} documents)")
        return 0
    except Exception as e:
        print("Export failed:", e)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
