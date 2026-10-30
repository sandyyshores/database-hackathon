import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import JWT_ALGORITHM, JWT_EXPIRE_HOURS, JWT_SECRET_KEY
from sql_db import get_db_connection

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str, salt: Optional[str] = None) -> str:
    salt_hex = salt or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_hex.encode("utf-8"),
        120_000,
    ).hex()
    return f"pbkdf2_sha256${salt_hex}${derived}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        _, salt_hex, expected_hex = stored_hash.split("$", 2)
    except ValueError:
        return False
    candidate = hash_password(password, salt=salt_hex).split("$", 2)[2]
    return hmac.compare_digest(candidate, expected_hex)


def create_access_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "roll_number": user["roll_number"],
        "role": user["role"],
        "name": user["full_name"],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRE_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def _extract_candidate_tokens(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> List[str]:
    candidates: List[str] = []
    custom_hdr = request.headers.get("x-klh-token", "").strip()
    if custom_hdr:
        candidates.append(custom_hdr)
    cookie_tok = request.cookies.get("klh_token", "").strip()
    if cookie_tok:
        candidates.append(cookie_tok)
    if credentials and credentials.credentials:
        candidates.append(credentials.credentials.strip())
    return candidates


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    conn=Depends(get_db_connection),
) -> Optional[dict]:
    candidates = _extract_candidate_tokens(request, credentials)
    if not candidates:
        return None

    user_id: Optional[int] = None
    for raw_token in candidates:
        try:
            payload = jwt.decode(
                raw_token,
                JWT_SECRET_KEY,
                algorithms=[JWT_ALGORITHM],
            )
            user_id = int(payload["sub"])
            break
        except (jwt.PyJWTError, KeyError, ValueError):
            continue

    if user_id is None:
        return None

    cursor = await conn.execute(
        """
        SELECT id, roll_number, full_name, email, department, phone, role, created_at
        FROM users WHERE id = ?
        """,
        (user_id,),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_current_user(
    user: Optional[dict] = Depends(get_optional_user),
) -> dict:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in with your KLH University account to continue.",
        )
    return user


async def require_staff(
    user: dict = Depends(get_current_user),
) -> dict:
    if user.get("role") != "staff":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Campus Helpdesk Coordinators can perform verification actions.",
        )
    return user
