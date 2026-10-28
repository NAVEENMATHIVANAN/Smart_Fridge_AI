
from datetime import date, datetime

from pydantic import BaseModel, Field, ConfigDict


class InventoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=30)
    category: str | None = Field(default=None, max_length=60)

    # Stage 4: optional freshness tracking
    purchase_date: date | None = None
    expiry_date: date | None = None
    storage_notes: str | None = Field(default=None, max_length=500)


class InventoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    quantity: float
    unit: str
    category: str | None = None
    created_at: datetime

    purchase_date: date | None = None
    expiry_date: date | None = None
    storage_notes: str | None = None


class InventoryUpdate(BaseModel):
    """Only supplied fields are updated; omitted fields remain unchanged."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    category: str | None = Field(default=None, max_length=60)

    purchase_date: date | None = None
    expiry_date: date | None = None
    storage_notes: str | None = Field(default=None, max_length=500)


class ExpirySuggestionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=60)
    purchase_date: date | None = None
    storage_notes: str | None = Field(default=None, max_length=500)


class ExpirySuggestionResponse(BaseModel):
    suggested_expiry_date: date
    explanation: str
    disclaimer: str
