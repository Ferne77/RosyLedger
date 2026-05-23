"""Ensure MongoDB indexes used by advanced features."""

from app.db import get_db


async def ensure_indexes() -> None:
    db = get_db()
    await db["expenses"].create_index(
        [("userId", 1), ("deletedAt", 1), ("date", -1)],
        name="expenses_user_deleted_date",
    )
    await db["expenses"].create_index(
        [("userId", 1), ("clientId", 1)],
        unique=True,
        partialFilterExpression={"clientId": {"$type": "string"}},
        name="expenses_user_client_id",
    )
    await db["expenses"].create_index(
        [("deletedAt", 1)],
        expireAfterSeconds=60 * 60 * 24 * 30,
        name="expenses_deleted_ttl",
    )
    await db["moodCheckins"].create_index(
        [("userId", 1), ("date", -1)],
        unique=True,
        name="mood_user_date",
    )
    await db["wishlist"].create_index(
        [("userId", 1), ("createdAt", -1)],
        name="wishlist_user_created",
    )
    await db["companionProfiles"].create_index(
        [("userId", 1)],
        unique=True,
        name="companion_profile_user",
    )
