
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InventoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(default=1.0, gt=0)
    unit: str = Field(default="item", min_length=1, max_length=30)
    category: str | None = Field(default=None, max_length=60)


class InventoryResponse(InventoryCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
