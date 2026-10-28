
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.database import Base, engine, get_db
from app.models import InventoryItem
from app.schemas import (
    ExpirySuggestionRequest,
    ExpirySuggestionResponse,
    InventoryCreate,
    InventoryResponse,
    InventoryUpdate,
)

from app.schemas import (
    RecipeSuggestionRequest,
    RecipeSuggestionResponse,
)
from app.services.recipe_service import generate_recipes

from app.services.expiry_service import suggest_expiry
from app.services.image_validator import read_validated_image
from app.services.vision_service import detect_ingredients

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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
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
        purchase_date=item.purchase_date,
        expiry_date=item.expiry_date,
        storage_notes=item.storage_notes,
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
                                "description": "Upload 1 to 3 fridge photos.",
                            }
                        },
                    }
                }
            },
        }
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

    images = [
        await read_validated_image(file)
        for file in files
    ]

    ingredients = await run_in_threadpool(
        detect_ingredients,
        images,
    )

    return {
        "ingredients": ingredients,
        "image_count": len(images),
        "message": "Review the detected ingredients before saving them.",
    }



@app.post(
    "/api/recipes/suggest",
    response_model=RecipeSuggestionResponse,
)
def suggest_recipes(
    request: RecipeSuggestionRequest,
    db: Session = Depends(get_db),
):
    try:
        items = db.scalars(
            select(InventoryItem).order_by(InventoryItem.name)
        ).all()

        inventory = [
            {
                "name": item.name,
                "quantity": item.quantity,
                "unit": item.unit,
                "category": item.category,
                "expiry_date": (
                    item.expiry_date.isoformat()
                    if item.expiry_date
                    else None
                ),
            }
            for item in items
        ]

        if not inventory:
            return RecipeSuggestionResponse(
                recipes=[],
                inventory_count=0,
                message=(
                    "Your inventory is empty. Add and save ingredients "
                    "before requesting recipe suggestions."
                ),
            )

        recipes = generate_recipes(
            inventory=inventory,
            cuisine=request.cuisine,
            dietary_preferences=request.dietary_preferences,
            excluded_ingredients=request.excluded_ingredients,
            servings=request.servings,
            max_prep_minutes=request.max_prep_minutes,
        )

        return RecipeSuggestionResponse(
            recipes=recipes,
            inventory_count=len(inventory),
            message="Review the suggested recipes and check food condition before cooking.",
        )

    except RuntimeError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Recipe generation failed. Check the backend logs and try again.",
        ) from exc


@app.post(
    "/api/expiry-suggestion",
    response_model=ExpirySuggestionResponse,
)
async def expiry_suggestion(payload: ExpirySuggestionRequest):
    try:
        return await run_in_threadpool(
            suggest_expiry,
            payload.name,
            payload.category,
            payload.purchase_date,
            payload.storage_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.patch("/api/inventory/{item_id}", response_model=InventoryResponse)
def update_inventory_item(
    item_id: int,
    payload: InventoryUpdate,
    db: Session = Depends(get_db),
):
    item = db.get(InventoryItem, item_id)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Inventory item not found.",
        )

    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)

    return item


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