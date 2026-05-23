"""
Singleton async Motor client for MongoDB Atlas (TLS CA via certifi).
"""

import certifi
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        if not settings.has_valid_mongodb_uri():
            raise RuntimeError(
                "MONGODB_URI is missing or contains placeholders. "
                    "Update app/config.py with a valid URI before starting the app."
            )
        _client = AsyncIOMotorClient(
            settings.mongodb_uri,
            tlsCAFile=certifi.where(),
        )
    return _client


def get_db():
    return get_client()[settings.db_name]


async def ping_db() -> None:
    await get_client().admin.command("ping")
