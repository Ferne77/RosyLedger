"""
Expense CRUD and list queries with optional month, category, and text filters.
"""

from datetime import datetime

from bson import ObjectId


def active_filter() -> dict:
    return {"$or": [{"deletedAt": {"$exists": False}}, {"deletedAt": None}]}


def build_match(
    user_oid: ObjectId,
    month: str | None,
    category_id: str | None,
    q: str | None,
    *,
    trashed: bool = False,
) -> dict:
    match: dict = {"userId": user_oid}
    if trashed:
        match["deletedAt"] = {"$ne": None}
    else:
        match.update(active_filter())
    if month:
        match["date"] = {"$regex": f"^{month}-"}
    if category_id is not None and str(category_id).strip() != "":
        match["categoryId"] = ObjectId(str(category_id))
    if q and str(q).strip():
        s = str(q).strip()
        match["$or"] = [
            {"title": {"$regex": s, "$options": "i"}},
            {"description": {"$regex": s, "$options": "i"}},
        ]
    return match


def _project_expense():
    return {
        "id": {"$toString": "$_id"},
        "title": 1,
        "categoryId": {"$toString": "$categoryId"},
        "categoryName": "$cat.name",
        "type": {"$ifNull": ["$type", "expense"]},
        "amountCents": 1,
        "date": 1,
        "description": 1,
        "receiptDataUrl": 1,
        "receiptName": 1,
        "emotionTag": 1,
        "deletedAt": 1,
        "clientId": 1,
        "createdAt": 1,
        "updatedAt": 1,
    }


async def list_expenses(db, match: dict) -> list[dict]:
    pipeline: list = []
    if match:
        pipeline.append({"$match": match})
    else:
        pipeline.append({"$match": {}})
    pipeline.extend(
        [
            {
                "$lookup": {
                    "from": "categories",
                    "localField": "categoryId",
                    "foreignField": "_id",
                    "as": "cat",
                }
            },
            {"$unwind": {"path": "$cat", "preserveNullAndEmptyArrays": True}},
            {"$sort": {"date": -1, "_id": -1}},
            {"$limit": 500},
            {"$project": _project_expense()},
        ]
    )
    rows = await db["expenses"].aggregate(pipeline).to_list(500)
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "title": r["title"],
                "categoryId": r["categoryId"],
                "categoryName": r.get("categoryName") or "",
                "type": r.get("type") or "expense",
                "amountCents": r["amountCents"],
                "date": r["date"],
                "description": r.get("description") or "",
                "receiptDataUrl": r.get("receiptDataUrl") or "",
                "receiptName": r.get("receiptName") or "",
                "emotionTag": r.get("emotionTag") or "",
                "deletedAt": r.get("deletedAt"),
                "clientId": r.get("clientId") or "",
                "createdAt": r.get("createdAt"),
                "updatedAt": r.get("updatedAt"),
            }
        )
    return out


async def list_trashed(db, user_oid: ObjectId) -> list[dict]:
    return await list_expenses(db, {"userId": user_oid, "deletedAt": {"$ne": None}})


async def get_expense_by_id(db, user_oid: ObjectId, expense_oid: ObjectId) -> dict | None:
    pipeline = [
        {"$match": {"_id": expense_oid, "userId": user_oid, **active_filter()}},
        {
            "$lookup": {
                "from": "categories",
                "localField": "categoryId",
                "foreignField": "_id",
                "as": "cat",
            }
        },
        {"$unwind": {"path": "$cat", "preserveNullAndEmptyArrays": True}},
        {"$project": _project_expense()},
    ]
    rows = await db["expenses"].aggregate(pipeline).to_list(1)
    if not rows:
        return None
    r = rows[0]
    return {
        "id": r["id"],
        "title": r["title"],
        "categoryId": r["categoryId"],
        "categoryName": r.get("categoryName") or "",
        "type": r.get("type") or "expense",
        "amountCents": r["amountCents"],
        "date": r["date"],
        "description": r.get("description") or "",
        "receiptDataUrl": r.get("receiptDataUrl") or "",
        "receiptName": r.get("receiptName") or "",
        "emotionTag": r.get("emotionTag") or "",
        "createdAt": r.get("createdAt"),
        "updatedAt": r.get("updatedAt"),
    }


