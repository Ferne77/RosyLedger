"""Server-Sent Events stream for live dashboard updates."""

import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.auth import current_user_sse
from app.event_bus import event_bus

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/stream")
async def stream_events(user: dict = Depends(current_user_sse)):
    user_id = str(user["_id"])

    async def generator():
        queue = event_bus.register(user_id)
        try:
            yield ": connected\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        finally:
            event_bus.unregister(user_id, queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
