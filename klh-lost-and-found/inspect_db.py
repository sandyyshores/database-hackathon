import json
import re
import sqlite3
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
ROOT = (
    HERE / "klh-lost-and-found"
    if not (HERE / "services").exists() and (HERE / "klh-lost-and-found" / "services").exists()
    else HERE
)
DB_PATH = ROOT / "services" / "catalog-matching-fastapi" / "data" / "klh_lost_found.db"
NOSQL_PATH = ROOT / "services" / "catalog-matching-fastapi" / "data" / "nosql_documents.json"
MYSQL_OUT = ROOT / "database" / "mysql_schema_and_seed.sql"


def print_table(title: str, columns: list[str], rows: list[tuple]) -> None:
    str_rows = [[("" if v is None else str(v))[:42] for v in row] for row in rows]
    widths = [
        max(len(col), *(len(r[idx]) for r in str_rows)) if str_rows else len(col)
        for idx, col in enumerate(columns)
    ]
    border = "+" + "+".join("-" * (w + 2) for w in widths) + "+"
    if title:
        print(f"\n=== {title} ({len(str_rows)} rows) ===")
    print(border)
    print("| " + " | ".join(col.ljust(widths[i]) for i, col in enumerate(columns)) + " |")
    print(border)
    for r in str_rows:
        print("| " + " | ".join(r[i].ljust(widths[i]) for i, _ in enumerate(columns)) + " |")
    print(border)
    if not title:
        print(f"{len(str_rows)} row(s) in set\n")


def execute_and_display(conn: sqlite3.Connection, sql: str, title: str = "") -> None:
    cleaned = sql.strip().rstrip(";").strip()
    upper = cleaned.upper()

    if upper == "SHOW TABLES":
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        print_table(title, ["Tables_in_klh_lost_and_found"], cur.fetchall())
        return

    desc_match = re.match(r"^(?:DESC|DESCRIBE)\s+([A-Za-z0-9_]+)$", cleaned, flags=re.IGNORECASE)
    if desc_match:
        tbl = desc_match.group(1)
        cur = conn.execute(f"PRAGMA table_info({tbl})")
        info = cur.fetchall()
        if not info:
            print(f"ERROR: Table '{tbl}' doesn't exist.\n")
            return
        formatted = [
            (r[1], r[2] or "TEXT", "NO" if r[3] else "YES", "PRI" if r[5] else "", r[4])
            for r in info
        ]
        print_table(title, ["Field", "Type", "Null", "Key", "Default"], formatted)
        return

    cur = conn.execute(cleaned)
    if cur.description:
        cols = [d[0] for d in cur.description]
        print_table(title, cols, cur.fetchall())
    else:
        conn.commit()
        print(f"Query OK, {cur.rowcount} row(s) affected\n")


