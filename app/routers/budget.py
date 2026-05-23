"""Monthly budget routes for the authenticated user."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import current_user
from app.db import get_db
from app.mongo_id import require_object_id
from app.schemas import (
    BudgetUpdate,
    CategoryBudgetBatchUpdate,
    CategoryBudgetUpdate,
    SpendingGoalUpdate,
    month_param_ok,
    to_amount_cents,
)
from app.notify import publish_refresh

router = APIRouter(prefix="/api/budget", tags=["budget"])


@router.get("")
async def get_budget(month: str = Query(...), user: dict = Depends(current_user)):
    if not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})
    doc = await get_db()["budgets"].find_one({"userId": user["_id"], "month": month})
    return {
        "month": month,
        "amountCents": int(doc.get("amountCents", 0)) if doc else 0,
        "goalPercent": float(doc.get("goalPercent", 0)) if doc else 0,
        "categoryBudgets": doc.get("categoryBudgets", {}) if doc else {},
    }


@router.put("")
async def set_budget(body: BudgetUpdate, user: dict = Depends(current_user)):
    amount_cents = to_amount_cents(body.amount)
    await get_db()["budgets"].update_one(
        {"userId": user["_id"], "month": body.month},
        {
            "$set": {
                "amountCents": amount_cents,
                "updatedAt": datetime.utcnow(),
            },
            "$setOnInsert": {
                "userId": user["_id"],
                "month": body.month,
                "createdAt": datetime.utcnow(),
            },
        },
        upsert=True,
    )
    publish_refresh(user["_id"], "budget")
    return {"month": body.month, "amountCents": amount_cents}


@router.put("/goal")
async def set_spending_goal(
    body: SpendingGoalUpdate,
    user: dict = Depends(current_user),
):
    await get_db()["budgets"].update_one(
        {"userId": user["_id"], "month": body.month},
        {
            "$set": {
                "goalPercent": body.percent,
                "updatedAt": datetime.utcnow(),
            },
            "$setOnInsert": {
                "userId": user["_id"],
                "month": body.month,
                "amountCents": 0,
                "categoryBudgets": {},
                "createdAt": datetime.utcnow(),
            },
        },
        upsert=True,
    )
    publish_refresh(user["_id"], "budget")
    return {"month": body.month, "goalPercent": body.percent}


@router.put("/category")
async def set_category_budget(
    body: CategoryBudgetUpdate,
    user: dict = Depends(current_user),
):
    category_oid = require_object_id(body.categoryId)
    db = get_db()
    category = await db["categories"].find_one(
        {"_id": category_oid, "userId": user["_id"]}
    )
    if not category:
        raise HTTPException(status_code=404, detail={"error": "Category not found"})
    amount_cents = to_amount_cents(body.amount)
    await db["budgets"].update_one(
        {"userId": user["_id"], "month": body.month},
        {
            "$set": {
                f"categoryBudgets.{str(category_oid)}": amount_cents,
                "updatedAt": datetime.utcnow(),
            },
            "$setOnInsert": {
                "userId": user["_id"],
                "month": body.month,
                "amountCents": 0,
                "goalPercent": 0,
                "createdAt": datetime.utcnow(),
            },
        },
        upsert=True,
    )
    publish_refresh(user["_id"], "budget")
    return {
        "month": body.month,
        "categoryId": str(category_oid),
        "amountCents": amount_cents,
    }


@router.put("/categories/batch")
async def set_category_budgets_batch(
    body: CategoryBudgetBatchUpdate,
    user: dict = Depends(current_user),
):
    if not month_param_ok(body.month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})
    db = get_db()
    category_budgets = {}
    for category_id, amount in body.allocations.items():
        category_oid = require_object_id(category_id)
        category = await db["categories"].find_one(
            {"_id": category_oid, "userId": user["_id"]}
        )
        if not category:
            raise HTTPException(status_code=404, detail={"error": "Category not found"})
        category_budgets[str(category_oid)] = to_amount_cents(float(amount))

    await db["budgets"].update_one(
        {"userId": user["_id"], "month": body.month},
        {
            "$set": {
                "categoryBudgets": category_budgets,
                "updatedAt": datetime.utcnow(),
            },
            "$setOnInsert": {
                "userId": user["_id"],
                "month": body.month,
                "amountCents": 0,
                "goalPercent": 0,
                "createdAt": datetime.utcnow(),
            },
        },
        upsert=True,
    )
    publish_refresh(user["_id"], "budget")
    return {"month": body.month, "categoryBudgets": category_budgets}
