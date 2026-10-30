import sqlite3
from pathlib import Path
from flask import Flask, jsonify

app = Flask(__name__)
DB_PATH = Path(__file__).resolve().parents[2] / "services" / "catalog-matching-fastapi" / "data" / "klh_lost_found.db"


@app.get("/digest/unclaimed")
def unclaimed_digest():
    if not DB_PATH.exists():
        return jsonify({"campus": "KLH University", "items": []})
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT i.reference_code, i.title, i.event_date, cl.building_name, cl.desk_location
        FROM items i
        JOIN campus_locations cl ON cl.id = i.location_id
        WHERE i.item_type = 'found' AND i.status IN ('open', 'matched')
        ORDER BY i.event_date DESC
        LIMIT 10
        """
    ).fetchall()
    conn.close()
    return jsonify({"campus": "KLH University", "items": [dict(r) for r in rows]})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8004)