def sql_lit(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    escaped = str(val).replace("\\", "\\\\").replace("'", "''").replace("\n", "\\n")
    return f"'{escaped}'"


def export_mysql_dump(conn: sqlite3.Connection) -> None:
    lines = [
        "CREATE DATABASE IF NOT EXISTS klh_lost_and_found;",
        "USE klh_lost_and_found;",
        "",
        "SET FOREIGN_KEY_CHECKS = 0;",
        "DROP TABLE IF EXISTS item_status_history;",
        "DROP TABLE IF EXISTS claims;",
        "DROP TABLE IF EXISTS item_matches;",
        "DROP TABLE IF EXISTS items;",
        "DROP TABLE IF EXISTS categories;",
        "DROP TABLE IF EXISTS campus_locations;",
        "DROP TABLE IF EXISTS users;",
        "SET FOREIGN_KEY_CHECKS = 1;",
        "",
        "CREATE TABLE users (",
        "    id INT AUTO_INCREMENT PRIMARY KEY,",
        "    roll_number VARCHAR(32) NOT NULL UNIQUE,",
        "    full_name VARCHAR(120) NOT NULL,",
        "    email VARCHAR(160) NOT NULL UNIQUE,",
        "    department VARCHAR(80) NOT NULL,",
        "    phone VARCHAR(32),",
        "    role ENUM('student', 'staff') NOT NULL DEFAULT 'student',",
        "    password_hash VARCHAR(255) NOT NULL,",
        "    created_at VARCHAR(40) NOT NULL",
        ");",
        "",
        "CREATE TABLE campus_locations (",
        "    id INT AUTO_INCREMENT PRIMARY KEY,",
        "    code VARCHAR(32) NOT NULL UNIQUE,",
        "    building_name VARCHAR(120) NOT NULL,",
        "    zone VARCHAR(80) NOT NULL,",
        "    desk_location VARCHAR(140) NOT NULL,",
        "    map_x DOUBLE NOT NULL,",
        "    map_y DOUBLE NOT NULL",
        ");",
        "",
        "CREATE TABLE categories (",
        "    id INT AUTO_INCREMENT PRIMARY KEY,",
        "    slug VARCHAR(48) NOT NULL UNIQUE,",
        "    display_name VARCHAR(100) NOT NULL,",
        "    default_hold_days INT NOT NULL DEFAULT 30",
        ");",
        "",
        "CREATE TABLE items (",
        "    id INT AUTO_INCREMENT PRIMARY KEY,",
        "    reference_code VARCHAR(24) NOT NULL UNIQUE,",
        "    item_type ENUM('lost', 'found') NOT NULL,",
        "    title VARCHAR(180) NOT NULL,",
        "    description TEXT NOT NULL,",
        "    color VARCHAR(60),",
        "    brand VARCHAR(80),",
        "    category_id INT NOT NULL,",
        "    location_id INT NOT NULL,",
        "    specific_spot VARCHAR(160),",
        "    event_date VARCHAR(20) NOT NULL,",
        "    event_time_approx VARCHAR(40),",
        "    status ENUM('open', 'matched', 'claim_pending', 'ready_for_pickup', 'reunited', 'archived') NOT NULL DEFAULT 'open',",
        "    custody_holder VARCHAR(140),",
        "    verification_prompt VARCHAR(255),",
        "    tagged_roll_number VARCHAR(32),",
        "    reporter_id INT NOT NULL,",
        "    nosql_doc_id VARCHAR(64),",
        "    created_at VARCHAR(40) NOT NULL,",
        "    updated_at VARCHAR(40) NOT NULL,",
        "    CONSTRAINT fk_items_cat FOREIGN KEY (category_id) REFERENCES categories(id),",
        "    CONSTRAINT fk_items_loc FOREIGN KEY (location_id) REFERENCES campus_locations(id),",
        "    CONSTRAINT fk_items_rep FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE",
        ");",
        "",
        "CREATE TABLE item_matches (",
        "    id INT AUTO_INCREMENT PRIMARY KEY,",
        "    lost_item_id INT NOT NULL,",
        "    found_item_id INT NOT NULL,",
        "    similarity_score DOUBLE NOT NULL,",
        "    match_reason TEXT NOT NULL,",
        "    status ENUM('suggested', 'claimed', 'confirmed', 'dismissed') NOT NULL DEFAULT 'suggested',",
        "    created_at VARCHAR(40) NOT NULL,",
        "    CONSTRAINT fk_match_lost FOREIGN KEY (lost_item_id) REFERENCES items(id) ON DELETE CASCADE,",
        "    CONSTRAINT fk_match_found FOREIGN KEY (found_item_id) REFERENCES items(id) ON DELETE CASCADE",
        ");",
        "",
        "CREATE TABLE claims (",
        "    id INT AUTO_INCREMENT PRIMARY KEY,",
        "    claim_code VARCHAR(24) NOT NULL UNIQUE,",
        "    item_id INT NOT NULL,",
        "    linked_lost_item_id INT NULL,",
        "    claimant_id INT NOT NULL,",
        "    ownership_proof TEXT NOT NULL,",
        "    identifying_marks TEXT,",
        "    preferred_contact VARCHAR(120),",
        "    status ENUM('pending_review', 'approved_pickup', 'reunited', 'declined') NOT NULL DEFAULT 'pending_review',",
        "    reviewer_id INT NULL,",
        "    reviewer_note TEXT,",
        "    pickup_code VARCHAR(20),",
        "    pickup_desk VARCHAR(140),",
        "    created_at VARCHAR(40) NOT NULL,",
        "    reviewed_at VARCHAR(40) NULL,",
        "    CONSTRAINT fk_claim_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,",
        "    CONSTRAINT fk_claim_lost FOREIGN KEY (linked_lost_item_id) REFERENCES items(id) ON DELETE SET NULL,",
        "    CONSTRAINT fk_claim_user FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE CASCADE,",
        "    CONSTRAINT fk_claim_rev FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL",
        ");",
        "",
        "CREATE TABLE item_status_history (",
        "    id INT AUTO_INCREMENT PRIMARY KEY,",
        "    item_id INT NOT NULL,",
        "    previous_status VARCHAR(40),",
        "    new_status VARCHAR(40) NOT NULL,",
        "    changed_by INT NULL,",
        "    note TEXT,",
        "    changed_at VARCHAR(40) NOT NULL,",
        "    CONSTRAINT fk_hist_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE",
        ");",
        "",
    ]

    table_specs = [
        ("users", ["id", "roll_number", "full_name", "email", "department", "phone", "role", "password_hash", "created_at"]),
        ("campus_locations", ["id", "code", "building_name", "zone", "desk_location", "map_x", "map_y"]),
        ("categories", ["id", "slug", "display_name", "default_hold_days"]),
        ("items", ["id", "reference_code", "item_type", "title", "description", "color", "brand", "category_id", "location_id", "specific_spot", "event_date", "event_time_approx", "status", "custody_holder", "verification_prompt", "tagged_roll_number", "reporter_id", "nosql_doc_id", "created_at", "updated_at"]),
        ("item_matches", ["id", "lost_item_id", "found_item_id", "similarity_score", "match_reason", "status", "created_at"]),
        ("claims", ["id", "claim_code", "item_id", "linked_lost_item_id", "claimant_id", "ownership_proof", "identifying_marks", "preferred_contact", "status", "reviewer_id", "reviewer_note", "pickup_code", "pickup_desk", "created_at", "reviewed_at"]),
        ("item_status_history", ["id", "item_id", "previous_status", "new_status", "changed_by", "note", "changed_at"]),
    ]

    for tbl, cols in table_specs:
        col_list = ", ".join(cols)
        rows = conn.execute(f"SELECT {col_list} FROM {tbl} ORDER BY id").fetchall()
        for r in rows:
            vals = ", ".join(sql_lit(v) for v in r)
            lines.append(f"INSERT INTO {tbl} ({col_list}) VALUES ({vals});")
        lines.append("")

    MYSQL_OUT.parent.mkdir(parents=True, exist_ok=True)
    MYSQL_OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Exported live SQL database to MySQL script: {MYSQL_OUT}")


def interactive_shell(conn: sqlite3.Connection) -> None:
    print("KLH Lost & Found Interactive SQL Prompt")
    print("Try: SHOW TABLES;   DESC items;   SELECT id, reference_code, title, status FROM items;   EXIT;\n")
    while True:
        try:
            stmt = input("sql> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not stmt:
            continue
        if stmt.rstrip(";").strip().upper() in {"EXIT", "QUIT"}:
            break
        try:
            execute_and_display(conn, stmt)
        except Exception as exc:
            print(f"SQL Error: {exc}\n")


def main() -> None:
    if not DB_PATH.exists():
        print(f"Database file not found at: {DB_PATH}")
        print("Make sure inspect_db.py is inside the same folder as run_local.py and run 'py run_local.py' once.")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "--export-mysql":
            export_mysql_dump(conn)
            return

        if len(sys.argv) > 1 and sys.argv[1] == "--shell":
            interactive_shell(conn)
            return

        if len(sys.argv) > 1:
            custom_sql = " ".join(sys.argv[1:])
            execute_and_display(conn, custom_sql, f"SQL Query: {custom_sql}")
            return

        print(f"SQL Database File:   {DB_PATH}")
        print(f"NoSQL Document File: {NOSQL_PATH}")

        execute_and_display(
            conn,
            "SELECT id, roll_number, full_name, department, role FROM users ORDER BY id",
            "SQL TABLE: users",
        )
        execute_and_display(
            conn,
            "SELECT id, code, building_name, desk_location FROM campus_locations ORDER BY id",
            "SQL TABLE: campus_locations",
        )
        execute_and_display(
            conn,
            "SELECT id, reference_code, item_type, title, specific_spot, status, tagged_roll_number FROM items ORDER BY id",
            "SQL TABLE: items",
        )
        execute_and_display(
            conn,
            "SELECT id, lost_item_id, found_item_id, ROUND(similarity_score, 2) AS score, status FROM item_matches ORDER BY id",
            "SQL TABLE: item_matches",
        )
        execute_and_display(
            conn,
            "SELECT id, claim_code, item_id, claimant_id, status, pickup_code, pickup_desk FROM claims ORDER BY id",
            "SQL TABLE: claims",
        )

        if NOSQL_PATH.exists():
            doc = json.loads(NOSQL_PATH.read_text(encoding="utf-8"))
            summary_rows = [(k, len(v) if isinstance(v, (list, dict)) else 1) for k, v in doc.items()]
            print_table("NoSQL DOCUMENT STORE (nosql_documents.json)", ["collection_name", "document_count"], summary_rows)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
