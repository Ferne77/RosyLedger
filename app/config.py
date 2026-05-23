"""Centralized application configuration with fixed in-code defaults."""

from functools import lru_cache

from pydantic import BaseModel


class AppSettings(BaseModel):
    """Typed configuration container shared by app runtime and utility scripts."""

    mongodb_uri: str = (
        "mongodb+srv://user2:DB123456@assignmen1.gynue9x.mongodb.net/"
        "?appName=Assignmen1"
    )
    db_name: str = "expense_tracker_dev"
    port: int = 3000
    node_env: str = "development"
    auth_secret: str = "rosyledger-local-dev-secret-25656632"

    def has_valid_mongodb_uri(self) -> bool:
        """Return whether MongoDB URI is present and not using placeholders."""
        uri = (self.mongodb_uri or "").strip()
        if not uri:
            return False
        return "<password>" not in uri and "<user>" not in uri


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    """Return a singleton settings instance."""
    return AppSettings()


settings = get_settings()
