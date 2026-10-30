import json
import random
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware

from auth import (
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_password,
    require_staff,
    verify_password,
)
from event_bus import DomainEventBroker, get_event_broker
from matcher import compute_item_embedding, score_lost_found_pair, semantic_search_rank
from nosql_store import CampusDocumentStore, get_document_store
from schemas import (
    AuthResponse,
    ClaimCreateRequest,
    ClaimDecisionRequest,
    ItemCreateRequest,
    ItemUpdateRequest,
    LoginRequest,
    PassVerifyRequest,
    RegisterRequest,
    SightingCreateRequest,
    StatusUpdateRequest,
    UserProfile,
)
from seed import seed_initial_data
from sql_db import get_db_connection, init_sql_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_sql_db()
    await seed_initial_data()
    yield


app = FastAPI(
    title="KLH University Campus Lost & Found Core API",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _format_user(row: Any) -> UserProfile:
    return UserProfile(
        id=row["id"],
        roll_number=row["roll_number"],
        full_name=row["full_name"],
        email=row["email"],
        department=row["department"],
        phone=row["phone"] or "",
        role=row["role"],
    )


async def _hydrate_items(
    rows: List[Any],
    doc_store: CampusDocumentStore,
    include_embedding: bool = False,
) -> List[Dict[str, Any]]:
    if not rows:
        return []
    item_ids = [int(r["id"]) for r in rows]
    nosql_map = await doc_store.get_bulk_item_details(item_ids)
    hydrated: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        emb_raw = d.pop("embedding_json", None)
        if include_embedding:
            d["embedding"] = json.loads(emb_raw) if emb_raw else []
        extra = nosql_map.get(int(d["id"]), {})
        d["tags"] = extra.get("tags", [])
        d["custom_attributes"] = extra.get("custom_attributes", {})
        d["handover_instructions"] = extra.get("handover_instructions", "")
        d["sighting_count"] = extra.get("sighting_count", 0)
        hydrated.append(d)
    return hydrated


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "campus": "KLH University"}


@app.get("/api/auth/demo-accounts")
async def list_demo_accounts(conn=Depends(get_db_connection)):
    cur = await conn.execute(
        """
        SELECT id, roll_number, full_name, email, department, role
        FROM users
        ORDER BY CASE WHEN role = 'staff' THEN 1 ELSE 0 END, id ASC
        """
    )
    rows = await cur.fetchall()
    return [dict(r) for r in rows]


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response, conn=Depends(get_db_connection)):
    ident = payload.identifier.strip()
    cur = await conn.execute(
        """
        SELECT * FROM users
        WHERE LOWER(roll_number) = LOWER(?) OR LOWER(email) = LOWER(?)
        """,
        (ident, ident),
    )
    row = await cur.fetchone()
    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid KLH roll number/email or password.",
        )
    user_dict = dict(row)
    token = create_access_token(user_dict)
    response.set_cookie(
        key="klh_token",
        value=token,
        max_age=72 * 3600,
        httponly=True,
        samesite="lax",
    )
    return AuthResponse(access_token=token, user=_format_user(user_dict))


@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response, conn=Depends(get_db_connection)):
    cur = await conn.execute(
        "SELECT id FROM users WHERE LOWER(roll_number) = LOWER(?) OR LOWER(email) = LOWER(?)",
        (payload.roll_number.strip(), payload.email.strip()),
    )
    if await cur.fetchone():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this KLH roll number or email already exists.",
        )

    pw_hash = hash_password(payload.password)
    insert_cur = await conn.execute(
        """
        INSERT INTO users (roll_number, full_name, email, department, phone, role, password_hash)
        VALUES (?, ?, ?, ?, ?, 'student', ?)
        """,
        (
            payload.roll_number.strip().upper(),
            payload.full_name.strip(),
            payload.email.strip().lower(),
            payload.department.strip(),
            (payload.phone or "").strip(),
            pw_hash,
        ),
    )
    await conn.commit()

    user_cur = await conn.execute("SELECT * FROM users WHERE id = ?", (insert_cur.lastrowid,))
    user_row = dict(await user_cur.fetchone())
    token = create_access_token(user_row)
    response.set_cookie(
        key="klh_token",
        value=token,
        max_age=72 * 3600,
        httponly=True,
        samesite="lax",
    )
    return AuthResponse(access_token=token, user=_format_user(user_row))


@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="klh_token")
    return {"status": "signed_out"}


@app.get("/api/auth/me", response_model=UserProfile)
async def current_profile(user: dict = Depends(get_current_user)):
    return _format_user(user)


@app.get("/api/categories")
async def get_categories(conn=Depends(get_db_connection)):
    cur = await conn.execute(
        """
        SELECT
            c.id,
            c.slug,
            c.display_name,
            c.default_hold_days,
            COUNT(i.id) AS item_count
        FROM categories c
        LEFT JOIN items i ON i.category_id = c.id AND i.status != 'archived'
        GROUP BY c.id, c.slug, c.display_name, c.default_hold_days
        ORDER BY c.id ASC
        """
    )
    return [dict(r) for r in await cur.fetchall()]


