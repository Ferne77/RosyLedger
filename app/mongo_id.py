"""
Parse MongoDB ObjectIds from URL path segments; reject invalid strings with HTTP 400.
"""

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException


def require_object_id(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except InvalidId:
        raise HTTPException(status_code=400, detail={"error": "Invalid id"})
