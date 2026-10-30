import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx

from config import EXPRESS_SERVICE_URL, KAFKA_BOOTSTRAP_SERVERS


class DomainEventBroker:
    def __init__(self) -> None:
        self._offsets: Dict[str, int] = {}
        self._recent_events: List[Dict[str, Any]] = []

    async def publish(self, topic: str, key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        offset = self._offsets.get(topic, 0) + 1
        self._offsets[topic] = offset
        envelope = {
            "event_id": f"evt_{uuid.uuid4().hex[:14]}",
            "topic": topic,
            "partition": hash(key) % 3,
            "offset": offset,
            "key": key,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        self._recent_events.append(envelope)
        if len(self._recent_events) > 200:
            self._recent_events = self._recent_events[-200:]

        asyncio.create_task(self._deliver_async(envelope))
        return envelope

    async def _deliver_async(self, envelope: Dict[str, Any]) -> None:
        if KAFKA_BOOTSTRAP_SERVERS:
            try:
                from aiokafka import AIOKafkaProducer

                producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
                await producer.start()
                try:
                    await producer.send_and_wait(
                        envelope["topic"],
                        json.dumps(envelope).encode("utf-8"),
                        key=str(envelope["key"]).encode("utf-8"),
                    )
                finally:
                    await producer.stop()
            except Exception:
                pass

        if EXPRESS_SERVICE_URL:
            try:
                async with httpx.AsyncClient(timeout=2.5) as client:
                    await client.post(
                        f"{EXPRESS_SERVICE_URL}/internal/events",
                        json=envelope,
                    )
            except Exception:
                pass

    def recent_events(self, limit: int = 30) -> List[Dict[str, Any]]:
        return list(reversed(self._recent_events[-limit:]))


event_broker = DomainEventBroker()


def get_event_broker() -> DomainEventBroker:
    return event_broker
