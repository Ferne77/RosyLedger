"""In-memory SSE event bus keyed by user id."""

import asyncio
from collections import defaultdict


class EventBus:
    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def register(self, user_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._queues[user_id].append(queue)
        return queue

    def unregister(self, user_id: str, queue: asyncio.Queue) -> None:
        items = self._queues.get(user_id, [])
        if queue in items:
            items.remove(queue)
        if not items and user_id in self._queues:
            del self._queues[user_id]

    def publish(self, user_id: str, event: dict) -> None:
        for queue in list(self._queues.get(user_id, [])):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                self.unregister(user_id, queue)


event_bus = EventBus()
