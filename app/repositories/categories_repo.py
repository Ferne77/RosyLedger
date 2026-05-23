"""
Category list/create/delete; delete is blocked when expenses still reference the category.
"""

from bson import ObjectId


async def list_categories(db, user_oid: ObjectId) -> list[dict]:
    docs = (
        await db["categories"]
        .find({"userId": user_oid})
        .sort("name", 1)
        .to_list(10_000)
    )
    return [{"id": str(d["_id"]), "name": d["name"]} for d in docs]


async def create_category(db, user_oid: ObjectId, name: str) -> dict:
    existing = await db["categories"].find_one({"userId": user_oid, "name": name})
    if existing:
        return {"ok": False, "reason": "duplicate"}
    result = await db["categories"].insert_one({"userId": user_oid, "name": name})
    return {"ok": True, "id": str(result.inserted_id)}


async def delete_category_if_unused(
    db,
    user_oid: ObjectId,
    category_oid: ObjectId,
) -> dict:
    in_use = await db["expenses"].find_one(
        {"userId": user_oid, "categoryId": category_oid}
    )
    if in_use:
        return {"ok": False, "reason": "in_use"}
    result = await db["categories"].delete_one({"_id": category_oid, "userId": user_oid})
    if result.deleted_count == 0:
        return {"ok": False, "reason": "not_found"}
    return {"ok": True}
