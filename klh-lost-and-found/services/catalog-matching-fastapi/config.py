import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", str(DATA_DIR / "klh_lost_found.db"))
NOSQL_JSON_PATH = os.getenv("NOSQL_JSON_PATH", str(DATA_DIR / "mongodb_collections.json"))
MONGODB_URI = os.getenv("MONGODB_URI", "")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "klh-university-campus-portal-secret-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72

EXPRESS_SERVICE_URL = os.getenv("EXPRESS_SERVICE_URL", "http://127.0.0.1:8002")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "")
