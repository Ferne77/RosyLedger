"""HTTP routes for ``/api/stats/*`` — category aggregates and monthly trend series."""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import current_user
from app.db import get_db
from app.repositories import stats_repo as repo
from app.schemas import month_param_ok

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/by-category")
async def by_category(month: str | None = Query(None), user: dict = Depends(current_user)):
    """Omit `month` for all-time totals per category; pass `month=YYYY-MM` for that month only."""
    db = get_db()
    if month is None or (isinstance(month, str) and month.strip() == ""):
        out = await repo.stats_by_category_all(db, user["_id"])
        return {"month": None, **out}
    if not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})
    out = await repo.stats_by_category(db, user["_id"], month)
    return {"month": month, **out}


@router.get("/by-month")
async def by_month(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    user: dict = Depends(current_user),
):
    if not month_param_ok(from_) or not month_param_ok(to):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})
    if from_ > to:
        raise HTTPException(status_code=400, detail={"error": "from must be <= to"})
    db = get_db()
    items = await repo.stats_by_month(db, user["_id"], from_, to)
    return {"from": from_, "to": to, "items": items}


@router.get("/summary")
async def summary(month: str = Query(...), user: dict = Depends(current_user)):
    if not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})
    db = get_db()
    out = await repo.money_summary(db, user["_id"], month)
    return {"month": month, **out}


@router.get("/analytics")
async def analytics(month: str = Query(...), user: dict = Depends(current_user)):
    if not month_param_ok(month):
        raise HTTPException(status_code=400, detail={"error": "Invalid month (YYYY-MM)"})
    db = get_db()
    return await repo.advanced_analytics(db, user["_id"], month)
