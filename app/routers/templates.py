"""User-owned quick-add templates."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.auth import current_user
from app.db import get_db
from app.mongo_id import require_object_id
from app.schemas import QuickTemplateCreate, to_amount_cents

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _public_template(doc: dict, category: dict | None = None) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc["title"],
        "categoryId": str(doc["categoryId"]),
        "categoryName": category.get("name", "") if category else doc.get("categoryName", ""),
        "amountCents": int(doc.get("amountCents", 0)),
        "description": doc.get("description", ""),
    }


@router.get("")
async def list_templates(user: dict = Depends(current_user)):
    db = get_db()
    docs = await db["quickTemplates"].find({"userId": user["_id"]}).sort("title", 1).to_list(100)
    categories = await db["categories"].find({"userId": user["_id"]}).to_list(10_000)
    by_id = {str(c["_id"]): c for c in categories}
    return {"items": [_public_template(d, by_id.get(str(d["categoryId"]))) for d in docs]}


@router.post("", status_code=201)
async def create_template(body: QuickTemplateCreate, user: dict = Depends(current_user)):
    db = get_db()
    category_oid = require_object_id(body.categoryId)
    category = await db["categories"].find_one({"_id": category_oid, "userId": user["_id"]})
    if not category:
        raise HTTPException(status_code=404, detail={"error": "Category not found"})
    now = datetime.utcnow()
    result = await db["quickTemplates"].insert_one(
        {
            "userId": user["_id"],
            "title": body.title.strip(),
            "categoryId": category_oid,
            "amountCents": to_amount_cents(body.amount),
            "description": body.description.strip(),
            "createdAt": now,
            "updatedAt": now,
        }
    )
    doc = await db["quickTemplates"].find_one({"_id": result.inserted_id})
    return _public_template(doc, category)


@router.delete("/{template_id}")
async def delete_template(template_id: str, user: dict = Depends(current_user)):
    oid = require_object_id(template_id)
    result = await get_db()["quickTemplates"].delete_one({"_id": oid, "userId": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail={"error": "Not found"})
    return {"ok": True}
