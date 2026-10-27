
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from app.database import Base, engine, get_db
from app.models import InventoryItem
from app.schemas import InventoryCreate, InventoryResponse

from fastapi import File, UploadFile
from app.services.image_validator import read_validated_image
from app.services.vision_service import detect_ingredients

from typing import Annotated
from fastapi import File, UploadFile

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

@app.delete("/api/inventory/{item_id}")
def delete_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    item = db.get(InventoryItem, item_id)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Inventory item not found.",
        )

    db.delete(item)
    db.commit()

    return {
        "message": "Inventory item deleted successfully.",
        "id": item_id,
    }

@app.post(
    "/api/detect-ingredients",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["files"],
                        "properties": {
                            "files": {
                                "type": "array",
                                "items": {
                                    "type": "string",
                                    "format": "binary",
                                },
                            },
                        },
                    },
                },
            },
        },
    },
)
async def detect_fridge_ingredients(
    files: Annotated[
        list[UploadFile],
        File(description="Upload 1 to 3 fridge photos."),
    ],
):
    if not 1 <= len(files) <= 3:
        raise HTTPException(
            status_code=422,
            detail="Upload between 1 and 3 fridge photos.",
        )

    images = [await read_validated_image(file) for file in files]
    ingredients = await run_in_threadpool(detect_ingredients, images)

    return {
        "ingredients": ingredients,
        "image_count": len(images),
        "message": "Review the detected ingredients before saving them."
    }