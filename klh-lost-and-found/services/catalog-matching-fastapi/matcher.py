import hashlib
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

EMBEDDING_DIM = 128

CONCEPT_CLUSTERS: Dict[str, List[str]] = {
    "concept_audio_earbuds": [
        "earbuds", "earbud", "airpods", "airpod", "earphones", "tws", "buds",
        "charging case", "wireless audio", "headphones", "headset", "neckband",
    ],
    "concept_bottle_flask": [
        "bottle", "water bottle", "flask", "thermos", "sipper", "insulated",
        "milton", "cello", "tumbler", "steel bottle", "hydration",
    ],
    "concept_wallet_cardholder": [
        "wallet", "bifold", "cardholder", "purse", "leather fold",
        "debit card", "metro card", "cash",
    ],
    "concept_id_card": [
        "id card", "student id", "identity card", "roll card",
    ],
    "concept_calculator": [
        "calculator", "calc", "casio", "scientific", "fx991", "fx-991", "fx-991cw",
        "fx-991es", "classwiz", "engineering calculator", "solar calculator",
    ],
    "concept_eyewear": [
        "glasses", "spectacles", "specs", "eyeglasses", "sunglasses", "frames",
        "lenskart", "glasses case", "tortoiseshell", "lens",
    ],
    "concept_keys": [
        "keys", "key", "keychain", "keyring", "lanyard", "house key", "flat key",
        "bike key", "scooter key", "activa key", "car key", "fob",
    ],
    "concept_watch": [
        "watch", "smartwatch", "wristwatch", "fitness band", "apple watch",
        "sport loop", "strap", "dial",
    ],
    "concept_notebook_books": [
        "notebook", "spiral", "notes", "register", "textbook", "lab manual",
        "record book", "folder", "binder", "journal", "handwritten", "pen pouch",
    ],
    "concept_charger_cable": [
        "charger", "adapter", "power brick", "power adapter", "usb-c", "type-c",
        "braided cable", "charging cable", "65w",
    ],
    "concept_mouse_peripherals": [
        "mouse", "wireless mouse", "logitech", "pebble", "pendrive", "flash drive",
        "ssd", "hard drive", "stylus",
    ],
    "concept_laptop_tablet": [
        "macbook", "laptop", "ipad", "tablet",
    ],
    "concept_phone": [
        "iphone", "smartphone", "android phone", "oneplus", "samsung phone", "pixel",
    ],
    "concept_umbrella_bag": [
        "umbrella", "backpack", "tote", "duffel", "gym bag", "hoodie", "jacket",
    ],
}

COLOR_FAMILIES: Dict[str, List[str]] = {
    "color_blue": ["navy", "dark blue", "blue", "cobalt", "indigo", "sky blue", "teal"],
    "color_black": ["black", "matte black", "charcoal", "graphite", "dark grey", "space grey", "jet black"],
    "color_white": ["white", "ivory", "cream", "pearl", "off-white", "silver"],
    "color_red": ["red", "crimson", "maroon", "burgundy", "garnet", "coral", "wine"],
    "color_brown": ["brown", "tan", "camel", "cognac", "leather", "beige", "coffee", "mustard", "yellow"],
    "color_green": ["green", "sage", "olive", "forest", "mint", "emerald"],
}

CAMPUS_PLACE_SYNONYMS: Dict[str, List[str]] = {
    "place_canteen": ["canteen", "cafeteria", "food", "lunch", "snack", "juice", "dining"],
    "place_sac": ["sac", "sac room", "hangout", "activity room", "student activity"],
    "place_boys_common": ["boys common", "boys common room", "boys lounge"],
    "place_girls_common": ["girls common", "girls common room", "girls lounge"],
    "place_sports": ["indoor sports", "sports room", "table tennis", "carrom", "chess", "badminton"],
    "place_labs": ["practical lab", "coding session", "lab assistant"],
}

ROOM_TOKEN_PATTERN = re.compile(
    r"\b(?:lab\s*(?:0?1|14|15|008|108|301|303)|00[3-8]|10[1235678]|20[12356]|30[123567]|40[1-7])\b"
)