@app.get("/api/locations")
async def get_locations(conn=Depends(get_db_connection)):
    cur = await conn.execute(
        """
        WITH building_counts AS (
            SELECT
                cl.id,
                cl.code,
                cl.building_name,
                cl.zone,
                cl.desk_location,
                cl.map_x,
                cl.map_y,
                COUNT(i.id) AS total_items,
                SUM(CASE WHEN i.item_type = 'lost' AND i.status NOT IN ('reunited', 'archived') THEN 1 ELSE 0 END) AS active_lost,
                SUM(CASE WHEN i.item_type = 'found' AND i.status NOT IN ('reunited', 'archived') THEN 1 ELSE 0 END) AS active_found,
                SUM(CASE WHEN i.status = 'reunited' THEN 1 ELSE 0 END) AS reunited_items
            FROM campus_locations cl
            LEFT JOIN items i ON i.location_id = cl.id
            GROUP BY cl.id
        )
        SELECT
            *,
            RANK() OVER (ORDER BY total_items DESC) AS activity_rank
        FROM building_counts
        ORDER BY id ASC
        """
    )
    return [dict(r) for r in await cur.fetchall()]


@app.get("/api/summary")
async def get_campus_summary(conn=Depends(get_db_connection)):
    cur = await conn.execute(
        """
        WITH item_totals AS (
            SELECT
                COUNT(*) AS total_reports,
                SUM(CASE WHEN item_type = 'lost' AND status NOT IN ('reunited', 'archived') THEN 1 ELSE 0 END) AS active_lost,
                SUM(CASE WHEN item_type = 'found' AND status NOT IN ('reunited', 'archived') THEN 1 ELSE 0 END) AS active_found,
                SUM(CASE WHEN status = 'reunited' THEN 1 ELSE 0 END) AS reunited_count,
                SUM(CASE WHEN status = 'ready_for_pickup' THEN 1 ELSE 0 END) AS ready_for_pickup_count
            FROM items
        ),
        match_totals AS (
            SELECT COUNT(*) AS active_matches
            FROM item_matches m
            JOIN items li ON li.id = m.lost_item_id
            JOIN items fi ON fi.id = m.found_item_id
            WHERE m.status IN ('suggested', 'claimed')
              AND li.status NOT IN ('reunited', 'archived')
              AND fi.status NOT IN ('reunited', 'archived')
        ),
        claim_totals AS (
            SELECT COUNT(*) AS pending_claims
            FROM claims
            WHERE status = 'pending_review'
        )
        SELECT
            it.total_reports,
            COALESCE(it.active_lost, 0) AS active_lost,
            COALESCE(it.active_found, 0) AS active_found,
            COALESCE(it.reunited_count, 0) AS reunited_count,
            COALESCE(it.ready_for_pickup_count, 0) AS ready_for_pickup_count,
            mt.active_matches,
            ct.pending_claims
        FROM item_totals it
        CROSS JOIN match_totals mt
        CROSS JOIN claim_totals ct
        """
    )
    stats = dict(await cur.fetchone())

    hotspot_cur = await conn.execute(
        """
        WITH spot_stats AS (
            SELECT
                cl.building_name,
                cl.desk_location,
                COUNT(i.id) AS reports_logged
            FROM campus_locations cl
            LEFT JOIN items i ON i.location_id = cl.id
            GROUP BY cl.id
        )
        SELECT
            building_name,
            desk_location,
            reports_logged,
            ROW_NUMBER() OVER (ORDER BY reports_logged DESC, building_name ASC) AS rank_num
        FROM spot_stats
        WHERE reports_logged > 0
        ORDER BY rank_num ASC
        LIMIT 4
        """
    )
    stats["top_locations"] = [dict(r) for r in await hotspot_cur.fetchall()]
    return stats


@app.get("/api/items")
async def list_items(
    item_type: Optional[str] = Query(default=None),
    category_id: Optional[int] = Query(default=None),
    location_id: Optional[int] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    q: Optional[str] = Query(default=None),
    mine: bool = Query(default=False),
    user: Optional[dict] = Depends(get_optional_user),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
):
    clauses = ["i.status != 'archived'"]
    params: List[Any] = []

    if item_type in ("lost", "found"):
        clauses.append("i.item_type = ?")
        params.append(item_type)
    if category_id:
        clauses.append("i.category_id = ?")
        params.append(category_id)
    if location_id:
        clauses.append("i.location_id = ?")
        params.append(location_id)
    if status_filter:
        if status_filter == "active":
            clauses.append("i.status != 'reunited'")
        else:
            clauses.append("i.status = ?")
            params.append(status_filter)
    if mine:
        if not user:
            return []
        clauses.append("i.reporter_id = ?")
        params.append(user["id"])

    where_sql = " AND ".join(clauses)
    query_sql = f"""
        SELECT
            i.*,
            c.slug AS category_slug,
            c.display_name AS category_name,
            cl.code AS location_code,
            cl.building_name,
            cl.zone,
            cl.desk_location,
            u.full_name AS reporter_name,
            u.department AS reporter_department,
            u.roll_number AS reporter_roll,
            (
                SELECT COUNT(*)
                FROM item_matches m
                JOIN items opp ON opp.id = CASE WHEN m.lost_item_id = i.id THEN m.found_item_id ELSE m.lost_item_id END
                WHERE (m.lost_item_id = i.id OR m.found_item_id = i.id)
                  AND m.status != 'dismissed'
                  AND opp.status NOT IN ('reunited', 'archived')
            ) AS match_count
        FROM items i
        JOIN categories c ON c.id = i.category_id
        JOIN campus_locations cl ON cl.id = i.location_id
        JOIN users u ON u.id = i.reporter_id
        WHERE {where_sql}
        ORDER BY
            CASE WHEN i.status = 'reunited' THEN 1 ELSE 0 END ASC,
            i.event_date DESC,
            i.id DESC
    """
    cur = await conn.execute(query_sql, params)
    rows = await cur.fetchall()
    need_emb = bool(q and q.strip())
    items = await _hydrate_items(rows, doc_store, include_embedding=need_emb)

    if need_emb and q:
        ranked = semantic_search_rank(q, items)
        for it in ranked:
            it.pop("embedding", None)
        return ranked

    return items


