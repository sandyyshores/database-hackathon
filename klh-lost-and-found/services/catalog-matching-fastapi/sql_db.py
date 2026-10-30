from typing import AsyncGenerator

import aiosqlite

from config import SQLITE_DB_PATH

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'staff')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campus_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    building_name TEXT NOT NULL,
    zone TEXT NOT NULL,
    desk_location TEXT NOT NULL,
    map_x REAL NOT NULL,
    map_y REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    default_hold_days INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_code TEXT UNIQUE NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('lost', 'found')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    color TEXT,
    brand TEXT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    location_id INTEGER NOT NULL REFERENCES campus_locations(id),
    specific_spot TEXT,
    event_date TEXT NOT NULL,
    event_time_approx TEXT,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'matched', 'claim_pending', 'ready_for_pickup', 'reunited', 'archived')),
    custody_holder TEXT,
    verification_prompt TEXT,
    tagged_roll_number TEXT,
    reporter_id INTEGER NOT NULL REFERENCES users(id),
    nosql_doc_id TEXT,
    embedding_json TEXT,
    photo_data_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_type_status ON items(item_type, status);
CREATE INDEX IF NOT EXISTS idx_items_location ON items(location_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_tagged_roll ON items(tagged_roll_number);

CREATE TABLE IF NOT EXISTS item_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lost_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    found_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    similarity_score REAL NOT NULL,
    match_reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'suggested'
        CHECK (status IN ('suggested', 'claimed', 'confirmed', 'dismissed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (lost_item_id, found_item_id)
);

CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_code TEXT UNIQUE NOT NULL,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    linked_lost_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    claimant_id INTEGER NOT NULL REFERENCES users(id),
    ownership_proof TEXT NOT NULL,
    identifying_marks TEXT,
    preferred_contact TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved_pickup', 'reunited', 'declined')),
    reviewer_id INTEGER REFERENCES users(id),
    reviewer_note TEXT,
    pickup_code TEXT,
    pickup_desk TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS item_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by INTEGER REFERENCES users(id),
    note TEXT,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


async def init_sql_db() -> None:
    async with aiosqlite.connect(SQLITE_DB_PATH, timeout=15.0) as conn:
        await conn.execute("PRAGMA journal_mode = WAL;")
        await conn.execute("PRAGMA busy_timeout = 10000;")
        await conn.execute("PRAGMA foreign_keys = ON;")
        await conn.executescript(SCHEMA_SQL)
        cols_cur = await conn.execute("PRAGMA table_info(items);")
        existing_cols = {r[1] for r in await cols_cur.fetchall()}
        if "tagged_roll_number" not in existing_cols:
            await conn.execute("ALTER TABLE items ADD COLUMN tagged_roll_number TEXT;")
        await conn.commit()


async def get_db_connection() -> AsyncGenerator[aiosqlite.Connection, None]:
    conn = await aiosqlite.connect(SQLITE_DB_PATH, timeout=15.0)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA busy_timeout = 10000;")
    await conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
    finally:
        await conn.close()
