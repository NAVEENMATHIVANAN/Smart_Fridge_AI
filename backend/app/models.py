
from datetime import date

from sqlalchemy import Date, String
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

from sqlalchemy import Date, String

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), index=True)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String(30), default="item")
    category: Mapped[str | None] = mapped_column(
        String(60), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
    )
    purchase_date = mapped_column(Date, nullable=True)
    expiry_date = mapped_column(Date, nullable=True)
    storage_notes = mapped_column(String(500), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(
     Date, nullable=True
    )

    expiry_date: Mapped[date | None] = mapped_column(
    Date, nullable=True
    )

    storage_notes: Mapped[str | None] = mapped_column(
    String(500), nullable=True
    )