@app.get("/api/items/{item_id}")
async def get_item_detail(
    item_id: int,
    user: Optional[dict] = Depends(get_optional_user),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
):
    cur = await conn.execute(
        """
        SELECT
            i.*,
            c.slug AS category_slug,
            c.display_name AS category_name,
            cl.code AS location_code,
            cl.building_name,
            cl.zone,
            cl.desk_location,
            u.full_name AS reporter_name,
            u.department AS reporter_department,
            u.roll_number AS reporter_roll
        FROM items i
        JOIN categories c ON c.id = i.category_id
        JOIN campus_locations cl ON cl.id = i.location_id
        JOIN users u ON u.id = i.reporter_id
        WHERE i.id = ?
        """,
        (item_id,),
    )
    row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Campus item record not found.")

    item = dict(row)
    item.pop("embedding_json", None)
    include_secret = bool(user and (user["role"] == "staff" or user["id"] == item["reporter_id"]))
    nosql_data = await doc_store.get_item_details(item_id, include_secret=include_secret)
    item.update(nosql_data)
    item["sightings"] = await doc_store.get_item_sightings(item_id)

    hist_cur = await conn.execute(
        """
        SELECT h.*, u.full_name AS actor_name
        FROM item_status_history h
        LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.item_id = ?
        ORDER BY h.id ASC
        """,
        (item_id,),
    )
    item["status_history"] = [dict(r) for r in await hist_cur.fetchall()]

    if item["item_type"] == "lost":
        match_sql = """
            SELECT
                m.id AS match_id,
                m.similarity_score,
                m.match_reason,
                m.status AS match_status,
                opp.id AS counterpart_id,
                opp.reference_code,
                opp.item_type,
                opp.title,
                opp.description,
                opp.color,
                opp.brand,
                opp.event_date,
                opp.specific_spot,
                opp.status,
                opp.custody_holder,
                opp.verification_prompt,
                opp.photo_data_url,
                cl.building_name,
                cl.desk_location,
                c.display_name AS category_name,
                ROW_NUMBER() OVER (ORDER BY m.similarity_score DESC) AS match_rank
            FROM item_matches m
            JOIN items opp ON opp.id = m.found_item_id
            JOIN campus_locations cl ON cl.id = opp.location_id
            JOIN categories c ON c.id = opp.category_id
            WHERE m.lost_item_id = ? AND m.status != 'dismissed' AND opp.status NOT IN ('reunited', 'archived')
            ORDER BY m.similarity_score DESC
        """
    else:
        match_sql = """
            SELECT
                m.id AS match_id,
                m.similarity_score,
                m.match_reason,
                m.status AS match_status,
                opp.id AS counterpart_id,
                opp.reference_code,
                opp.item_type,
                opp.title,
                opp.description,
                opp.color,
                opp.brand,
                opp.event_date,
                opp.specific_spot,
                opp.status,
                opp.custody_holder,
                opp.verification_prompt,
                opp.photo_data_url,
                cl.building_name,
                cl.desk_location,
                c.display_name AS category_name,
                ROW_NUMBER() OVER (ORDER BY m.similarity_score DESC) AS match_rank
            FROM item_matches m
            JOIN items opp ON opp.id = m.lost_item_id
            JOIN campus_locations cl ON cl.id = opp.location_id
            JOIN categories c ON c.id = opp.category_id
            WHERE m.found_item_id = ? AND m.status != 'dismissed' AND opp.status NOT IN ('reunited', 'archived')
            ORDER BY m.similarity_score DESC
        """
    m_cur = await conn.execute(match_sql, (item_id,))
    item["matches"] = [dict(r) for r in await m_cur.fetchall()]
    return item


