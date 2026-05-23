"""Export the authenticated user's ledger data as JSON."""

from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.auth import current_user
from app.db import get_db

router = APIRouter(prefix="/api/export", tags=["export"])


def _stringify(doc: dict) -> dict:
    out = dict(doc)
    for key, value in list(out.items()):
        if isinstance(value, ObjectId):
            out[key] = str(value)
        elif isinstance(value, datetime):
            out[key] = value.isoformat()
    return out


@router.get("")
async def export_data(user: dict = Depends(current_user)):
    db = get_db()
    query = {"userId": user["_id"]}
    categories = await db["categories"].find(query).sort("name", 1).to_list(10_000)
    expenses = (
        await db["expenses"]
        .find({**query, "$or": [{"deletedAt": {"$exists": False}}, {"deletedAt": None}]})
        .sort([("date", -1), ("_id", -1)])
        .to_list(10_000)
    )
    budgets = await db["budgets"].find(query).sort("month", -1).to_list(10_000)
    return {
        "exportedAt": datetime.utcnow().isoformat(),
        "user": {"id": str(user["_id"]), "username": user["username"]},
        "categories": [_stringify(x) for x in categories],
        "expenses": [_stringify(x) for x in expenses],
        "budgets": [_stringify(x) for x in budgets],
    }
