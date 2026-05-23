"""Companion features API — mood, wishlist, achievements, weekly report."""

from datetime import datetime

from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import current_user
from app.db import get_db
from app.mongo_id import require_object_id
from app.repositories import companion_repo
from app.schemas import (
    MoodCheckinCreate,
    ThemeUpdate,
    WishlistCreate,
    WishlistSavedUpdate,
    month_param_ok,
    to_amount_cents,
)

router = APIRouter(prefix="/api/companion", tags=["companion"])


@router.get("/profile")
async def get_profile(user: dict = Depends(current_user)):
    db = get_db()
    profile = await companion_repo.touch_login(db, user["_id"])
    return profile


@router.put("/theme")
async def update_theme(body: ThemeUpdate, user: dict = Depends(current_user)):
    db = get_db()
    try:
        return await companion_repo.set_theme(db, user["_id"], body.theme.strip())
    except ValueError as err:
        code = str(err)
        if code == "theme_locked":
            raise HTTPException(status_code=403, detail={"error": "Theme locked — unlock via achievements"})
        raise HTTPException(status_code=400, detail={"error": "Invalid theme"})


@router.get("/mood/today")
async def mood_today(user: dict = Depends(current_user)):
    db = get_db()
    doc = await companion_repo.get_mood_today(db, user["_id"])
    return {"checked": doc is not None, "entry": doc}


@router.post("/mood")
async def save_mood(body: MoodCheckinCreate, user: dict = Depends(current_user)):
    db = get_db()
    try:
        return await companion_repo.save_mood(db, user["_id"], body.mood)
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": "Invalid mood"})


@router.get("/wishlist")
async def list_wishes(user: dict = Depends(current_user)):
    db = get_db()
    items = await companion_repo.list_wishes(db, user["_id"])
    return {"items": items}


@router.post("/wishlist", status_code=201)
async def create_wish(body: WishlistCreate, user: dict = Depends(current_user)):
    db = get_db()
    wid = await companion_repo.create_wish(
        db, user["_id"], body.title, to_amount_cents(body.amount)
    )
    new_achievements = await companion_repo._evaluate_achievements(db, user["_id"])
    return {"id": wid, "newAchievements": new_achievements}


@router.put("/wishlist/{wish_id}/saved")
async def update_wish_saved(
    wish_id: str, body: WishlistSavedUpdate, user: dict = Depends(current_user)
):
    oid = require_object_id(wish_id)
    db = get_db()
    ok = await companion_repo.update_wish_saved(
        db, user["_id"], oid, to_amount_cents(body.saved)
    )
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "Not found"})
    return {"ok": True}


@router.delete("/wishlist/{wish_id}")
async def delete_wish(wish_id: str, user: dict = Depends(current_user)):
    oid = require_object_id(wish_id)
    db = get_db()
    ok = await companion_repo.delete_wish(db, user["_id"], oid)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "Not found"})
    return {"ok": True}


@router.get("/weekly-report")
async def weekly_report(user: dict = Depends(current_user)):
    db = get_db()
    return await companion_repo.weekly_report(db, user["_id"])


@router.get("/achievements/check")
async def check_achievements(user: dict = Depends(current_user)):
    db = get_db()
    new_items = await companion_repo._evaluate_achievements(db, user["_id"])
    profile = await companion_repo.get_or_create_profile(db, user["_id"])
    return {"newAchievements": new_items, "profile": companion_repo._serialize_profile(profile)}


@router.get("/emotions")
async def emotion_breakdown(
    month: str | None = Query(None), user: dict = Depends(current_user)
):
    month = month or datetime.utcnow().strftime("%Y-%m")
    if not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})
    db = get_db()
    return await companion_repo.emotion_breakdown(db, user["_id"], month)


@router.get("/widget")
async def widget_snapshot(user: dict = Depends(current_user)):
    db = get_db()
    return await companion_repo.widget_snapshot(db, user["_id"])