@app.post("/api/items", status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: ItemCreateRequest,
    user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
    broker: DomainEventBroker = Depends(get_event_broker),
):
    cat_cur = await conn.execute("SELECT * FROM categories WHERE id = ?", (payload.category_id,))
    cat = await cat_cur.fetchone()
    if not cat:
        raise HTTPException(status_code=400, detail="Please choose a valid item category.")

    loc_cur = await conn.execute("SELECT * FROM campus_locations WHERE id = ?", (payload.location_id,))
    loc = await loc_cur.fetchone()
    if not loc:
        raise HTTPException(status_code=400, detail="Please choose a valid campus location.")

    count_cur = await conn.execute("SELECT COALESCE(MAX(id), 100) + 101 AS next_num FROM items")
    next_num = (await count_cur.fetchone())["next_num"]
    prefix = "KLH-L" if payload.item_type == "lost" else "KLH-F"
    ref_code = f"{prefix}{next_num}"

    tagged_roll = (payload.tagged_roll_number or "").strip().upper()
    extra_tags = list(payload.tags or [])
    if tagged_roll and tagged_roll not in extra_tags:
        extra_tags.append(tagged_roll)

    embedding = compute_item_embedding(
        title=payload.title,
        description=payload.description,
        color=payload.color or "",
        brand=payload.brand or "",
        category_slug=cat["slug"],
        location_name=loc["building_name"],
        tags=extra_tags,
        specific_spot=payload.specific_spot or "",
    )

    custody = (payload.custody_holder or "").strip()
    if payload.item_type == "found" and not custody:
        custody = loc["desk_location"]

    cur = await conn.execute(
        """
        INSERT INTO items (
            reference_code, item_type, title, description, color, brand,
            category_id, location_id, specific_spot, event_date, event_time_approx,
            status, custody_holder, verification_prompt, tagged_roll_number,
            reporter_id, embedding_json, photo_data_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
        """,
        (
            ref_code,
            payload.item_type,
            payload.title.strip(),
            payload.description.strip(),
            (payload.color or "").strip(),
            (payload.brand or "").strip(),
            payload.category_id,
            payload.location_id,
            (payload.specific_spot or "").strip(),
            payload.event_date,
            (payload.event_time_approx or "").strip(),
            custody,
            (payload.verification_prompt or "").strip(),
            tagged_roll,
            user["id"],
            json.dumps(embedding),
            payload.photo_data_url,
        ),
    )
    new_item_id = cur.lastrowid

    doc_id = await doc_store.insert_item_details(
        item_id=new_item_id,
        tags=extra_tags,
        custom_attributes=payload.custom_attributes,
        finder_secret_clue=payload.finder_secret_clue,
        handover_instructions=payload.handover_instructions,
    )
    await conn.execute("UPDATE items SET nosql_doc_id = ? WHERE id = ?", (doc_id, new_item_id))
    await conn.execute(
        """
        INSERT INTO item_status_history (item_id, previous_status, new_status, changed_by, note)
        VALUES (?, NULL, 'open', ?, ?)
        """,
        (new_item_id, user["id"], f"Reported as {payload.item_type} at {loc['building_name']}"),
    )

    opposite_type = "found" if payload.item_type == "lost" else "lost"
    opp_cur = await conn.execute(
        """
        SELECT i.*, c.slug AS category_slug, cl.building_name, cl.zone, cl.desk_location, u.roll_number AS reporter_roll
        FROM items i
        JOIN categories c ON c.id = i.category_id
        JOIN campus_locations cl ON cl.id = i.location_id
        JOIN users u ON u.id = i.reporter_id
        WHERE i.item_type = ? AND i.status NOT IN ('reunited', 'archived')
        """,
        (opposite_type,),
    )
    opp_rows = await opp_cur.fetchall()
    opp_hydrated = await _hydrate_items(opp_rows, doc_store, include_embedding=True)

    new_item_bundle = {
        "id": new_item_id,
        "title": payload.title,
        "description": payload.description,
        "color": payload.color or "",
        "brand": payload.brand or "",
        "category_id": payload.category_id,
        "category_slug": cat["slug"],
        "location_id": payload.location_id,
        "building_name": loc["building_name"],
        "specific_spot": payload.specific_spot or "",
        "zone": loc["zone"],
        "event_date": payload.event_date,
        "tags": extra_tags,
        "embedding": embedding,
    }

    discovered_matches: List[Dict[str, Any]] = []
    for candidate in opp_hydrated:
        if payload.item_type == "lost":
            sim_score, reason = score_lost_found_pair(new_item_bundle, candidate)
            if candidate.get("tagged_roll_number") and candidate["tagged_roll_number"].upper() == user["roll_number"].upper():
                sim_score = min(0.98, round(sim_score + 0.30, 4))
                reason = f"Roll number {user['roll_number']} written on item. " + reason
            lost_id, found_id = new_item_id, candidate["id"]
        else:
            sim_score, reason = score_lost_found_pair(candidate, new_item_bundle)
            if tagged_roll and str(candidate.get("reporter_roll", "")).upper() == tagged_roll:
                sim_score = min(0.98, round(sim_score + 0.30, 4))
                reason = f"Roll number {tagged_roll} matches owner. " + reason
            lost_id, found_id = candidate["id"], new_item_id

        if sim_score >= 0.46:
            await conn.execute(
                """
                INSERT OR REPLACE INTO item_matches (lost_item_id, found_item_id, similarity_score, match_reason, status)
                VALUES (?, ?, ?, ?, 'suggested')
                """,
                (lost_id, found_id, sim_score, reason),
            )
            if candidate["status"] == "open":
                await conn.execute("UPDATE items SET status = 'matched' WHERE id = ?", (candidate["id"],))
            discovered_matches.append(
                {
                    "counterpart_id": candidate["id"],
                    "reference_code": candidate["reference_code"],
                    "title": candidate["title"],
                    "building_name": candidate["building_name"],
                    "desk_location": candidate["desk_location"],
                    "event_date": candidate["event_date"],
                    "color": candidate["color"],
                    "similarity_score": sim_score,
                    "match_reason": reason,
                    "reporter_id": candidate["reporter_id"],
                }
            )

    if discovered_matches:
        await conn.execute("UPDATE items SET status = 'matched' WHERE id = ?", (new_item_id,))

    tagged_user_row = None
    if payload.item_type == "found" and tagged_roll:
        t_cur = await conn.execute(
            "SELECT id, full_name, roll_number FROM users WHERE UPPER(roll_number) = ?",
            (tagged_roll,),
        )
        tagged_user_row = await t_cur.fetchone()

    await conn.commit()

    discovered_matches.sort(key=lambda x: x["similarity_score"], reverse=True)

    await broker.publish(
        "campus.item.reported",
        ref_code,
        {
            "item_id": new_item_id,
            "reference_code": ref_code,
            "item_type": payload.item_type,
            "title": payload.title,
            "building_name": loc["building_name"],
            "reporter_id": user["id"],
            "reporter_name": user["full_name"],
            "matches_found": len(discovered_matches),
        },
    )

    if tagged_user_row:
        await broker.publish(
            "campus.item.roll_tagged",
            ref_code,
            {
                "item_id": new_item_id,
                "reference_code": ref_code,
                "title": payload.title,
                "tagged_user_id": tagged_user_row["id"],
                "tagged_roll_number": tagged_roll,
                "pickup_desk": custody,
            },
        )

    for top_m in discovered_matches[:3]:
        await broker.publish(
            "campus.match.discovered",
            ref_code,
            {
                "new_item_id": new_item_id,
                "new_item_title": payload.title,
                "counterpart_id": top_m["counterpart_id"],
                "counterpart_title": top_m["title"],
                "counterpart_reporter_id": top_m["reporter_id"],
                "reporter_id": user["id"],
                "similarity_pct": round(top_m["similarity_score"] * 100),
                "reason": top_m["match_reason"],
            },
        )

    detail = await get_item_detail(new_item_id, user=user, conn=conn, doc_store=doc_store)
    detail["instant_matches"] = discovered_matches[:5]
    return detail


