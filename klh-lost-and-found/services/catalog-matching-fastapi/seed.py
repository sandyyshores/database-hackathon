import json
import aiosqlite

from auth import hash_password
from config import SQLITE_DB_PATH
from matcher import compute_item_embedding, score_lost_found_pair
from nosql_store import document_store


async def seed_initial_data() -> None:
    async with aiosqlite.connect(SQLITE_DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cur = await conn.execute("SELECT COUNT(*) AS cnt FROM users")
        row = await cur.fetchone()
        if row and row["cnt"] > 0:
            return

        users = [
            (
                "2520030330",
                "Santhosh Pendyala",
                "santhosh.pendyala@klh.edu.in",
                "CSE",
                "+91 98490 30330",
                "student",
                hash_password("klhstudent"),
            ),
            (
                "2520030252",
                "Ganesh Guntu",
                "ganesh.guntu@klh.edu.in",
                "CSE",
                "+91 98490 30252",
                "student",
                hash_password("klhstudent"),
            ),
            (
                "2520030555",
                "Pranav Chowdary",
                "pranav.chowdary@klh.edu.in",
                "CSE",
                "+91 98490 30555",
                "student",
                hash_password("klhstudent"),
            ),
            (
                "2520030421",
                "Jayanth Sunkara",
                "jayanth.sunkara@klh.edu.in",
                "CSE",
                "+91 98490 30421",
                "student",
                hash_password("klhstudent"),
            ),
            (
                "STAFF-LF01",
                "Srinivas Rao",
                "helpdesk@klh.edu.in",
                "Student Welfare & Campus Desk",
                "+91 40 2345 1080",
                "staff",
                hash_password("klhstaff"),
            ),
        ]
        await conn.executemany(
            """
            INSERT INTO users (roll_number, full_name, email, department, phone, role, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            users,
        )

        locations = [
            ("CANTEEN", "Canteen", "Campus Dining", "Canteen Helpdesk Counter", 22.0, 78.0),
            ("SAC_ROOM", "SAC Room", "Student Hangout", "SAC Coordinator Desk", 50.0, 78.0),
            ("INDOOR_SPORTS", "Indoor Sports Room", "Recreation", "Indoor Sports Desk", 78.0, 78.0),
            ("BOYS_COMMON", "Boys Common Room", "Student Lounge", "Ground Floor Reception Desk", 32.0, 60.0),
            ("GIRLS_COMMON", "Girls Common Room", "Student Lounge", "Ground Floor Reception Desk", 68.0, 60.0),
            ("LABS", "Campus Labs", "Practical Labs", "Lab Assistant Counter", 76.0, 34.0),
            ("GROUND_FLOOR", "Ground Floor Classrooms", "Ground Floor", "Ground Floor Reception Desk", 28.0, 46.0),
            ("FIRST_FLOOR", "1st Floor Classrooms", "1st Floor", "Ground Floor Reception Desk", 28.0, 36.0),
            ("SECOND_FLOOR", "2nd Floor Classrooms", "2nd Floor", "2nd Floor Coordinator Desk", 28.0, 26.0),
            ("THIRD_FLOOR", "3rd Floor Classrooms", "3rd Floor", "3rd Floor Coordinator Desk", 28.0, 18.0),
            ("FOURTH_FLOOR", "4th Floor Classrooms", "4th Floor", "4th Floor Coordinator Desk", 28.0, 10.0),
        ]
        await conn.executemany(
            """
            INSERT INTO campus_locations (code, building_name, zone, desk_location, map_x, map_y)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            locations,
        )

        categories = [
            ("electronics", "Phones, Earbuds & Chargers", 45),
            ("bottles-bags", "Bottles, Umbrellas & Bags", 21),
            ("id-wallets", "ID Cards, Wallets & Cash", 60),
            ("calculators-books", "Calculators, Books & Notes", 30),
            ("keys-access", "Keys, Lanyards & Passes", 45),
            ("accessories", "Watches, Glasses & Personal", 30),
        ]
        await conn.executemany(
            """
            INSERT INTO categories (slug, display_name, default_hold_days)
            VALUES (?, ?, ?)
            """,
            categories,
        )
        await conn.commit()

        loc_rows = await (await conn.execute("SELECT * FROM campus_locations")).fetchall()
        loc_map = {r["code"]: dict(r) for r in loc_rows}
        cat_rows = await (await conn.execute("SELECT * FROM categories")).fetchall()
        cat_map = {r["slug"]: dict(r) for r in cat_rows}
        user_rows = await (await conn.execute("SELECT * FROM users")).fetchall()
        user_map = {r["roll_number"]: dict(r) for r in user_rows}

        seed_items = [
            {
                "ref": "KLH-L101",
                "type": "lost",
                "title": "Matte Navy Milton Insulated Bottle",
                "desc": "Left my dark blue stainless steel 750ml water flask on a lunch table near the snack counter during the 1:15 PM break.",
                "color": "Navy Blue",
                "brand": "Milton",
                "cat": "bottles-bags",
                "loc": "CANTEEN",
                "spot": "Canteen — Lunch Table Row 3",
                "date": "2026-10-29",
                "time": "1:15 PM",
                "status": "matched",
                "custody": "",
                "prompt": "",
                "tagged_roll": "",
                "reporter": "2520030330",
                "tags": ["insulated flask", "750ml", "matte finish"],
                "attrs": {"Capacity": "750 ml", "Material": "Stainless Steel"},
                "secret": "",
                "handover": "Please reach out on campus portal if spotted.",
            },
            {
                "ref": "KLH-F102",
                "type": "found",
                "title": "Dark Blue Stainless Steel Water Flask",
                "desc": "Found an insulated navy blue sipper bottle left behind after lunch in the Canteen. Safely handed over to the Canteen Helpdesk Counter.",
                "color": "Dark Blue",
                "brand": "Milton",
                "cat": "bottles-bags",
                "loc": "CANTEEN",
                "spot": "Canteen — Middle Dining Tables",
                "date": "2026-10-29",
                "time": "1:45 PM",
                "status": "matched",
                "custody": "Canteen Helpdesk Counter",
                "prompt": "What sticker or mark is near the bottom base of the bottle?",
                "tagged_roll": "",
                "reporter": "2520030252",
                "tags": ["water bottle", "navy", "sipper"],
                "attrs": {"Condition": "Good, half full", "Cap Style": "Flip lid"},
                "secret": "Small white mountain peak vinyl sticker near the bottom rim",
                "handover": "Available for pickup at Canteen Helpdesk between 9 AM and 5 PM.",
            },
            {
                "ref": "KLH-L103",
                "type": "lost",
                "title": "AirPods Pro in Sage Green Silicone Case",
                "desc": "Misplaced my white wireless earbuds charging case inside a soft sage green silicone cover with a silver clip while hanging out in the SAC Room.",
                "color": "White / Sage Green",
                "brand": "Apple",
                "cat": "electronics",
                "loc": "SAC_ROOM",
                "spot": "SAC Room — Corner Seating Area",
                "date": "2026-10-28",
                "time": "4:30 PM",
                "status": "matched",
                "custody": "",
                "prompt": "",
                "tagged_roll": "",
                "reporter": "2520030252",
                "tags": ["airpods", "wireless earbuds", "silicone sleeve"],
                "attrs": {"Model": "AirPods Pro (USB-C)", "Attachment": "Mini silver carabiner"},
                "secret": "",
                "handover": "",
            },
            {
                "ref": "KLH-F104",
                "type": "found",
                "title": "White Wireless Earbuds Case (Olive/Sage Cover)",
                "desc": "Picked up an earbuds charging case in a matte green protective sleeve beside the wall charging socket in the SAC Room.",
                "color": "Sage Green",
                "brand": "Apple",
                "cat": "electronics",
                "loc": "SAC_ROOM",
                "spot": "SAC Room — Near Wall Socket",
                "date": "2026-10-28",
                "time": "5:10 PM",
                "status": "claim_pending",
                "custody": "SAC Coordinator Desk",
                "prompt": "Confirm the initials inside the lid or describe the clip attached to the case.",
                "tagged_roll": "",
                "reporter": "2520030555",
                "tags": ["earbuds", "charging case", "green cover"],
                "attrs": {"Battery Light": "Amber LED working", "Case Cover": "Soft silicone"},
                "secret": "Silver mini carabiner clip on the side and initials GG lightly marked inside lid",
                "handover": "Kept safely at SAC Coordinator Desk.",
            },
            {
                "ref": "KLH-L105",
                "type": "lost",
                "title": "Casio fx-991CW Scientific Calculator",
                "desc": "Forgot my black Casio engineering calculator on the second bench in Classroom 203 after the afternoon Discrete Mathematics class.",
                "color": "Matte Black",
                "brand": "Casio",
                "cat": "calculators-books",
                "loc": "SECOND_FLOOR",
                "spot": "Classroom 203 — 2nd Bench",
                "date": "2026-10-27",
                "time": "3:50 PM",
                "status": "matched",
                "custody": "",
                "prompt": "",
                "tagged_roll": "",
                "reporter": "2520030555",
                "tags": ["scientific calculator", "fx-991cw", "203"],
                "attrs": {"Model": "ClassWiz fx-991CW", "Back Label": "Roll digits written in marker"},
                "secret": "",
                "handover": "",
            },
            {
                "ref": "KLH-F106",
                "type": "found",
                "title": "Black Casio ClassWiz Engineering Calculator",
                "desc": "Turned in after lectures ended in Classroom 203. Black scientific calculator with dark grey hard slide cover.",
                "color": "Black",
                "brand": "Casio",
                "cat": "calculators-books",
                "loc": "SECOND_FLOOR",
                "spot": "Classroom 203 — Front Desk",
                "date": "2026-10-27",
                "time": "4:25 PM",
                "status": "matched",
                "custody": "2nd Floor Coordinator Desk",
                "prompt": "What roll number digits or initials are written inside the slide cover?",
                "tagged_roll": "",
                "reporter": "STAFF-LF01",
                "tags": ["calculator", "casio", "203"],
                "attrs": {"Slide Cover": "Included", "Series": "ClassWiz"},
                "secret": "0555 written in silver marker inside the hard cover",
                "handover": "Collect from 2nd Floor Coordinator Desk with your KLH ID card.",
            },
            {
                "ref": "KLH-F107",
                "type": "found",
                "title": "Crimson KLH Lanyard with Bike & House Keys",
                "desc": "Found a Honda scooter key and a house key on a crimson KLH lanyard on a bench inside the Boys Common Room.",
                "color": "Crimson Red",
                "brand": "Honda",
                "cat": "keys-access",
                "loc": "BOYS_COMMON",
                "spot": "Boys Common Room — Corner Bench",
                "date": "2026-10-29",
                "time": "4:15 PM",
                "status": "open",
                "custody": "Ground Floor Reception Desk",
                "prompt": "Describe the small keychain charm attached to the keyring.",
                "tagged_roll": "",
                "reporter": "STAFF-LF01",
                "tags": ["keys", "lanyard", "bike key", "boys common room"],
                "attrs": {"Keys": "Scooter key + house key", "Lanyard": "KLH crimson strap"},
                "secret": "Tiny white astronaut charm on the ring",
                "handover": "Available at Ground Floor Reception Desk.",
            },
            {
                "ref": "KLH-L108",
                "type": "lost",
                "title": "Tortoiseshell Eyeglasses in Mustard Hard Case",
                "desc": "Left my prescription reading glasses inside a warm yellow clamshell case in Classroom 404 after morning lectures.",
                "color": "Mustard Yellow / Brown",
                "brand": "Lenskart Air",
                "cat": "accessories",
                "loc": "FOURTH_FLOOR",
                "spot": "Classroom 404 — Window Row",
                "date": "2026-10-28",
                "time": "12:10 PM",
                "status": "open",
                "custody": "",
                "prompt": "",
                "tagged_roll": "",
                "reporter": "2520030421",
                "tags": ["spectacles", "eyeglasses", "404"],
                "attrs": {"Frame Shape": "Rounded rectangle", "Cloth": "Grey microfiber inside"},
                "secret": "",
                "handover": "",
            },
            {
                "ref": "KLH-F109",
                "type": "found",
                "title": "65W Type-C Laptop Charger with Braided Cable",
                "desc": "White 65W USB-C power adapter left plugged into workbench socket in Lab 15 after the coding session.",
                "color": "White",
                "brand": "Lenovo / Anker",
                "cat": "electronics",
                "loc": "LABS",
                "spot": "Lab 15 — System Row 3",
                "date": "2026-10-30",
                "time": "11:00 AM",
                "status": "open",
                "custody": "Lab Assistant Counter",
                "prompt": "What color cable tie or strap is on the USB-C cord?",
                "tagged_roll": "",
                "reporter": "STAFF-LF01",
                "tags": ["laptop charger", "usb-c", "lab 15"],
                "attrs": {"Wattage": "65W USB-C PD", "Cable Length": "1.8m braided"},
                "secret": "Velcro strap with blue dot near the Type-C connector",
                "handover": "Collect from Lab Assistant Counter before 5:00 PM.",
            },
            {
                "ref": "KLH-F110",
                "type": "found",
                "title": "Slim Tan Leather Cardholder Wallet",
                "desc": "Found on the wooden bench beside the table tennis tables in the Indoor Sports Room. Returned to owner after KLH ID check.",
                "color": "Tan Brown",
                "brand": "Hidesign",
                "cat": "id-wallets",
                "loc": "INDOOR_SPORTS",
                "spot": "Indoor Sports Room — Table Tennis Bench",
                "date": "2026-10-25",
                "time": "5:20 PM",
                "status": "reunited",
                "custody": "Returned to Owner",
                "prompt": "Confirm roll number and metro card inside.",
                "tagged_roll": "2520030421",
                "reporter": "2520030330",
                "tags": ["wallet", "cardholder", "reunited"],
                "attrs": {"Slots": "4 card pockets", "Returned": "Verified via KLH ID"},
                "secret": "Hyderabad Metro smart card in front slot",
                "handover": "Handover completed.",
            },
            {
                "ref": "KLH-F111",
                "type": "found",
                "title": "Spiral CSE Notes Register & Zippered Pen Pouch",
                "desc": "Hardcover dark green spiral notebook with a grey mesh pen pouch left on the side table in the Girls Common Room.",
                "color": "Forest Green",
                "brand": "Classmate",
                "cat": "calculators-books",
                "loc": "GIRLS_COMMON",
                "spot": "Girls Common Room — Side Table",
                "date": "2026-10-29",
                "time": "2:30 PM",
                "status": "open",
                "custody": "Ground Floor Reception Desk",
                "prompt": "Mention the subject title written on the first page or the pens inside the pouch.",
                "tagged_roll": "2520030421",
                "reporter": "STAFF-LF01",
                "tags": ["notebook", "pen pouch", "girls common room"],
                "attrs": {"Notebook": "Classmate 300 pages", "Pouch": "Grey mesh zip"},
                "secret": "DBMS & OS handwritten title page with two Pentel EnerGel pens",
                "handover": "Kept at Ground Floor Reception Desk.",
            },
            {
                "ref": "KLH-L112",
                "type": "lost",
                "title": "Logitech Pebble Matte Black Wireless Mouse",
                "desc": "Forgot my slim black wireless mouse next to the monitor in Lab 108 during the afternoon practical lab.",
                "color": "Matte Black",
                "brand": "Logitech",
                "cat": "electronics",
                "loc": "LABS",
                "spot": "Lab 108 — System 12",
                "date": "2026-10-29",
                "time": "3:40 PM",
                "status": "open",
                "custody": "",
                "prompt": "",
                "tagged_roll": "",
                "reporter": "2520030330",
                "tags": ["wireless mouse", "logitech", "108"],
                "attrs": {"Receiver": "USB nano receiver inside battery lid"},
                "secret": "",
                "handover": "",
            },
            {
                "ref": "KLH-F113",
                "type": "found",
                "title": "CSE DBMS Practical Record Book",
                "desc": "Bound blue practical record manual found on the front table in Lab 01 with roll number 2520030330 written on the index sheet.",
                "color": "Cobalt Blue",
                "brand": "KLH Press",
                "cat": "calculators-books",
                "loc": "LABS",
                "spot": "Lab 01 — Front Table",
                "date": "2026-10-29",
                "time": "4:50 PM",
                "status": "ready_for_pickup",
                "custody": "Lab Assistant Counter",
                "prompt": "Confirm your roll number and lab batch.",
                "tagged_roll": "2520030330",
                "reporter": "STAFF-LF01",
                "tags": ["record book", "lab 01", "2520030330"],
                "attrs": {"Subject": "DBMS Lab", "Roll Tagged": "2520030330"},
                "secret": "Signed Lab 1 to Lab 6 experiments",
                "handover": "Show pickup QR pass at Lab Assistant Counter.",
            },
        ]

        inserted_items = {}
        for entry in seed_items:
            cat = cat_map[entry["cat"]]
            loc = loc_map[entry["loc"]]
            rep = user_map[entry["reporter"]]
            emb = compute_item_embedding(
                title=entry["title"],
                description=entry["desc"],
                color=entry["color"],
                brand=entry["brand"],
                category_slug=cat["slug"],
                location_name=loc["building_name"],
                tags=entry["tags"],
                specific_spot=entry["spot"],
            )
            cur = await conn.execute(
                """
                INSERT INTO items (
                    reference_code, item_type, title, description, color, brand,
                    category_id, location_id, specific_spot, event_date, event_time_approx,
                    status, custody_holder, verification_prompt, tagged_roll_number,
                    reporter_id, embedding_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry["ref"],
                    entry["type"],
                    entry["title"],
                    entry["desc"],
                    entry["color"],
                    entry["brand"],
                    cat["id"],
                    loc["id"],
                    entry["spot"],
                    entry["date"],
                    entry["time"],
                    entry["status"],
                    entry["custody"],
                    entry["prompt"],
                    entry["tagged_roll"],
                    rep["id"],
                    json.dumps(emb),
                ),
            )
            item_id = cur.lastrowid
            doc_id = await document_store.insert_item_details(
                item_id=item_id,
                tags=entry["tags"],
                custom_attributes=entry["attrs"],
                finder_secret_clue=entry["secret"],
                handover_instructions=entry["handover"],
            )
            await conn.execute(
                "UPDATE items SET nosql_doc_id = ? WHERE id = ?",
                (doc_id, item_id),
            )
            await conn.execute(
                """
                INSERT INTO item_status_history (item_id, previous_status, new_status, changed_by, note)
                VALUES (?, NULL, ?, ?, ?)
                """,
                (item_id, entry["status"], rep["id"], "Initial campus report logged"),
            )
            inserted_items[entry["ref"]] = {
                "id": item_id,
                "title": entry["title"],
                "description": entry["desc"],
                "color": entry["color"],
                "brand": entry["brand"],
                "category_id": cat["id"],
                "category_slug": cat["slug"],
                "location_id": loc["id"],
                "building_name": loc["building_name"],
                "specific_spot": entry["spot"],
                "zone": loc["zone"],
                "event_date": entry["date"],
                "tags": entry["tags"],
                "embedding": emb,
                "type": entry["type"],
                "status": entry["status"],
            }

        await document_store.add_item_sighting(
            item_id=inserted_items["KLH-L112"]["id"],
            author_id=user_map["2520030555"]["id"],
            author_name="Pranav Chowdary",
            author_roll="2520030555",
            note="Spotted on System 12 after the 4 PM batch and handed to the Lab 108 assistant.",
        )

        lost_list = [
            v for v in inserted_items.values()
            if v["type"] == "lost" and v["status"] != "reunited"
        ]
        found_list = [
            v for v in inserted_items.values()
            if v["type"] == "found" and v["status"] not in ("reunited", "ready_for_pickup")
        ]
        for lost_it in lost_list:
            for found_it in found_list:
                sim_score, reason = score_lost_found_pair(lost_it, found_it)
                if sim_score >= 0.48:
                    match_status = "claimed" if found_it["id"] == inserted_items["KLH-F104"]["id"] else "suggested"
                    await conn.execute(
                        """
                        INSERT OR IGNORE INTO item_matches (lost_item_id, found_item_id, similarity_score, match_reason, status)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (lost_it["id"], found_it["id"], sim_score, reason, match_status),
                    )

        santhosh_id = user_map["2520030330"]["id"]
        ganesh_id = user_map["2520030252"]["id"]
        jayanth_id = user_map["2520030421"]["id"]
        staff_id = user_map["STAFF-LF01"]["id"]

        cur_claim1 = await conn.execute(
            """
            INSERT INTO claims (
                claim_code, item_id, linked_lost_item_id, claimant_id,
                ownership_proof, identifying_marks, preferred_contact,
                status, pickup_desk
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)
            """,
            (
                "CLM-2041",
                inserted_items["KLH-F104"]["id"],
                inserted_items["KLH-L103"]["id"],
                ganesh_id,
                "It has a small silver carabiner clip on the right loop and my initials GG written lightly inside the top lid.",
                "Paired as Ganesh's AirPods Pro; sage green silicone case",
                "+91 98490 30252",
                "SAC Coordinator Desk",
            ),
        )
        await document_store.append_claim_timeline_event(
            claim_id=cur_claim1.lastrowid,
            actor_name="Ganesh Guntu",
            actor_role="student",
            message="Submitted ownership claim with identifying details for SAC Room earbuds case.",
        )

        cur_claim2 = await conn.execute(
            """
            INSERT INTO claims (
                claim_code, item_id, linked_lost_item_id, claimant_id,
                ownership_proof, identifying_marks, preferred_contact,
                status, reviewer_id, reviewer_note, pickup_code, pickup_desk, reviewed_at
            ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'approved_pickup', ?, ?, ?, ?, datetime('now', '-2 hours'))
            """,
            (
                "CLM-2055",
                inserted_items["KLH-F113"]["id"],
                santhosh_id,
                "Roll 2520030330 CSE Section B, signed experiments 1 to 6 inside.",
                "",
                "+91 98490 30330",
                staff_id,
                "Roll number verified. Ready at Lab Assistant Counter.",
                "KLH-4920",
                "Lab Assistant Counter",
            ),
        )
        await document_store.append_claim_timeline_event(
            claim_id=cur_claim2.lastrowid,
            actor_name="Srinivas Rao",
            actor_role="staff",
            message="Claim approved. Pickup code KLH-4920 issued for Lab Assistant Counter.",
        )

        cur_claim3 = await conn.execute(
            """
            INSERT INTO claims (
                claim_code, item_id, linked_lost_item_id, claimant_id,
                ownership_proof, identifying_marks, preferred_contact,
                status, reviewer_id, reviewer_note, pickup_code, pickup_desk, reviewed_at
            ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'reunited', ?, ?, ?, ?, datetime('now', '-3 days'))
            """,
            (
                "CLM-1988",
                inserted_items["KLH-F110"]["id"],
                jayanth_id,
                "Contains my KLH CSE ID card (2520030421) and a blue Hyderabad Metro smart card in the front pocket.",
                "Tan Hidesign stitch mark on inner fold",
                "+91 98490 30421",
                staff_id,
                "Verified KLH ID card in person at Indoor Sports Desk.",
                "KLH-8814",
                "Indoor Sports Desk",
            ),
        )
        await document_store.append_claim_timeline_event(
            claim_id=cur_claim3.lastrowid,
            actor_name="Srinivas Rao",
            actor_role="staff",
            message="Ownership verified and wallet handed back to student.",
        )

        await conn.commit()
