from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    identifier: str = Field(..., min_length=2)
    password: str = Field(..., min_length=4)


class RegisterRequest(BaseModel):
    roll_number: str = Field(..., min_length=2, max_length=32)
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=4, max_length=160)
    department: str = Field(default="CSE", max_length=80)
    phone: Optional[str] = Field(default="", max_length=24)
    password: str = Field(..., min_length=4, max_length=128)


class UserProfile(BaseModel):
    id: int
    roll_number: str
    full_name: str
    email: str
    department: str
    phone: Optional[str] = ""
    role: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class ItemCreateRequest(BaseModel):
    item_type: Literal["lost", "found"]
    title: str = Field(..., min_length=2, max_length=160)
    description: str = Field(..., min_length=2, max_length=2000)
    color: Optional[str] = Field(default="", max_length=60)
    brand: Optional[str] = Field(default="", max_length=80)
    category_id: int
    location_id: int
    specific_spot: Optional[str] = Field(default="", max_length=160)
    event_date: str = Field(..., description="YYYY-MM-DD")
    event_time_approx: Optional[str] = Field(default="", max_length=40)
    custody_holder: Optional[str] = Field(default="", max_length=160)
    verification_prompt: Optional[str] = Field(default="", max_length=240)
    tagged_roll_number: Optional[str] = Field(default="", max_length=32)
    finder_secret_clue: Optional[str] = Field(default="", max_length=300)
    handover_instructions: Optional[str] = Field(default="", max_length=300)
    tags: List[str] = Field(default_factory=list)
    custom_attributes: Dict[str, Any] = Field(default_factory=dict)
    photo_data_url: Optional[str] = Field(default=None)


class ItemUpdateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=160)
    description: str = Field(..., min_length=2, max_length=2000)
    color: Optional[str] = Field(default="", max_length=60)
    brand: Optional[str] = Field(default="", max_length=80)
    category_id: int
    location_id: int
    specific_spot: Optional[str] = Field(default="", max_length=160)
    event_date: str = Field(..., description="YYYY-MM-DD")
    custody_holder: Optional[str] = Field(default="", max_length=160)
    verification_prompt: Optional[str] = Field(default="", max_length=240)
    tagged_roll_number: Optional[str] = Field(default="", max_length=32)


class SightingCreateRequest(BaseModel):
    note: str = Field(..., min_length=2, max_length=400)


class ClaimCreateRequest(BaseModel):
    item_id: int
    linked_lost_item_id: Optional[int] = None
    ownership_proof: str = Field(..., min_length=2, max_length=1200)
    identifying_marks: Optional[str] = Field(default="", max_length=600)
    preferred_contact: Optional[str] = Field(default="", max_length=100)


class ClaimDecisionRequest(BaseModel):
    decision: Literal["approve_pickup", "mark_reunited", "decline"]
    reviewer_note: Optional[str] = Field(default="", max_length=500)
    pickup_desk: Optional[str] = Field(default="", max_length=160)


class PassVerifyRequest(BaseModel):
    pickup_code: str = Field(..., min_length=3, max_length=32)


class StatusUpdateRequest(BaseModel):
    status: Literal["open", "matched", "claim_pending", "ready_for_pickup", "reunited", "archived"]
    note: Optional[str] = Field(default="", max_length=300)
