
import json
import os
from datetime import date

from groq import Groq


def generate_recipes(
    inventory: list[dict],
    cuisine: str | None = None,
    dietary_preferences: list[str] | None = None,
    excluded_ingredients: list[str] | None = None,
    servings: int = 2,
    max_prep_minutes: int = 45,
) -> list[dict]:
    """
    Generate recipe suggestions using confirmed fridge inventory.

    Ingredients not present in inventory must be identified as missing.
    Expiry dates are planning hints, not proof of food safety.
    """
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.8-27b")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured.")

    if not inventory:
        return []

    client = Groq(api_key=api_key)

    today = date.today().isoformat()

    inventory_json = json.dumps(inventory, ensure_ascii=False)
    preferences_json = json.dumps(
        {
            "cuisine": cuisine or "Any",
            "dietary_preferences": dietary_preferences or [],
            "excluded_ingredients": excluded_ingredients or [],
            "servings": servings,
            "max_prep_minutes": max_prep_minutes,
        },
        ensure_ascii=False,
    )

    prompt = f"""
You are a practical home-cooking assistant.

Today's date: {today}

CONFIRMED INVENTORY:
{inventory_json}

USER PREFERENCES:
{preferences_json}

Generate exactly 3 distinct recipe suggestions when possible.
If there are not enough suitable ingredients, return fewer recipes.

Rules:
1. Use the confirmed inventory as the source of available ingredients.
2. Never claim an ingredient is available unless it appears in inventory.
3. Put every ingredient not in inventory under missing_ingredients.
4. Respect excluded ingredients and dietary preferences.
5. Prefer recipes that use ingredients approaching their recorded expiry dates.
6. An expiry date is only a planning hint. Never claim it proves food is safe.
7. Do not recommend using expired food merely to avoid waste.
8. Keep prep_minutes at or below the requested maximum when possible.
9. Use the requested serving count.
10. Make cooking instructions clear and practical.
11. Do not invent inventory quantities.
12. Return JSON only, with no Markdown or extra text.

Return this JSON structure:
{{
  "recipes": [
    {{
      "title": "Recipe name",
      "description": "Short description",
      "prep_minutes": 25,
      "servings": 2,
      "available_ingredients": ["ingredient from inventory"],
      "missing_ingredients": ["ingredient not in inventory"],
      "uses_expiring_soon": ["inventory ingredient name"],
      "steps": ["Step 1", "Step 2"],
      "disclaimer": "Check food condition and cook safely."
    }}
  ]
}}
"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You generate realistic recipes from supplied inventory. "
                    "Follow the requested JSON structure and food-safety rules."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content

    if not content:
        raise RuntimeError("The AI returned an empty recipe response.")

    try:
        result = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError("The AI returned invalid recipe JSON.") from exc

    recipes = result.get("recipes")

    if not isinstance(recipes, list):
        raise RuntimeError("The AI response did not contain a valid recipes list.")

    return recipes[:3]
