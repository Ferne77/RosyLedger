"""Publish dashboard refresh events after data mutations."""

from app.event_bus import event_bus


def publish_refresh(user_id, scope: str = "all") -> None:
    event_bus.publish(
        str(user_id),
        {"type": "refresh", "scope": scope},
    )