STOPWORDS = {
    "the", "and", "for", "with", "near", "from", "was", "were", "have", "has",
    "had", "lost", "found", "left", "someone", "around", "today", "yesterday",
    "item", "please", "help", "mine", "some", "into", "onto", "that", "this",
    "very", "small", "medium", "large", "while", "after", "before", "during",
}


def _normalize_text(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9\s\-]", " ", (text or "").lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _canonical_room_code(raw: str) -> str:
    compact = re.sub(r"\s+", "", raw.lower())
    if compact in {"lab008", "008"}:
        return "008"
    if compact in {"lab108", "108"}:
        return "108"
    if compact in {"lab301", "301"}:
        return "301"
    if compact in {"lab303", "303"}:
        return "303"
    if compact in {"lab01", "lab1"}:
        return "lab01"
    if compact == "lab14":
        return "lab14"
    if compact == "lab15":
        return "lab15"
    return compact


def _extract_rooms(text: str) -> List[str]:
    norm = _normalize_text(text)
    found = ROOM_TOKEN_PATTERN.findall(norm)
    return list(dict.fromkeys(_canonical_room_code(r) for r in found))


def _extract_semantic_tokens(
    title: str,
    description: str,
    color: str = "",
    brand: str = "",
    category_slug: str = "",
    location_name: str = "",
    specific_spot: str = "",
    tags: Optional[List[str]] = None,
) -> Tuple[List[Tuple[str, float]], List[str], List[str]]:
    item_text = _normalize_text(
        " ".join(
            [
                title or "",
                description or "",
                color or "",
                brand or "",
                specific_spot or "",
                " ".join(tags or []),
            ]
        )
    )
    combined = _normalize_text(f"{item_text} {location_name or ''}")

    weighted_features: List[Tuple[str, float]] = []
    matched_concepts: List[str] = []
    matched_colors: List[str] = []

    for concept_key, phrases in CONCEPT_CLUSTERS.items():
        if any(re.search(rf"\b{re.escape(p)}\b", item_text) for p in phrases):
            weighted_features.append((concept_key, 3.6))
            matched_concepts.append(concept_key)

    color_norm = _normalize_text(f"{color} {title} {description}")
    for color_key, shades in COLOR_FAMILIES.items():
        if any(re.search(rf"\b{re.escape(s)}\b", color_norm) for s in shades):
            weighted_features.append((color_key, 2.2))
            matched_colors.append(color_key)

    for place_key, terms in CAMPUS_PLACE_SYNONYMS.items():
        if any(t in combined for t in terms):
            weighted_features.append((place_key, 1.4))

    for room_code in _extract_rooms(item_text):
        weighted_features.append((f"room:{room_code}", 2.6))

    if category_slug:
        weighted_features.append((f"cat:{category_slug.lower()}", 2.2))
    if brand and brand.strip():
        for tok in _normalize_text(brand).split():
            if len(tok) > 1:
                weighted_features.append((f"brand:{tok}", 2.6))

    words = [w for w in item_text.split() if len(w) >= 3 and w not in STOPWORDS]
    title_words = set(_normalize_text(title).split())

    for idx, word in enumerate(words):
        weight = 2.0 if word in title_words else 1.25
        weighted_features.append((f"w:{word}", weight))
        if len(word) >= 5:
            weighted_features.append((f"pre:{word[:5]}", 0.9))
        padded = f"<{word}>"
        for i in range(len(padded) - 3):
            weighted_features.append((f"c4:{padded[i:i+4]}", 0.25))
        if idx + 1 < len(words):
            weighted_features.append((f"bg:{words[idx]}_{words[idx+1]}", 1.1))

    return weighted_features, matched_concepts, matched_colors


