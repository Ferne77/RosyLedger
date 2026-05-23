"""HTTP routes for ``/api/expenses/*`` — list, CRUD, trash, sync, and validation."""

from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import current_user
from app.db import get_db
from app.mongo_id import require_object_id
from app.notify import publish_refresh
from app.repositories import expenses_repo as repo
from app.schemas import ExpenseCreate, ExpenseSyncRequest, ExpenseUpdate, month_param_ok, to_amount_cents

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("")
async def list_expenses(
    month: str | None = Query(None),
    categoryId: str | None = Query(None),
    q: str | None = Query(None),
    user: dict = Depends(current_user),
):
    if month is not None and not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})
    db = get_db()
    match = repo.build_match(user["_id"], month, categoryId, q)
    return {"items": await repo.list_expenses(db, match)}


@router.get("/trash")
async def list_trash(user: dict = Depends(current_user)):
    db = get_db()
    return {"items": await repo.list_trashed(db, user["_id"])}


@router.post("/sync")
async def sync_expenses(body: ExpenseSyncRequest, user: dict = Depends(current_user)):
    db = get_db()
    results = []
    for item in body.items:
        amount_cents = to_amount_cents(item.amount)
        try:
            record_id, created = await repo.upsert_by_client_id(
                db,
                user_oid=user["_id"],
                client_id=item.clientId,
                title=item.title,
                type_=item.type,
                category_id=item.categoryId,
                amount_cents=amount_cents,
                date=item.date,
                description=item.description,
                emotion_tag=item.emotionTag,
            )
            results.append({"clientId": item.clientId, "id": record_id, "created": created})
        except InvalidId:
            raise HTTPException(status_code=400, detail={"error": "Invalid categoryId"})
        except ValueError as err:
            if str(err) == "category_not_found":
                raise HTTPException(status_code=404, detail={"error": "Category not found"})
            raise
    publish_refresh(user["_id"], "ledger")
    return {"items": results}


@router.get("/{expense_id}")
async def get_expense(expense_id: str, user: dict = Depends(current_user)):
    oid = require_object_id(expense_id)
    db = get_db()
    item = await repo.get_expense_by_id(db, user["_id"], oid)
    if not item:
        raise HTTPException(status_code=404, detail={"error": "Not found"})
    return item


@router.post("", status_code=201)
async def create_expense(body: ExpenseCreate, user: dict = Depends(current_user)):
    from app.repositories import companion_repo

    amount_cents = to_amount_cents(body.amount)
    db = get_db()
    try:
        if body.clientId:
            eid, _created = await repo.upsert_by_client_id(
                db,
                user_oid=user["_id"],
                client_id=body.clientId,
                title=body.title,
                type_=body.type,
                category_id=body.categoryId,
                amount_cents=amount_cents,
                date=body.date,
                description=body.description,
                emotion_tag=body.emotionTag,
            )
        else:
            eid = await repo.create_expense(
                db,
                user_oid=user["_id"],
                title=body.title,
                type_=body.type,
                category_id=body.categoryId,
                amount_cents=amount_cents,
                date=body.date,
                description=body.description,
                receipt_data_url=body.receiptDataUrl,
                receipt_name=body.receiptName,
                emotion_tag=body.emotionTag,
                client_id=body.clientId,
            )
        new_achievements = await companion_repo.on_expense_created(db, user["_id"], body.date)
        publish_refresh(user["_id"], "ledger")
        return {"id": eid, "newAchievements": new_achievements}
    except InvalidId:
        raise HTTPException(status_code=400, detail={"error": "Invalid categoryId"})
    except ValueError as err:
        if str(err) == "category_not_found":
            raise HTTPException(status_code=404, detail={"error": "Category not found"})
        raise


@router.put("/{expense_id}")
async def update_expense(
    expense_id: str,
    body: ExpenseUpdate,
    user: dict = Depends(current_user),
):
    oid = require_object_id(expense_id)
    db = get_db()
    data = body.model_dump(exclude_none=True)
    updates: dict = {}
    if "title" in data:
        updates["title"] = data["title"]
    if "type" in data:
        updates["type"] = data["type"]
    if "categoryId" in data:
        updates["categoryId"] = str(data["categoryId"])
    if "amount" in data:
        updates["amountCents"] = to_amount_cents(float(data["amount"]))
    if "date" in data:
        updates["date"] = data["date"]
    if "description" in data:
        updates["description"] = data["description"]
    if "receiptDataUrl" in data:
        updates["receiptDataUrl"] = data["receiptDataUrl"]
    if "receiptName" in data:
        updates["receiptName"] = data["receiptName"]
    if "emotionTag" in data:
        updates["emotionTag"] = data["emotionTag"]

    try:
        ok = await repo.update_expense(db, user["_id"], oid, updates)
        if not ok:
            raise HTTPException(status_code=404, detail={"error": "Not found"})
    except HTTPException:
        raise
    except InvalidId:
        raise HTTPException(status_code=400, detail={"error": "Invalid categoryId"})
    except ValueError as err:
        if str(err) == "category_not_found":
            raise HTTPException(status_code=404, detail={"error": "Category not found"})
        raise
    publish_refresh(user["_id"], "ledger")
    return {"ok": True}


@router.delete("/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(current_user)):
    oid = require_object_id(expense_id)
    db = get_db()
    ok = await repo.soft_delete_expense(db, user["_id"], oid)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "Not found"})
    publish_refresh(user["_id"], "ledger")
    return {"ok": True}


@router.post("/{expense_id}/restore")
async def restore_expense(expense_id: str, user: dict = Depends(current_user)):
    oid = require_object_id(expense_id)
    db = get_db()
    ok = await repo.restore_expense(db, user["_id"], oid)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "Not found"})
    publish_refresh(user["_id"], "ledger")
    return {"ok": True}


@router.delete("/{expense_id}/permanent")
async def purge_expense(expense_id: str, user: dict = Depends(current_user)):
    oid = require_object_id(expense_id)
    db = get_db()
    ok = await repo.purge_expense(db, user["_id"], oid)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "Not found"})
    publish_refresh(user["_id"], "ledger")
    return {"ok": True}
