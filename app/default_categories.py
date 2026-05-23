"""
Default category names when the database has none.

Kept in sync with ``scripts/seed.py`` sample data labels.
"""

DEFAULT_CATEGORY_NAMES = (
    "Food",
    "Transport",
    "Rent",
    "Utilities",
    "Entertainment",
    "Health",
    "Education",
    "Shopping",
)


async def ensure_default_categories(db, user_id=None) -> int:
    """Insert default categories if the collection is empty. Returns count inserted."""
    col = db["categories"]
    query = {"userId": user_id} if user_id is not None else {}
    n = await col.count_documents(query)
    if n > 0:
        return 0
    docs = [
        {"name": name, **({"userId": user_id} if user_id is not None else {})}
        for name in DEFAULT_CATEGORY_NAMES
    ]
    if not docs:
        return 0
    await col.insert_many(docs)
    return len(docs)