@app.put("/api/items/{item_id}")
async def update_item(
    item_id: int,
    payload: ItemUpdateRequest,
    user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
):
    cur = await conn.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    existing = await cur.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found.")
    if user["role"] != "staff" and int(existing["reporter_id"]) != int(user["id"]):
        raise HTTPException(status_code=403, detail="You can only edit your own reports.")

    cat_cur = await conn.execute("SELECT * FROM categories WHERE id = ?", (payload.category_id,))
    cat = await cat_cur.fetchone()
    if not cat:
        raise HTTPException(status_code=400, detail="Invalid category.")

    loc_cur = await conn.execute("SELECT * FROM campus_locations WHERE id = ?", (payload.location_id,))
    loc = await loc_cur.fetchone()
    if not loc:
        raise HTTPException(status_code=400, detail="Invalid location.")

    tagged_roll = (payload.tagged_roll_number or "").strip().upper()
    tags_list = [payload.color or "", payload.brand or "", payload.specific_spot or "", tagged_roll]
    tags_clean = [t.strip() for t in tags_list if t and t.strip()]

    embedding = compute_item_embedding(
        title=payload.title,
        description=payload.description,
        color=payload.color or "",
        brand=payload.brand or "",
        category_slug=cat["slug"],
        location_name=loc["building_name"],
        tags=tags_clean,
        specific_spot=payload.specific_spot or "",
    )

    custody = (payload.custody_holder or "").strip()
    if existing["item_type"] == "found" and not custody:
        custody = loc["desk_location"]

    await conn.execute(
        """
        UPDATE items
        SET title = ?,
            description = ?,
            color = ?,
            brand = ?,
            category_id = ?,
            location_id = ?,
            specific_spot = ?,
            event_date = ?,
            custody_holder = ?,
            verification_prompt = ?,
            tagged_roll_number = ?,
            embedding_json = ?,
            updated_at = datetime('now')
        WHERE id = ?
        """,
        (
            payload.title.strip(),
            payload.description.strip(),
            (payload.color or "").strip(),
            (payload.brand or "").strip(),
            payload.category_id,
            payload.location_id,
            (payload.specific_spot or "").strip(),
            payload.event_date,
            custody,
            (payload.verification_prompt or "").strip(),
            tagged_roll,
            json.dumps(embedding),
            item_id,
        ),
    )
    await conn.commit()
    return await get_item_detail(item_id, user=user, conn=conn, doc_store=doc_store)


@app.delete("/api/items/{item_id}")
async def delete_item(
    item_id: int,
    user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
):
    cur = await conn.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    existing = await cur.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found.")
    if user["role"] != "staff" and int(existing["reporter_id"]) != int(user["id"]):
        raise HTTPException(status_code=403, detail="You can only delete your own reports.")

    await conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
    await conn.commit()
    await doc_store.delete_item_details(item_id)
    return {"deleted": True, "id": item_id}


@app.post("/api/items/{item_id}/sightings", status_code=status.HTTP_201_CREATED)
async def add_sighting_note(
    item_id: int,
    payload: SightingCreateRequest,
    user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
    broker: DomainEventBroker = Depends(get_event_broker),
):
    cur = await conn.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    item = await cur.fetchone()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    entry = await doc_store.add_item_sighting(
        item_id=item_id,
        author_id=user["id"],
        author_name=user["full_name"],
        author_roll=user["roll_number"],
        note=payload.note,
    )

    if int(item["reporter_id"]) != int(user["id"]):
        await broker.publish(
            "campus.item.sighted",
            item["reference_code"],
            {
                "item_id": item_id,
                "item_title": item["title"],
                "reporter_id": item["reporter_id"],
                "author_name": user["full_name"],
                "note": payload.note.strip(),
            },
        )

    return entry


