
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


class RecipeSuggestionRequest(BaseModel):
    cuisine: str | None = Field(default=None, max_length=60)
    dietary_preferences: list[str] = Field(default_factory=list, max_length=10)
    excluded_ingredients: list[str] = Field(default_factory=list, max_length=30)
    priority_ingredients: list[str] = Field(default_factory=list, max_length=30)
    servings: int = Field(default=2, ge=1, le=12)
    max_prep_minutes: int = Field(default=45, ge=5, le=240)



class RecipeResponse(BaseModel):
    title: str
    description: str
    prep_minutes: int = Field(ge=1, le=1440)
    servings: int = Field(ge=1, le=12)

    available_ingredients: list[str]
    missing_ingredients: list[str]
    uses_expiring_soon: list[str]
    steps: list[str]
    disclaimer: str

    # Approximate nutrition per serving
    calories_kcal: float = Field(ge=0, le=10000)
    protein_g: float = Field(ge=0, le=1000)
    carbohydrates_g: float = Field(ge=0, le=1000)
    fat_g: float = Field(ge=0, le=1000)



class RecipeSuggestionResponse(BaseModel):
    recipes: list[RecipeResponse]
    inventory_count: int
    message: str


class StorageGuidanceRequest(BaseModel):
    ingredient: str = Field(min_length=1, max_length=120)
    question: str | None = Field(default=None, max_length=500)
    category: str | None = Field(default=None, max_length=60)
    storage_notes: str | None = Field(default=None, max_length=500)


class StorageGuidanceResponse(BaseModel):
    ingredient: str
    storage_method: str
    temperature: str
    preparation: list[str]
    storage_duration: str
    freezing_guidance: str
    spoilage_signs: list[str]
    additional_tips: list[str]
    answer: str
    disclaimer: str


class WeeklyMealPlanRequest(BaseModel):
    dietary_preferences: list[str] = Field(default_factory=list, max_length=10)
    excluded_ingredients: list[str] = Field(default_factory=list, max_length=30)
    priority_ingredients: list[str] = Field(default_factory=list, max_length=30)
    servings: int = Field(default=2, ge=1, le=12)
    max_prep_minutes: int = Field(default=45, ge=5, le=240)
    existing_plan: list[dict] | None = None
    target_day: str | None = Field(default=None, max_length=20)
    target_meal: str | None = Field(default=None, max_length=20)


class WeeklyMealPlanResponse(BaseModel):
    plan: list[dict]
    inventory_count: int
    message: str