def compute_item_embedding(
    title: str,
    description: str,
    color: str = "",
    brand: str = "",
    category_slug: str = "",
    location_name: str = "",
    tags: Optional[List[str]] = None,
    specific_spot: str = "",
) -> List[float]:
    features, _, _ = _extract_semantic_tokens(
        title=title,
        description=description,
        color=color,
        brand=brand,
        category_slug=category_slug,
        location_name=location_name,
        specific_spot=specific_spot,
        tags=tags,
    )
    vec = np.zeros(EMBEDDING_DIM, dtype=np.float64)
    for token, weight in features:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        h = int.from_bytes(digest, "little")
        idx1 = h % EMBEDDING_DIM
        sign1 = 1.0 if ((h >> 8) & 1) == 0 else -1.0
        idx2 = (h >> 16) % EMBEDDING_DIM
        sign2 = 1.0 if ((h >> 24) & 1) == 0 else -1.0
        vec[idx1] += sign1 * weight
        vec[idx2] += sign2 * (weight * 0.5)

    norm = float(np.linalg.norm(vec))
    if norm > 1e-9:
        vec = vec / norm
    return [round(float(x), 6) for x in vec]


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    a = np.asarray(vec_a, dtype=np.float64)
    b = np.asarray(vec_b, dtype=np.float64)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom < 1e-9:
        return 0.0
    return float(np.clip(np.dot(a, b) / denom, -1.0, 1.0))


