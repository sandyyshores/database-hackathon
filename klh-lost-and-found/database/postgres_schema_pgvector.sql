CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    roll_number VARCHAR(32) UNIQUE NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(160) UNIQUE NOT NULL,
    department VARCHAR(80) NOT NULL,
    phone VARCHAR(24),
    role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'staff')),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE campus_locations (
    id SERIAL PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    building_name VARCHAR(120) NOT NULL,
    zone VARCHAR(60) NOT NULL,
    desk_location VARCHAR(160) NOT NULL,
    map_x NUMERIC(5,2) NOT NULL,
    map_y NUMERIC(5,2) NOT NULL
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(40) UNIQUE NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    default_hold_days INT NOT NULL DEFAULT 30
);

CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    reference_code VARCHAR(24) UNIQUE NOT NULL,
    item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('lost', 'found')),
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    color VARCHAR(60),
    brand VARCHAR(80),
    category_id INT NOT NULL REFERENCES categories(id),
    location_id INT NOT NULL REFERENCES campus_locations(id),
    specific_spot VARCHAR(160),
    event_date DATE NOT NULL,
    event_time_approx VARCHAR(40),
    status VARCHAR(24) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'matched', 'claim_pending', 'ready_for_pickup', 'reunited', 'archived')),
    custody_holder VARCHAR(160),
    verification_prompt VARCHAR(240),
    tagged_roll_number VARCHAR(32),
    reporter_id INT NOT NULL REFERENCES users(id),
    nosql_doc_id VARCHAR(64),
    embedding vector(128),
    photo_data_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_items_type_status ON items(item_type, status);
CREATE INDEX idx_items_location ON items(location_id);
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_embedding_hnsw ON items USING hnsw (embedding vector_cosine_ops);

CREATE TABLE item_matches (
    id SERIAL PRIMARY KEY,
    lost_item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    found_item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    similarity_score NUMERIC(5,4) NOT NULL,
    match_reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'suggested'
        CHECK (status IN ('suggested', 'claimed', 'confirmed', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lost_item_id, found_item_id)
);

CREATE TABLE claims (
    id SERIAL PRIMARY KEY,
    claim_code VARCHAR(24) UNIQUE NOT NULL,
    item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    linked_lost_item_id INT REFERENCES items(id) ON DELETE SET NULL,
    claimant_id INT NOT NULL REFERENCES users(id),
    ownership_proof TEXT NOT NULL,
    identifying_marks TEXT,
    preferred_contact VARCHAR(100),
    status VARCHAR(24) NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved_pickup', 'reunited', 'declined')),
    reviewer_id INT REFERENCES users(id),
    reviewer_note TEXT,
    pickup_code VARCHAR(16),
    pickup_desk VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE TABLE item_status_history (
    id SERIAL PRIMARY KEY,
    item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    previous_status VARCHAR(24),
    new_status VARCHAR(24) NOT NULL,
    changed_by INT REFERENCES users(id),
    note TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE VIEW v_campus_hotspot_ranking AS
WITH location_activity AS (
    SELECT
        cl.id AS location_id,
        cl.building_name,
        cl.zone,
        COUNT(i.id) AS total_reports,
        SUM(CASE WHEN i.item_type = 'lost' THEN 1 ELSE 0 END) AS lost_count,
        SUM(CASE WHEN i.item_type = 'found' THEN 1 ELSE 0 END) AS found_count,
        SUM(CASE WHEN i.status = 'reunited' THEN 1 ELSE 0 END) AS reunited_count
    FROM campus_locations cl
    LEFT JOIN items i ON i.location_id = cl.id
    GROUP BY cl.id, cl.building_name, cl.zone
)
SELECT
    building_name,
    zone,
    total_reports,
    lost_count,
    found_count,
    reunited_count,
    RANK() OVER (ORDER BY total_reports DESC) AS campus_hotspot_rank,
    ROUND(
        100.0 * reunited_count / NULLIF(total_reports, 0),
        1
    ) AS reunion_rate_pct
FROM location_activity;
