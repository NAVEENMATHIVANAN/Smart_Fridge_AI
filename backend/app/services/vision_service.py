
import base64
import json
import os
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq
from PIL import Image


# Load backend/.env regardless of the terminal's working directory.
BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
VISION_MODEL = os.getenv(
    "GROQ_VISION_MODEL",
    "qwen/qwen3.8-27b",
).strip()

MAX_IMAGES = 3
MAX_IMAGE_SIDE = 1024
MAX_COMPLETION_TOKENS = 1400

ALLOWED_CATEGORIES = {
    "Vegetable",
    "Fruit",
    "Dairy",
    "Protein",
    "Other",
}

PROMPT = """
You are an ingredient-identification assistant for a smart fridge.

Inspect the supplied fridge photos and identify food ingredients that are
clearly visible. Do not invent ingredients or claim that hidden food is present.
If multiple photos show the same ingredient, list it only once.
Estimate quantities conservatively; users will review and correct them.

Return a single valid JSON object with this exact structure:
{
  "ingredients": [
    {
      "name": "Apple",
      "quantity": 2,
      "unit": "pieces",
      "category": "Fruit",
      "confidence": 0.9
    }
  ]
}

Rules:
- The top-level object must contain an "ingredients" array.
- Every ingredient must include name, quantity, unit, category, confidence.
- quantity must be a positive number.
- confidence must be a number from 0 to 1.
- category must be Vegetable, Fruit, Dairy, Protein, or Other.
- Use "item" when a sensible unit cannot be determined.
- Include only visible ingredients.
- Do not include Markdown fences or explanatory text.
- If no ingredients can be identified, return {"ingredients": []}.
"""


def prepare_image_for_groq(image_bytes: bytes) -> str:
    """Resize and JPEG-encode an already validated image as a data URL."""
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image = image.convert("RGB")
            image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))

            output = BytesIO()
            image.save(
                output,
                format="JPEG",
                quality=82,
                optimize=True,
            )

        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"

    except Exception as exc:
        raise RuntimeError(
            "Could not prepare an uploaded image for vision analysis."
        ) from exc


def detect_ingredients(images: list[bytes]) -> list[dict]:
    """Send fridge images to Groq and return normalized ingredient records."""
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is missing. Add it to backend/.env and restart FastAPI."
        )

    if not images:
        raise RuntimeError("Upload at least one fridge photo.")

    if len(images) > MAX_IMAGES:
        raise RuntimeError("Upload no more than three fridge photos.")

    try:
        client = Groq(
            api_key=GROQ_API_KEY,
            timeout=120.0,
            max_retries=1,
        )

        message_content = [
            {"type": "text", "text": PROMPT}
        ]

        for image_bytes in images:
            image_url = prepare_image_for_groq(image_bytes)
            message_content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": image_url},
                }
            )

        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": message_content,
                }
            ],
            temperature=0,
            max_completion_tokens=MAX_COMPLETION_TOKENS,
            response_format={"type": "json_object"},
        )

    except Exception as exc:
        # Avoid logging or returning the API key.
        status_code = getattr(exc, "status_code", None)

        if status_code == 401:
            raise RuntimeError(
                "Groq rejected the API key. Check GROQ_API_KEY in backend/.env."
            ) from exc

        if status_code == 429:
            raise RuntimeError(
                "Groq rate limit or quota reached. Check your Groq account limits."
            ) from exc

        if status_code is not None:
            raise RuntimeError(
                f"Groq API returned HTTP {status_code}. Check the model name, "
                "API access, and request limits."
            ) from exc

        raise RuntimeError(
            f"Could not complete Groq vision request: {type(exc).__name__}. "
            "Check your internet connection, API key, model availability, "
            "and Groq service limits."
        ) from exc

    if not response.choices:
        raise RuntimeError("Groq returned no completion choices.")

    choice = response.choices[0]
    content = choice.message.content

    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Groq returned an empty ingredient response.")

    if choice.finish_reason == "length":
        raise RuntimeError(
            "Groq stopped before completing the ingredient JSON. "
            "Try one photo or reduce the number of visible items."
        )

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Groq returned invalid JSON at line {exc.lineno}, "
            f"column {exc.colno}. Try again with one photo."
        ) from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("The model response must be a JSON object.")

    raw_ingredients = parsed.get("ingredients")
    if not isinstance(raw_ingredients, list):
        raise RuntimeError(
            'The model response must contain an "ingredients" array.'
        )

    results = []
    seen = set()

    for item in raw_ingredients:
        if not isinstance(item, dict):
            continue

        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            continue

        name = name.strip()[:120]
        key = name.casefold()

        if key in seen:
            continue
        seen.add(key)

        try:
            quantity = float(item.get("quantity", 1))
        except (TypeError, ValueError):
            quantity = 1.0

        if not 0 < quantity <= 10000:
            quantity = 1.0

        try:
            confidence = float(item.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5

        if not 0 <= confidence <= 1:
            confidence = 0.5

        category = item.get("category", "Other")
        if category not in ALLOWED_CATEGORIES:
            category = "Other"

        unit = item.get("unit", "item")
        if not isinstance(unit, str) or not unit.strip():
            unit = "item"

        results.append(
            {
                "name": name,
                "quantity": quantity,
                "unit": unit.strip()[:30],
                "category": category,
                "confidence": round(confidence, 2),
            }
        )

    return results
