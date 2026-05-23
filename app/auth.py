"""FastAPI authentication dependency for current-user routes."""

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Header, HTTPException, Query

from app.db import get_db
from app.security import decode_access_token


async def current_user(authorization: str | None = Header(default=None)) -> dict:
    return await _resolve_user(authorization, None)


async def current_user_sse(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> dict:
    return await _resolve_user(authorization, token)


async def _resolve_user(authorization: str | None, query_token: str | None) -> dict:
    raw = None
    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization.split(" ", 1)[1].strip()
    elif query_token:
        raw = query_token.strip()
    if not raw:
        raise HTTPException(status_code=401, detail={"error": "Authentication required"})
    payload = decode_access_token(raw)
    if not payload:
        raise HTTPException(status_code=401, detail={"error": "Invalid or expired token"})
    try:
        user_oid = ObjectId(str(payload["sub"]))
    except (InvalidId, KeyError):
        raise HTTPException(status_code=401, detail={"error": "Invalid token"})
    user = await get_db()["users"].find_one({"_id": user_oid})
    if not user:
        raise HTTPException(status_code=401, detail={"error": "User no longer exists"})
    return user


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "createdAt": user.get("createdAt"),
        "updatedAt": user.get("updatedAt"),
    }
