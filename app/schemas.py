"""
Pydantic request/response models and small validation helpers (month strings, cents).
"""

import re
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

_MONTH = re.compile(r"^\d{4}-\d{2}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_USERNAME = re.compile(r"^[A-Za-z0-9_.@-]+$")


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("username")
    @classmethod
    def clean_username(cls, v: str) -> str:
        value = v.strip()
        if not _USERNAME.match(value):
            raise ValueError(
                "username can only contain letters, numbers, dot, underscore, @, and hyphen"
            )
        return value


class UserLogin(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def clean_login_username(cls, v: str) -> str:
        return v.strip()


class UsernameUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=64)

    @field_validator("username")
    @classmethod
    def clean_username(cls, v: str) -> str:
        value = v.strip()
        if not _USERNAME.match(value):
            raise ValueError(
                "username can only contain letters, numbers, dot, underscore, @, and hyphen"
            )
        return value


class PasswordUpdate(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=128)
    newPassword: str = Field(min_length=6, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class BudgetUpdate(BaseModel):
    month: str
    amount: float = Field(ge=0, le=1_000_000)

    @field_validator("month")
    @classmethod
    def validate_month(cls, v: str) -> str:
        if not _MONTH.match(v):
            raise ValueError("month must be YYYY-MM")
        return v


class SpendingGoalUpdate(BaseModel):
    month: str
    percent: float = Field(ge=0, le=95)

    @field_validator("month")
    @classmethod
    def validate_month(cls, v: str) -> str:
        if not _MONTH.match(v):
            raise ValueError("month must be YYYY-MM")
        return v


class CategoryBudgetUpdate(BaseModel):
    month: str
    categoryId: str | int
    amount: float = Field(ge=0, le=1_000_000)

    @field_validator("month")
    @classmethod
    def validate_month(cls, v: str) -> str:
        if not _MONTH.match(v):
            raise ValueError("month must be YYYY-MM")
        return v

    @field_validator("categoryId", mode="before")
    @classmethod
    def coerce_category_id(cls, v: Any) -> str:
        return str(v).strip()


class QuickTemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    categoryId: str | int
    amount: float = Field(gt=0, le=1_000_000)
    description: str = Field(default="", max_length=200)

    @field_validator("categoryId", mode="before")
    @classmethod
    def coerce_category_id(cls, v: Any) -> str:
        return str(v).strip()


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class ExpenseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    type: str = "expense"
    categoryId: str | int | None = None
    amount: float = Field(gt=0, le=1_000_000)
    date: str
    description: str = ""
    emotionTag: str | None = Field(default=None, max_length=16)
    receiptDataUrl: str | None = Field(default=None, max_length=1_500_000)
    receiptName: str | None = Field(default=None, max_length=120)
    clientId: str | None = Field(default=None, max_length=64)

    @field_validator("emotionTag")
    @classmethod
    def validate_emotion(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        value = v.strip().lower()
        if value not in {"happy", "impulse", "necessary"}:
            raise ValueError("emotionTag must be happy, impulse, or necessary")
        return value

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        if not _DATE.match(v):
            raise ValueError("date must be YYYY-MM-DD")
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        value = (v or "expense").strip().lower()
        if value not in {"expense", "income"}:
            raise ValueError("type must be expense or income")
        return value

    @field_validator("categoryId", mode="before")
    @classmethod
    def coerce_category_id(cls, v: Any) -> str | None:
        if v is None or str(v).strip() == "":
            return None
        return str(v).strip()

    @model_validator(mode="after")
    def require_category_for_expenses(self):
        if self.type == "expense" and not self.categoryId:
            raise ValueError("categoryId is required for expenses")
        return self

    @field_validator("receiptDataUrl")
    @classmethod
    def validate_receipt(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not v.startswith("data:image/"):
            raise ValueError("receipt must be an image data URL")
        return v


class ExpenseSyncItem(ExpenseCreate):
    clientId: str = Field(min_length=8, max_length=64)


class ExpenseSyncRequest(BaseModel):
    items: list[ExpenseSyncItem] = Field(min_length=1, max_length=50)


class CategoryBudgetBatchUpdate(BaseModel):
    month: str
    allocations: dict[str, float]

    @field_validator("month")
    @classmethod
    def validate_month(cls, v: str) -> str:
        if not _MONTH.match(v):
            raise ValueError("month must be YYYY-MM")
        return v


class ExpenseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    type: str | None = None
    categoryId: str | int | None = None
    amount: float | None = Field(default=None, gt=0, le=1_000_000)
    date: str | None = None
    description: str | None = None
    emotionTag: str | None = Field(default=None, max_length=16)
    receiptDataUrl: str | None = Field(default=None, max_length=1_500_000)
    receiptName: str | None = Field(default=None, max_length=120)

    @field_validator("emotionTag")
    @classmethod
    def validate_emotion(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        value = v.strip().lower()
        if value not in {"happy", "impulse", "necessary"}:
            raise ValueError("emotionTag must be happy, impulse, or necessary")
        return value

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not _DATE.match(v):
            raise ValueError("date must be YYYY-MM-DD")
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        value = (v or "expense").strip().lower()
        if value not in {"expense", "income"}:
            raise ValueError("type must be expense or income")
        return value

    @field_validator("categoryId", mode="before")
    @classmethod
    def coerce_category_id(cls, v: Any) -> str | None:
        if v is None or str(v).strip() == "":
            return None
        return str(v).strip()

    @field_validator("receiptDataUrl")
    @classmethod
    def validate_receipt(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not v.startswith("data:image/"):
            raise ValueError("receipt must be an image data URL")
        return v

    @model_validator(mode="after")
    def at_least_one_field(self):
        if self.model_dump(exclude_none=True) == {}:
            raise ValueError("No fields to update")
        return self


class ChatTurn(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=500)


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    month: str | None = None
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)

    @field_validator("month")
    @classmethod
    def validate_month(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not _MONTH.match(v):
            raise ValueError("month must be YYYY-MM")
        return v


class AssistantQuickRecord(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0, le=1_000_000)
    categoryId: str | int | None = None
    type: str = "expense"
    date: str | None = None
    emotionTag: str | None = Field(default=None, max_length=16)

    @field_validator("emotionTag")
    @classmethod
    def validate_emotion(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        value = v.strip().lower()
        if value not in {"happy", "impulse", "necessary"}:
            raise ValueError("emotionTag must be happy, impulse, or necessary")
        return value

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not _DATE.match(v):
            raise ValueError("date must be YYYY-MM-DD")
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        value = (v or "expense").strip().lower()
        if value not in {"expense", "income"}:
            raise ValueError("type must be expense or income")
        return value

    @field_validator("categoryId", mode="before")
    @classmethod
    def coerce_category_id(cls, v: Any) -> str | None:
        if v is None or str(v).strip() == "":
            return None
        return str(v).strip()


def month_param_ok(value: str) -> bool:
    return bool(_MONTH.match(value))


def to_amount_cents(amount: float) -> int:
    return int(round(amount * 100))


class MoodCheckinCreate(BaseModel):
    mood: str = Field(pattern=r"^(happy|neutral|low)$")


class WishlistCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0, le=1_000_000)


class WishlistSavedUpdate(BaseModel):
    saved: float = Field(ge=0, le=1_000_000)


class ThemeUpdate(BaseModel):
    theme: str = Field(min_length=2, max_length=32)