@app.get("/api/matches")
async def list_smart_matches(
    mine_only: bool = Query(default=False),
    user: Optional[dict] = Depends(get_optional_user),
    conn=Depends(get_db_connection),
):
    filter_clause = ""
    params: List[Any] = []
    if mine_only:
        if not user:
            return []
        filter_clause = "AND (li.reporter_id = ? OR fi.reporter_id = ?)"
        params.extend([user["id"], user["id"]])

    cur = await conn.execute(
        f"""
        WITH ranked_matches AS (
            SELECT
                m.id AS match_id,
                m.similarity_score,
                m.match_reason,
                m.status AS match_status,
                m.created_at,
                li.id AS lost_id,
                li.reference_code AS lost_ref,
                li.title AS lost_title,
                li.description AS lost_description,
                li.color AS lost_color,
                li.event_date AS lost_date,
                li.specific_spot AS lost_spot,
                li.status AS lost_status,
                li.reporter_id AS lost_reporter_id,
                l_loc.building_name AS lost_building,
                l_usr.full_name AS lost_reporter_name,
                fi.id AS found_id,
                fi.reference_code AS found_ref,
                fi.title AS found_title,
                fi.description AS found_description,
                fi.color AS found_color,
                fi.event_date AS found_date,
                fi.specific_spot AS found_spot,
                fi.status AS found_status,
                fi.custody_holder AS found_custody,
                fi.verification_prompt AS found_verification_prompt,
                fi.tagged_roll_number AS found_tagged_roll,
                fi.reporter_id AS found_reporter_id,
                f_loc.building_name AS found_building,
                f_loc.desk_location AS found_desk,
                cat.display_name AS category_name,
                cat.slug AS category_slug,
                ROW_NUMBER() OVER (
                    PARTITION BY m.lost_item_id
                    ORDER BY m.similarity_score DESC
                ) AS rank_for_lost_item
            FROM item_matches m
            JOIN items li ON li.id = m.lost_item_id
            JOIN campus_locations l_loc ON l_loc.id = li.location_id
            JOIN users l_usr ON l_usr.id = li.reporter_id
            JOIN items fi ON fi.id = m.found_item_id
            JOIN campus_locations f_loc ON f_loc.id = fi.location_id
            JOIN categories cat ON cat.id = fi.category_id
            WHERE m.status != 'dismissed'
              AND li.status NOT IN ('reunited', 'archived')
              AND fi.status NOT IN ('reunited', 'archived')
              {filter_clause}
        )
        SELECT *
        FROM ranked_matches
        ORDER BY
            CASE WHEN found_status = 'reunited' THEN 1 ELSE 0 END ASC,
            similarity_score DESC,
            match_id DESC
        """,
        params,
    )
    return [dict(r) for r in await cur.fetchall()]


