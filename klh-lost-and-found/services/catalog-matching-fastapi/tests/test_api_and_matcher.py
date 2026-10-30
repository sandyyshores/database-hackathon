import os
import sys
import tempfile
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_DIR))

TMP_DIR = tempfile.mkdtemp(prefix="klh_test_")
os.environ["SQLITE_DB_PATH"] = os.path.join(TMP_DIR, "test_klh.db")
os.environ["NOSQL_JSON_PATH"] = os.path.join(TMP_DIR, "test_nosql.json")
os.environ["EXPRESS_SERVICE_URL"] = ""

from fastapi.testclient import TestClient
from main import app
from matcher import compute_item_embedding, score_lost_found_pair


def test_python_semantic_matcher_matches_synonyms_and_rejects_false_pairs():
    lost = {
        "title": "Lost my navy Milton sipper bottle",
        "description": "Forgot my dark blue insulated water flask at the Canteen after lunch.",
        "color": "Navy Blue",
        "brand": "Milton",
        "category_id": 2,
        "category_slug": "bottles-bags",
        "location_id": 1,
        "building_name": "Canteen",
        "zone": "Campus Dining",
        "event_date": "2026-10-29",
        "tags": ["flask", "lunch"],
    }
    lost["embedding"] = compute_item_embedding(
        lost["title"], lost["description"], lost["color"], lost["brand"], lost["category_slug"], lost["building_name"], lost["tags"]
    )

    found = {
        "title": "Dark Blue Steel Water Bottle",
        "description": "Found a matte navy thermos bottle on a Canteen dining table.",
        "color": "Dark Blue",
        "brand": "Milton",
        "category_id": 2,
        "category_slug": "bottles-bags",
        "location_id": 1,
        "building_name": "Canteen",
        "zone": "Campus Dining",
        "event_date": "2026-10-29",
        "tags": ["bottle"],
    }
    found["embedding"] = compute_item_embedding(
        found["title"], found["description"], found["color"], found["brand"], found["category_slug"], found["building_name"], found["tags"]
    )

    mouse_lost = {
        "title": "Logitech Pebble Matte Black Wireless Mouse",
        "description": "Forgot my slim black wireless mouse next to the monitor in Lab 108.",
        "color": "Matte Black",
        "brand": "Logitech",
        "category_id": 1,
        "category_slug": "electronics",
        "location_id": 6,
        "building_name": "Campus Labs",
        "specific_spot": "Lab 108 — System 12",
        "zone": "Practical Labs",
        "event_date": "2026-10-29",
        "tags": ["wireless mouse", "108"],
    }
    mouse_lost["embedding"] = compute_item_embedding(
        mouse_lost["title"], mouse_lost["description"], mouse_lost["color"], mouse_lost["brand"], mouse_lost["category_slug"], mouse_lost["building_name"], mouse_lost["tags"], mouse_lost["specific_spot"]
    )

    charger_found = {
        "title": "65W Type-C Laptop Charger with Braided Cable",
        "description": "White 65W USB-C power adapter left plugged into workbench socket in Lab 15.",
        "color": "White",
        "brand": "Lenovo",
        "category_id": 1,
        "category_slug": "electronics",
        "location_id": 6,
        "building_name": "Campus Labs",
        "specific_spot": "Lab 15 — System Row 3",
        "zone": "Practical Labs",
        "event_date": "2026-10-30",
        "tags": ["laptop charger", "lab 15"],
    }
    charger_found["embedding"] = compute_item_embedding(
        charger_found["title"], charger_found["description"], charger_found["color"], charger_found["brand"], charger_found["category_slug"], charger_found["building_name"], charger_found["tags"], charger_found["specific_spot"]
    )

    good_score, reason = score_lost_found_pair(lost, found)
    mismatch_score, _ = score_lost_found_pair(mouse_lost, charger_found)

    assert good_score >= 0.72
    assert mismatch_score < 0.35
    assert len(reason) > 10


def test_end_to_end_all_features_auth_qr_pass_sightings_edit_delete_and_dismiss():
    with TestClient(app) as client:
        summary = client.get("/api/summary")
        assert summary.status_code == 200
        assert summary.json()["total_reports"] >= 12

        room_203 = client.get("/api/items?q=203").json()
        assert len(room_203) == 2

        room_205 = client.get("/api/items?q=205").json()
        assert len(room_205) == 0

        student_login = client.post(
            "/api/auth/login",
            json={"identifier": "2520030330", "password": "klhstudent"},
        )
        assert student_login.status_code == 200
        student_token = student_login.json()["access_token"]
        student_hdrs = {
            "Authorization": "Bearer overwritten-by-reverse-proxy",
            "X-KLH-Token": student_token,
        }

        create_resp = client.post(
            "/api/items",
            headers=student_hdrs,
            json={
                "item_type": "found",
                "title": "KLH Student ID Card",
                "description": "Found CSE student ID card near Classroom 102.",
                "color": "White",
                "category_id": 3,
                "location_id": 8,
                "specific_spot": "Classroom 102 — Front Bench",
                "event_date": "2026-10-30",
                "tagged_roll_number": "2520030252",
            },
        )
        assert create_resp.status_code == 201
        created = create_resp.json()
        assert created["tagged_roll_number"] == "2520030252"

        edit_resp = client.put(
            f"/api/items/{created['id']}",
            headers=student_hdrs,
            json={
                "title": "KLH CSE ID Card (Lanyard)",
                "description": "Found CSE student ID card near Classroom 103.",
                "color": "Crimson Red",
                "category_id": 3,
                "location_id": 8,
                "specific_spot": "Classroom 103 — Front Bench",
                "event_date": "2026-10-30",
                "tagged_roll_number": "2520030252",
            },
        )
        assert edit_resp.status_code == 200
        assert edit_resp.json()["title"] == "KLH CSE ID Card (Lanyard)"

        sighting_resp = client.post(
            "/api/items/8/sightings",
            headers=student_hdrs,
            json={"note": "Handed to 4th Floor Coordinator Desk after 1 PM lecture."},
        )
        assert sighting_resp.status_code == 201
        detail_8 = client.get("/api/items/8").json()
        assert any("4th Floor" in s["note"] for s in detail_8["sightings"])

        matches_before = client.get("/api/matches").json()
        assert len(matches_before) >= 2
        target_match_id = matches_before[0]["match_id"]
        dismiss_resp = client.post(
            f"/api/matches/{target_match_id}/dismiss",
            headers=student_hdrs,
        )
        assert dismiss_resp.status_code == 200
        matches_after = client.get("/api/matches").json()
        assert all(m["match_id"] != target_match_id for m in matches_after)

        del_resp = client.delete(f"/api/items/{created['id']}", headers=student_hdrs)
        assert del_resp.status_code == 200
        assert client.get(f"/api/items/{created['id']}").status_code == 404

        staff_login = client.post(
            "/api/auth/login",
            json={"identifier": "STAFF-LF01", "password": "klhstaff"},
        )
        staff_hdrs = {"X-KLH-Token": staff_login.json()["access_token"]}

        pass_verify = client.post(
            "/api/claims/verify-pass",
            headers=staff_hdrs,
            json={"pickup_code": "KLH-4920"},
        )
        assert pass_verify.status_code == 200
        assert pass_verify.json()["status"] == "reunited"
        assert pass_verify.json()["claimant_roll"] == "2520030330"
