"""HTTP routes for ``/api/categories/*`` — list, create, delete."""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import current_user
from app.db import get_db
from app.mongo_id import require_object_id
from app.repositories import categories_repo as repo
from app.schemas import CategoryCreate

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("")
async def list_categories(user: dict = Depends(current_user)):
    db = get_db()
    return {"items": await repo.list_categories(db, user["_id"])}


@router.post("", status_code=201)
async def create_category(body: CategoryCreate, user: dict = Depends(current_user)):
    db = get_db()
    created = await repo.create_category(db, user["_id"], body.name.strip())
    if not created["ok"]:
        raise HTTPException(status_code=409, detail={"error": "Category already exists"})
    return {"id": created["id"], "name": body.name.strip()}


@router.delete("/{category_id}")
async def delete_category(category_id: str, user: dict = Depends(current_user)):
    oid = require_object_id(category_id)
    db = get_db()
    result = await repo.delete_category_if_unused(db, user["_id"], oid)
    if not result["ok"]:
        if result["reason"] == "in_use":
            raise HTTPException(
                status_code=409,
                detail={"error": "Category is in use by expenses"},
            )
        if result["reason"] == "not_found":
            raise HTTPException(status_code=404, detail={"error": "Not found"})
        raise HTTPException(status_code=500, detail={"error": "Unknown error"})
    return {"ok": True}
