import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import MONGODB_URI, NOSQL_JSON_PATH


class CampusDocumentStore:
    def __init__(self, file_path: str = NOSQL_JSON_PATH, mongo_uri: str = MONGODB_URI):
        self.file_path = Path(file_path)
        self.mongo_uri = mongo_uri
        self._lock = asyncio.Lock()
        self._mongo_db = None

        if self.mongo_uri:
            try:
                from motor.motor_asyncio import AsyncIOMotorClient

                client = AsyncIOMotorClient(self.mongo_uri)
                self._mongo_db = client["klh_lost_found_nosql"]
            except ImportError:
                self._mongo_db = None

        if not self.file_path.exists():
            self._write_disk(
                {
                    "item_flexible_details": [],
                    "claim_verification_threads": [],
                    "item_sightings": [],
                }
            )

    def _read_disk(self) -> Dict[str, List[Dict[str, Any]]]:
        if not self.file_path.exists():
            return {
                "item_flexible_details": [],
                "claim_verification_threads": [],
                "item_sightings": [],
            }
        try:
            data = json.loads(self.file_path.read_text(encoding="utf-8"))
            data.setdefault("item_flexible_details", [])
            data.setdefault("claim_verification_threads", [])
            data.setdefault("item_sightings", [])
            return data
        except json.JSONDecodeError:
            return {
                "item_flexible_details": [],
                "claim_verification_threads": [],
                "item_sightings": [],
            }

    def _write_disk(self, data: Dict[str, List[Dict[str, Any]]]) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self.file_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    async def insert_item_details(
        self,
        item_id: int,
        tags: List[str],
        custom_attributes: Dict[str, Any],
        finder_secret_clue: Optional[str] = None,
        handover_instructions: Optional[str] = None,
    ) -> str:
        doc_id = f"doc_{uuid.uuid4().hex[:16]}"
        document = {
            "_id": doc_id,
            "item_id": item_id,
            "tags": [t.strip() for t in tags if t and t.strip()],
            "custom_attributes": custom_attributes or {},
            "finder_secret_clue": finder_secret_clue or "",
            "handover_instructions": handover_instructions or "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if self._mongo_db is not None:
            await self._mongo_db["item_flexible_details"].update_one(
                {"item_id": item_id},
                {"$set": document},
                upsert=True,
            )
            return doc_id

        async with self._lock:
            store = self._read_disk()
            store["item_flexible_details"] = [
                d for d in store["item_flexible_details"] if d.get("item_id") != item_id
            ]
            store["item_flexible_details"].append(document)
            self._write_disk(store)
        return doc_id

    async def delete_item_details(self, item_id: int) -> None:
        if self._mongo_db is not None:
            await self._mongo_db["item_flexible_details"].delete_many({"item_id": item_id})
            await self._mongo_db["item_sightings"].delete_many({"item_id": item_id})
            return

        async with self._lock:
            store = self._read_disk()
            store["item_flexible_details"] = [
                d for d in store["item_flexible_details"] if d.get("item_id") != item_id
            ]
            store["item_sightings"] = [
                s for s in store["item_sightings"] if s.get("item_id") != item_id
            ]
            self._write_disk(store)

    async def get_item_details(self, item_id: int, include_secret: bool = False) -> Dict[str, Any]:
        if self._mongo_db is not None:
            doc = await self._mongo_db["item_flexible_details"].find_one({"item_id": item_id})
        else:
            store = self._read_disk()
            doc = next(
                (d for d in store.get("item_flexible_details", []) if d.get("item_id") == item_id),
                None,
            )
        if not doc:
            return {"tags": [], "custom_attributes": {}, "handover_instructions": ""}

        result = {
            "doc_id": doc.get("_id"),
            "tags": doc.get("tags", []),
            "custom_attributes": doc.get("custom_attributes", {}),
            "handover_instructions": doc.get("handover_instructions", ""),
        }
        if include_secret:
            result["finder_secret_clue"] = doc.get("finder_secret_clue", "")
        return result

    async def get_bulk_item_details(self, item_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        if not item_ids:
            return {}
        id_set = set(item_ids)
        if self._mongo_db is not None:
            cursor = self._mongo_db["item_flexible_details"].find({"item_id": {"$in": list(id_set)}})
            docs = await cursor.to_list(length=500)
            s_cursor = self._mongo_db["item_sightings"].find({"item_id": {"$in": list(id_set)}})
            sightings = await s_cursor.to_list(length=500)
        else:
            store = self._read_disk()
            docs = [
                d for d in store.get("item_flexible_details", []) if d.get("item_id") in id_set
            ]
            sightings = [
                s for s in store.get("item_sightings", []) if s.get("item_id") in id_set
            ]

        sighting_counts: Dict[int, int] = {}
        for s in sightings:
            iid = int(s["item_id"])
            sighting_counts[iid] = sighting_counts.get(iid, 0) + 1

        out: Dict[int, Dict[str, Any]] = {}
        for iid in id_set:
            out[int(iid)] = {
                "tags": [],
                "custom_attributes": {},
                "handover_instructions": "",
                "sighting_count": sighting_counts.get(int(iid), 0),
            }
        for d in docs:
            iid = int(d["item_id"])
            out[iid] = {
                "doc_id": d.get("_id"),
                "tags": d.get("tags", []),
                "custom_attributes": d.get("custom_attributes", {}),
                "handover_instructions": d.get("handover_instructions", ""),
                "sighting_count": sighting_counts.get(iid, 0),
            }
        return out

    async def add_item_sighting(
        self,
        item_id: int,
        author_id: int,
        author_name: str,
        author_roll: str,
        note: str,
    ) -> Dict[str, Any]:
        entry = {
            "id": f"sgt_{uuid.uuid4().hex[:10]}",
            "item_id": int(item_id),
            "author_id": int(author_id),
            "author_name": author_name,
            "author_roll": author_roll,
            "note": note.strip(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if self._mongo_db is not None:
            await self._mongo_db["item_sightings"].insert_one(dict(entry))
            return entry

        async with self._lock:
            store = self._read_disk()
            store["item_sightings"].append(entry)
            self._write_disk(store)
        return entry

    async def get_item_sightings(self, item_id: int) -> List[Dict[str, Any]]:
        if self._mongo_db is not None:
            cursor = self._mongo_db["item_sightings"].find({"item_id": int(item_id)})
            docs = await cursor.to_list(length=100)
            for d in docs:
                d.pop("_id", None)
            return docs

        store = self._read_disk()
        return [
            s for s in store.get("item_sightings", []) if int(s.get("item_id", 0)) == int(item_id)
        ]

    async def append_claim_timeline_event(
        self, claim_id: int, actor_name: str, actor_role: str, message: str
    ) -> None:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor_name": actor_name,
            "actor_role": actor_role,
            "message": message,
        }
        if self._mongo_db is not None:
            await self._mongo_db["claim_verification_threads"].update_one(
                {"claim_id": claim_id},
                {"$push": {"events": entry}, "$setOnInsert": {"claim_id": claim_id}},
                upsert=True,
            )
            return

        async with self._lock:
            store = self._read_disk()
            threads = store["claim_verification_threads"]
            thread = next((t for t in threads if t.get("claim_id") == claim_id), None)
            if not thread:
                thread = {"_id": f"thr_{uuid.uuid4().hex[:12]}", "claim_id": claim_id, "events": []}
                threads.append(thread)
            thread["events"].append(entry)
            self._write_disk(store)

    async def get_claim_timeline(self, claim_id: int) -> List[Dict[str, Any]]:
        if self._mongo_db is not None:
            doc = await self._mongo_db["claim_verification_threads"].find_one({"claim_id": claim_id})
            return doc.get("events", []) if doc else []
        store = self._read_disk()
        doc = next(
            (t for t in store.get("claim_verification_threads", []) if t.get("claim_id") == claim_id),
            None,
        )
        return doc.get("events", []) if doc else []


document_store = CampusDocumentStore()


def get_document_store() -> CampusDocumentStore:
    return document_store