def _parse_date_safe(d_str: str) -> Optional[date]:
    if not d_str:
        return None
    try:
        return datetime.strptime(d_str[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def score_lost_found_pair(
    lost_item: Dict[str, Any],
    found_item: Dict[str, Any],
) -> Tuple[float, str]:
    vec_sim = cosine_similarity(
        lost_item.get("embedding") or [],
        found_item.get("embedding") or [],
    )

    _, lost_concepts, lost_colors = _extract_semantic_tokens(
        lost_item.get("title", ""),
        lost_item.get("description", ""),
        lost_item.get("color", ""),
        lost_item.get("brand", ""),
        lost_item.get("category_slug", ""),
        lost_item.get("building_name", ""),
        lost_item.get("specific_spot", ""),
        lost_item.get("tags", []),
    )
    _, found_concepts, found_colors = _extract_semantic_tokens(
        found_item.get("title", ""),
        found_item.get("description", ""),
        found_item.get("color", ""),
        found_item.get("brand", ""),
        found_item.get("category_slug", ""),
        found_item.get("building_name", ""),
        found_item.get("specific_spot", ""),
        found_item.get("tags", []),
    )

    reasons: List[str] = []
    score = max(0.0, vec_sim) * 0.62

    shared_concepts = set(lost_concepts) & set(found_concepts)
    if shared_concepts:
        score += 0.18
        reasons.append("very similar item type & description")
    elif lost_concepts and found_concepts:
        score -= 0.24
    elif vec_sim >= 0.38:
        reasons.append("closely matching description details")

    same_cat = (
        lost_item.get("category_id")
        and lost_item.get("category_id") == found_item.get("category_id")
    )
    if same_cat:
        score += 0.08
    else:
        score -= 0.14

    shared_colors = set(lost_colors) & set(found_colors)
    if shared_colors:
        score += 0.08
        color_label = (found_item.get("color") or lost_item.get("color") or "matching").lower()
        reasons.append(f"matching {color_label} finish")

    lb = _normalize_text(lost_item.get("brand") or "")
    fb = _normalize_text(found_item.get("brand") or "")
    if lb and fb and (lb in fb or fb in lb):
        score += 0.08
        reasons.append(f"same brand ({found_item.get('brand')})")

    lost_rooms = set(
        _extract_rooms(f"{lost_item.get('specific_spot', '')} {lost_item.get('description', '')}")
    )
    found_rooms = set(
        _extract_rooms(f"{found_item.get('specific_spot', '')} {found_item.get('description', '')}")
    )
    if lost_rooms and found_rooms:
        if lost_rooms & found_rooms:
            score += 0.10
            spot_label = (found_item.get("specific_spot") or "").split("—")[0].strip() or "same room"
            reasons.append(f"same room ({spot_label})")
        else:
            score -= 0.04
    elif lost_item.get("location_id") == found_item.get("location_id"):
        score += 0.07
        reasons.append(f"both reported in {found_item.get('building_name', 'the same area')}")
    elif lost_item.get("zone") and lost_item.get("zone") == found_item.get("zone"):
        score += 0.03
        reasons.append(f"nearby on {found_item.get('zone')}")

    d_lost = _parse_date_safe(str(lost_item.get("event_date", "")))
    d_found = _parse_date_safe(str(found_item.get("event_date", "")))
    if d_lost and d_found:
        day_gap = abs((d_found - d_lost).days)
        if day_gap == 0:
            score += 0.05
            reasons.append("reported on the same day")
        elif day_gap <= 3:
            score += 0.03
            reasons.append(f"reported within {day_gap} day{'s' if day_gap > 1 else ''}")
        elif day_gap > 21:
            score -= 0.06

    final_score = float(np.clip(score, 0.0, 0.98))

    if not reasons:
        reasons.append("overlapping details in campus reports")
    friendly_reason = reasons[0].capitalize()
    if len(reasons) > 1:
        friendly_reason += ", " + ", ".join(reasons[1:3])
    friendly_reason += "."

    return round(final_score, 4), friendly_reason


def semantic_search_rank(query: str, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    q_norm = _normalize_text(query)
    if not q_norm:
        return items

    q_rooms = set(_extract_rooms(q_norm))
    _, q_concepts, q_colors = _extract_semantic_tokens(title=query, description=query, specific_spot=query)
    q_vec = compute_item_embedding(title=query, description=query, specific_spot=query)
    scored: List[Tuple[float, Dict[str, Any]]] = []

    is_pure_room_query = bool(q_rooms) and len(q_norm.split()) <= 2

    for item in items:
        item_spot_text = " ".join(
            [
                item.get("title", ""),
                item.get("description", ""),
                item.get("specific_spot", ""),
                " ".join(item.get("tags", [])),
            ]
        )
        item_rooms = set(_extract_rooms(item_spot_text))

        if is_pure_room_query:
            if q_rooms & item_rooms:
                enriched = dict(item)
                enriched["search_relevance"] = 0.98
                scored.append((0.98, enriched))
            continue

        clean_building = (item.get("building_name") or "").split("(")[0]
        haystack = _normalize_text(
            " ".join(
                [
                    item.get("title", ""),
                    item.get("description", ""),
                    item.get("color", ""),
                    item.get("brand", ""),
                    clean_building,
                    item.get("specific_spot", ""),
                    item.get("category_name", ""),
                    item.get("reference_code", ""),
                    " ".join(item.get("tags", [])),
                ]
            )
        )

        exact_boost = 0.0
        if q_norm in haystack:
            exact_boost += 0.55
        else:
            q_words = [w for w in q_norm.split() if len(w) >= 2]
            matched_words = sum(
                1 for w in q_words if re.search(rf"\b{re.escape(w)}", haystack)
            )
            if q_words and matched_words > 0:
                exact_boost += 0.38 * (matched_words / len(q_words))

        _, item_concepts, item_colors = _extract_semantic_tokens(
            item.get("title", ""),
            item.get("description", ""),
            item.get("color", ""),
            item.get("brand", ""),
            item.get("category_slug", ""),
            clean_building,
            item.get("specific_spot", ""),
            item.get("tags", []),
        )
        concept_overlap = 0.28 if (set(q_concepts) & set(item_concepts)) else 0.0
        color_overlap = 0.12 if (set(q_colors) & set(item_colors)) else 0.0
        room_overlap = 0.25 if (q_rooms & item_rooms) else 0.0

        sim = cosine_similarity(q_vec, item.get("embedding") or [])
        combined = exact_boost + concept_overlap + color_overlap + room_overlap + max(0.0, sim) * 0.50

        if exact_boost > 0 or concept_overlap > 0 or room_overlap > 0 or combined >= 0.30:
            enriched = dict(item)
            enriched["search_relevance"] = round(min(0.99, combined), 3)
            scored.append((combined, enriched))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [pair[1] for pair in scored]
