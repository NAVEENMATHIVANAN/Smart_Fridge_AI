
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.models import InventoryItem
from app.schemas import InventoryCreate, InventoryResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Smart Fridge AI API",
    description="Local fridge inventory and AI ingredient detection API.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/")
def root():
    return {"message": "Smart Fridge AI API is running", "docs": "/docs"}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


@app.post(
    "/api/inventory",
    response_model=InventoryResponse,
    status_code=201,
)
def create_inventory_item(
    item: InventoryCreate,
    db: Session = Depends(get_db),
):
    name = item.name.strip()
    unit = item.unit.strip()

    if not name or not unit:
        raise HTTPException(
            status_code=422,
            detail="Ingredient name and unit cannot be blank.",
        )

    db_item = InventoryItem(
        name=name,
        quantity=item.quantity,
        unit=unit,
        category=item.category.strip() if item.category else None,
    )

    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@app.get("/api/inventory", response_model=list[InventoryResponse])
def list_inventory(db: Session = Depends(get_db)):
    statement = select(InventoryItem).order_by(InventoryItem.id)
    return list(db.scalars(statement).all())