@app.post("/api/matches/{match_id}/dismiss")
async def dismiss_match(
    match_id: int,
    user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    cur = await conn.execute("SELECT * FROM item_matches WHERE id = ?", (match_id,))
    match = await cur.fetchone()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found.")

    await conn.execute(
        "UPDATE item_matches SET status = 'dismissed' WHERE id = ?",
        (match_id,),
    )
    for item_id in (match["lost_item_id"], match["found_item_id"]):
        rem_cur = await conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM item_matches
            WHERE (lost_item_id = ? OR found_item_id = ?) AND status != 'dismissed'
            """,
            (item_id, item_id),
        )
        if (await rem_cur.fetchone())["cnt"] == 0:
            await conn.execute(
                "UPDATE items SET status = 'open' WHERE id = ? AND status = 'matched'",
                (item_id,),
            )

    await conn.commit()
    return {"dismissed": True, "match_id": match_id}


@app.post("/api/claims", status_code=status.HTTP_201_CREATED)
async def submit_claim(
    payload: ClaimCreateRequest,
    user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
    broker: DomainEventBroker = Depends(get_event_broker),
):
    item_cur = await conn.execute(
        """
        SELECT i.*, cl.desk_location, cl.building_name
        FROM items i
        JOIN campus_locations cl ON cl.id = i.location_id
        WHERE i.id = ?
        """,
        (payload.item_id,),
    )
    item = await item_cur.fetchone()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    if item["item_type"] != "found":
        raise HTTPException(
            status_code=400,
            detail="Ownership claims are submitted on Found items held on campus.",
        )
    if item["status"] == "reunited":
        raise HTTPException(status_code=400, detail="This item has already been reunited with its owner.")

    dup_cur = await conn.execute(
        """
        SELECT id FROM claims
        WHERE item_id = ? AND claimant_id = ? AND status IN ('pending_review', 'approved_pickup')
        """,
        (payload.item_id, user["id"]),
    )
    if await dup_cur.fetchone():
        raise HTTPException(
            status_code=409,
            detail="You already have an active ownership claim for this item.",
        )

    claim_code = f"CLM-{random.randint(2100, 9899)}"
    pickup_desk = item["custody_holder"] or item["desk_location"]

    cur = await conn.execute(
        """
        INSERT INTO claims (
            claim_code, item_id, linked_lost_item_id, claimant_id,
            ownership_proof, identifying_marks, preferred_contact,
            status, pickup_desk
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)
        """,
        (
            claim_code,
            payload.item_id,
            payload.linked_lost_item_id,
            user["id"],
            payload.ownership_proof.strip(),
            (payload.identifying_marks or "").strip(),
            (payload.preferred_contact or user.get("phone") or user["email"]).strip(),
            pickup_desk,
        ),
    )
    claim_id = cur.lastrowid

    await conn.execute(
        "UPDATE items SET status = 'claim_pending', updated_at = datetime('now') WHERE id = ?",
        (payload.item_id,),
    )
    if payload.linked_lost_item_id:
        await conn.execute(
            """
            UPDATE item_matches
            SET status = 'claimed'
            WHERE lost_item_id = ? AND found_item_id = ?
            """,
            (payload.linked_lost_item_id, payload.item_id),
        )
    await conn.execute(
        """
        INSERT INTO item_status_history (item_id, previous_status, new_status, changed_by, note)
        VALUES (?, ?, 'claim_pending', ?, ?)
        """,
        (payload.item_id, item["status"], user["id"], f"Claim {claim_code} submitted for verification"),
    )
    await conn.commit()

    await doc_store.append_claim_timeline_event(
        claim_id=claim_id,
        actor_name=user["full_name"],
        actor_role=user["role"],
        message="Submitted ownership verification details.",
    )

    await broker.publish(
        "campus.claim.submitted",
        claim_code,
        {
            "claim_id": claim_id,
            "claim_code": claim_code,
            "item_id": payload.item_id,
            "item_title": item["title"],
            "claimant_id": user["id"],
            "claimant_name": user["full_name"],
            "pickup_desk": pickup_desk,
        },
    )

    claim_cur = await conn.execute("SELECT * FROM claims WHERE id = ?", (claim_id,))
    return dict(await claim_cur.fetchone())


@app.get("/api/claims")
async def list_claims(
    user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
):
    is_staff = user["role"] == "staff"
    where_clause = "" if is_staff else "WHERE c.claimant_id = ?"
    params = [] if is_staff else [user["id"]]

    cur = await conn.execute(
        f"""
        SELECT
            c.*,
            i.reference_code AS item_ref,
            i.title AS item_title,
            i.description AS item_description,
            i.color AS item_color,
            i.brand AS item_brand,
            i.status AS item_status,
            i.custody_holder,
            i.verification_prompt,
            i.tagged_roll_number,
            cl.building_name,
            cl.desk_location,
            u.full_name AS claimant_name,
            u.roll_number AS claimant_roll,
            u.department AS claimant_department,
            u.email AS claimant_email,
            rev.full_name AS reviewer_name
        FROM claims c
        JOIN items i ON i.id = c.item_id
        JOIN campus_locations cl ON cl.id = i.location_id
        JOIN users u ON u.id = c.claimant_id
        LEFT JOIN users rev ON rev.id = c.reviewer_id
        {where_clause}
        ORDER BY
            CASE c.status
                WHEN 'pending_review' THEN 0
                WHEN 'approved_pickup' THEN 1
                WHEN 'reunited' THEN 2
                ELSE 3
            END ASC,
            c.id DESC
        """,
        params,
    )
    rows = await cur.fetchall()
    results: List[Dict[str, Any]] = []
    for r in rows:
        entry = dict(r)
        entry["timeline"] = await doc_store.get_claim_timeline(entry["id"])
        if is_staff:
            nosql_secret = await doc_store.get_item_details(entry["item_id"], include_secret=True)
            entry["finder_secret_clue"] = nosql_secret.get("finder_secret_clue", "")
        results.append(entry)
    return results


@app.post("/api/claims/verify-pass")
async def verify_pickup_pass_code(
    payload: PassVerifyRequest,
    staff: dict = Depends(require_staff),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
    broker: DomainEventBroker = Depends(get_event_broker),
):
    code = payload.pickup_code.strip().upper()
    cur = await conn.execute(
        """
        SELECT c.*, i.title AS item_title, i.status AS current_item_status,
               cl.desk_location, u.full_name AS claimant_name, u.roll_number AS claimant_roll
        FROM claims c
        JOIN items i ON i.id = c.item_id
        JOIN campus_locations cl ON cl.id = i.location_id
        JOIN users u ON u.id = c.claimant_id
        WHERE UPPER(COALESCE(c.pickup_code, '')) = ? OR UPPER(c.claim_code) = ?
        """,
        (code, code),
    )
    claim = await cur.fetchone()
    if not claim:
        raise HTTPException(status_code=404, detail=f"No pickup pass or claim found for code '{code}'.")
    if claim["status"] == "reunited":
        raise HTTPException(status_code=400, detail=f"{claim['item_title']} was already handed over.")
    if claim["status"] == "declined":
        raise HTTPException(status_code=400, detail="This claim was declined and cannot be used for pickup.")

    decision_req = ClaimDecisionRequest(
        decision="mark_reunited",
        reviewer_note=f"Pass {code} verified at desk.",
        pickup_desk=claim["pickup_desk"] or claim["desk_location"],
    )
    updated = await verify_claim_transaction(
        claim_id=claim["id"],
        payload=decision_req,
        staff=staff,
        conn=conn,
        doc_store=doc_store,
        broker=broker,
    )
    updated["item_title"] = claim["item_title"]
    updated["claimant_name"] = claim["claimant_name"]
    updated["claimant_roll"] = claim["claimant_roll"]
    return updated


@app.post("/api/claims/{claim_id}/verify")
async def verify_claim_transaction(
    claim_id: int,
    payload: ClaimDecisionRequest,
    staff: dict = Depends(require_staff),
    conn=Depends(get_db_connection),
    doc_store: CampusDocumentStore = Depends(get_document_store),
    broker: DomainEventBroker = Depends(get_event_broker),
):
    cur = await conn.execute(
        """
        SELECT c.*, i.title AS item_title, i.status AS current_item_status, cl.desk_location
        FROM claims c
        JOIN items i ON i.id = c.item_id
        JOIN campus_locations cl ON cl.id = i.location_id
        WHERE c.id = ?
        """,
        (claim_id,),
    )
    claim = await cur.fetchone()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim record not found.")

    desk = (payload.pickup_desk or claim["pickup_desk"] or claim["desk_location"]).strip()
    note = (payload.reviewer_note or "").strip()

    await conn.execute("BEGIN IMMEDIATE")
    try:
        if payload.decision == "approve_pickup":
            pickup_code = claim["pickup_code"] or f"KLH-{random.randint(1000, 9999)}"
            await conn.execute(
                """
                UPDATE claims
                SET status = 'approved_pickup',
                    reviewer_id = ?,
                    reviewer_note = ?,
                    pickup_code = ?,
                    pickup_desk = ?,
                    reviewed_at = datetime('now')
                WHERE id = ?
                """,
                (staff["id"], note or "Ownership verified. Ready for desk pickup.", pickup_code, desk, claim_id),
            )
            await conn.execute(
                """
                UPDATE claims
                SET status = 'declined',
                    reviewer_id = ?,
                    reviewer_note = 'Another verified owner claim was approved for this item.',
                    reviewed_at = datetime('now')
                WHERE item_id = ? AND id != ? AND status = 'pending_review'
                """,
                (staff["id"], claim["item_id"], claim_id),
            )
            await conn.execute(
                "UPDATE items SET status = 'ready_for_pickup', updated_at = datetime('now') WHERE id = ?",
                (claim["item_id"],),
            )
            await conn.execute(
                """
                INSERT INTO item_status_history (item_id, previous_status, new_status, changed_by, note)
                VALUES (?, ?, 'ready_for_pickup', ?, ?)
                """,
                (
                    claim["item_id"],
                    claim["current_item_status"],
                    staff["id"],
                    f"Claim {claim['claim_code']} approved; pickup pass {pickup_code} issued",
                ),
            )
            timeline_msg = f"Claim approved by Campus Desk. Pickup code {pickup_code} at {desk}."
            topic = "campus.claim.approved"
            event_extra = {"pickup_code": pickup_code, "pickup_desk": desk}

        elif payload.decision == "mark_reunited":
            pickup_code = claim["pickup_code"] or f"KLH-{random.randint(1000, 9999)}"
            await conn.execute(
                """
                UPDATE claims
                SET status = 'reunited',
                    reviewer_id = ?,
                    reviewer_note = ?,
                    pickup_code = ?,
                    pickup_desk = ?,
                    reviewed_at = datetime('now')
                WHERE id = ?
                """,
                (staff["id"], note or "Handed over to student after ID check.", pickup_code, desk, claim_id),
            )
            await conn.execute(
                "UPDATE items SET status = 'reunited', custody_holder = 'Returned to Owner', updated_at = datetime('now') WHERE id = ?",
                (claim["item_id"],),
            )
            if claim["linked_lost_item_id"]:
                await conn.execute(
                    "UPDATE items SET status = 'reunited', updated_at = datetime('now') WHERE id = ?",
                    (claim["linked_lost_item_id"],),
                )
            await conn.execute(
                "UPDATE item_matches SET status = 'confirmed' WHERE found_item_id = ?",
                (claim["item_id"],),
            )
            await conn.execute(
                """
                INSERT INTO item_status_history (item_id, previous_status, new_status, changed_by, note)
                VALUES (?, ?, 'reunited', ?, ?)
                """,
                (claim["item_id"], claim["current_item_status"], staff["id"], "Item reunited with verified owner"),
            )
            timeline_msg = "Item handed over and marked Reunited!"
            topic = "campus.item.reunited"
            event_extra = {"pickup_code": pickup_code, "pickup_desk": desk}

        else:
            await conn.execute(
                """
                UPDATE claims
                SET status = 'declined',
                    reviewer_id = ?,
                    reviewer_note = ?,
                    reviewed_at = datetime('now')
                WHERE id = ?
                """,
                (staff["id"], note or "Provided details did not match item verification marks.", claim_id),
            )
            rem_cur = await conn.execute(
                "SELECT COUNT(*) AS cnt FROM claims WHERE item_id = ? AND status IN ('pending_review', 'approved_pickup')",
                (claim["item_id"],),
            )
            if (await rem_cur.fetchone())["cnt"] == 0:
                await conn.execute(
                    "UPDATE items SET status = 'open', updated_at = datetime('now') WHERE id = ?",
                    (claim["item_id"],),
                )
            timeline_msg = f"Claim declined: {note or 'Details did not match item verification check.'}"
            topic = "campus.claim.declined"
            event_extra = {}

        await conn.commit()
    except Exception:
        await conn.rollback()
        raise

    await doc_store.append_claim_timeline_event(
        claim_id=claim_id,
        actor_name=staff["full_name"],
        actor_role="staff",
        message=timeline_msg,
    )

    await broker.publish(
        topic,
        claim["claim_code"],
        {
            "claim_id": claim_id,
            "claim_code": claim["claim_code"],
            "item_id": claim["item_id"],
            "item_title": claim["item_title"],
            "claimant_id": claim["claimant_id"],
            "reviewer_name": staff["full_name"],
            **event_extra,
        },
    )

    updated_cur = await conn.execute("SELECT * FROM claims WHERE id = ?", (claim_id,))
    return dict(await updated_cur.fetchone())


@app.patch("/api/items/{item_id}/status")
async def update_item_status(
    item_id: int,
    payload: StatusUpdateRequest,
    user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    cur = await conn.execute("SELECT * FROM items WHERE id = ?", (item_id,))
    item = await cur.fetchone()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    if user["role"] != "staff" and item["reporter_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the reporter or Campus Desk staff can update this status.")

    await conn.execute(
        "UPDATE items SET status = ?, updated_at = datetime('now') WHERE id = ?",
        (payload.status, item_id),
    )
    if payload.status in ("reunited", "archived"):
        target_match_status = "confirmed" if payload.status == "reunited" else "dismissed"
        await conn.execute(
            """
            UPDATE item_matches
            SET status = ?
            WHERE (lost_item_id = ? OR found_item_id = ?) AND status = 'suggested'
            """,
            (target_match_status, item_id, item_id),
        )
    await conn.execute(
        """
        INSERT INTO item_status_history (item_id, previous_status, new_status, changed_by, note)
        VALUES (?, ?, ?, ?, ?)
        """,
        (item_id, item["status"], payload.status, user["id"], payload.note or "Status updated"),
    )
    await conn.commit()
    return {"id": item_id, "status": payload.status}