async def create_expense(
    db,
    *,
    user_oid: ObjectId,
    title: str,
    type_: str,
    category_id: str | None,
    amount_cents: int,
    date: str,
    description: str,
    receipt_data_url: str | None = None,
    receipt_name: str | None = None,
    emotion_tag: str | None = None,
    client_id: str | None = None,
) -> str:
    record_type = type_ if type_ in {"expense", "income"} else "expense"
    category_oid = None
    if record_type == "expense":
        category_oid = ObjectId(str(category_id))
        category = await db["categories"].find_one(
            {"_id": category_oid, "userId": user_oid}
        )
        if not category:
            raise ValueError("category_not_found")
    doc = {
        "userId": user_oid,
        "title": title,
        "type": record_type,
        "categoryId": category_oid,
        "amountCents": amount_cents,
        "date": date,
        "description": description or "",
        "receiptDataUrl": receipt_data_url or "",
        "receiptName": receipt_name or "",
    }
    if emotion_tag:
        doc["emotionTag"] = emotion_tag
    if client_id:
        doc["clientId"] = client_id

    now = datetime.utcnow()
    doc["createdAt"] = now
    doc["updatedAt"] = now
    result = await db["expenses"].insert_one(doc)
    return str(result.inserted_id)


async def update_expense(
    db,
    user_oid: ObjectId,
    expense_oid: ObjectId,
    updates: dict,
) -> bool:
    from datetime import datetime

    set_doc: dict = {"updatedAt": datetime.utcnow()}
    if updates.get("title") is not None:
        set_doc["title"] = updates["title"]
    record_type = updates.get("type")
    if record_type is not None:
        set_doc["type"] = record_type if record_type in {"expense", "income"} else "expense"
    if updates.get("categoryId") is not None:
        category_oid = ObjectId(updates["categoryId"])
        category = await db["categories"].find_one(
            {"_id": category_oid, "userId": user_oid}
        )
        if not category:
            raise ValueError("category_not_found")
        set_doc["categoryId"] = category_oid
    elif record_type == "income":
        set_doc["categoryId"] = None
    if updates.get("amountCents") is not None:
        set_doc["amountCents"] = updates["amountCents"]
    if updates.get("date") is not None:
        set_doc["date"] = updates["date"]
    if updates.get("description") is not None:
        set_doc["description"] = updates["description"] or ""
    if "receiptDataUrl" in updates:
        set_doc["receiptDataUrl"] = updates.get("receiptDataUrl") or ""
    if "receiptName" in updates:
        set_doc["receiptName"] = updates.get("receiptName") or ""
    if "emotionTag" in updates:
        set_doc["emotionTag"] = updates.get("emotionTag") or ""

    result = await db["expenses"].update_one(
        {"_id": expense_oid, "userId": user_oid},
        {"$set": set_doc},
    )
    return result.matched_count > 0


async def soft_delete_expense(db, user_oid: ObjectId, expense_oid: ObjectId) -> bool:
    result = await db["expenses"].update_one(
        {"_id": expense_oid, "userId": user_oid, **active_filter()},
        {"$set": {"deletedAt": datetime.utcnow(), "updatedAt": datetime.utcnow()}},
    )
    return result.matched_count > 0


async def restore_expense(db, user_oid: ObjectId, expense_oid: ObjectId) -> bool:
    result = await db["expenses"].update_one(
        {"_id": expense_oid, "userId": user_oid, "deletedAt": {"$ne": None}},
        {"$set": {"deletedAt": None, "updatedAt": datetime.utcnow()}},
    )
    return result.matched_count > 0


async def purge_expense(db, user_oid: ObjectId, expense_oid: ObjectId) -> bool:
    result = await db["expenses"].delete_one(
        {"_id": expense_oid, "userId": user_oid, "deletedAt": {"$ne": None}}
    )
    return result.deleted_count > 0


async def upsert_by_client_id(
    db,
    *,
    user_oid: ObjectId,
    client_id: str,
    title: str,
    type_: str,
    category_id: str | None,
    amount_cents: int,
    date: str,
    description: str,
) -> tuple[str, bool]:
    existing = await db["expenses"].find_one(
        {"userId": user_oid, "clientId": client_id, **active_filter()}
    )
    if existing:
        updates = {
            "title": title,
            "type": type_,
            "amountCents": amount_cents,
            "date": date,
            "description": description,
        }
        if type_ == "expense" and category_id:
            updates["categoryId"] = category_id
        await update_expense(
            db,
            user_oid,
            existing["_id"],
            updates,
        )
        return str(existing["_id"]), False

    new_id = await create_expense(
        db,
        user_oid=user_oid,
        title=title,
        type_=type_,
        category_id=category_id,
        amount_cents=amount_cents,
        date=date,
        description=description,
        client_id=client_id,
    )
    return new_id, True
