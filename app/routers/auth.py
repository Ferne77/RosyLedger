"""Authentication and account-management routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.auth import current_user, public_user
from app.db import get_db
from app.default_categories import ensure_default_categories
from app.schemas import (
    DeleteAccountRequest,
    PasswordUpdate,
    UserLogin,
    UserRegister,
    UsernameUpdate,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _username_key(username: str) -> str:
    return username.strip().lower()


def _session_payload(user: dict) -> dict:
    safe_user = public_user(user)
    return {
        "token": create_access_token(safe_user["id"], safe_user["username"]),
        "user": safe_user,
    }


@router.post("/register", status_code=201)
async def register(body: UserRegister):
    db = get_db()
    username = body.username.strip()
    key = _username_key(username)
    existing = await db["users"].find_one({"usernameKey": key})
    if existing:
        raise HTTPException(status_code=409, detail={"error": "Username already exists"})
    now = datetime.utcnow()
    result = await db["users"].insert_one(
        {
            "username": username,
            "usernameKey": key,
            "passwordHash": hash_password(body.password),
            "createdAt": now,
            "updatedAt": now,
        }
    )
    user = await db["users"].find_one({"_id": result.inserted_id})
    await ensure_default_categories(db, result.inserted_id)
    return _session_payload(user)


@router.post("/login")
async def login(body: UserLogin):
    db = get_db()
    user = await db["users"].find_one({"usernameKey": _username_key(body.username)})
    if not user or not verify_password(body.password, user.get("passwordHash", "")):
        raise HTTPException(status_code=401, detail={"error": "Invalid username or password"})
    await ensure_default_categories(db, user["_id"])
    return _session_payload(user)


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    await ensure_default_categories(get_db(), user["_id"])
    return {"user": public_user(user)}


@router.put("/username")
async def update_username(body: UsernameUpdate, user: dict = Depends(current_user)):
    db = get_db()
    username = body.username.strip()
    key = _username_key(username)
    existing = await db["users"].find_one(
        {"usernameKey": key, "_id": {"$ne": user["_id"]}}
    )
    if existing:
        raise HTTPException(status_code=409, detail={"error": "Username already exists"})
    await db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {"username": username, "usernameKey": key, "updatedAt": datetime.utcnow()}},
    )
    updated = await db["users"].find_one({"_id": user["_id"]})
    return _session_payload(updated)


@router.put("/password")
async def update_password(body: PasswordUpdate, user: dict = Depends(current_user)):
    if not verify_password(body.currentPassword, user.get("passwordHash", "")):
        raise HTTPException(status_code=400, detail={"error": "Current password is incorrect"})
    await get_db()["users"].update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "passwordHash": hash_password(body.newPassword),
                "updatedAt": datetime.utcnow(),
            }
        },
    )
    return {"ok": True}


@router.delete("/account")
async def delete_account(
    body: DeleteAccountRequest,
    user: dict = Depends(current_user),
):
    if not verify_password(body.password, user.get("passwordHash", "")):
        raise HTTPException(status_code=400, detail={"error": "Password is incorrect"})
    db = get_db()
    user_filter = {"userId": user["_id"]}
    await db["expenses"].delete_many(user_filter)
    await db["categories"].delete_many(user_filter)
    await db["budgets"].delete_many(user_filter)
    await db["quickTemplates"].delete_many(user_filter)
    await db["users"].delete_one({"_id": user["_id"]})
    return {"ok": True}
