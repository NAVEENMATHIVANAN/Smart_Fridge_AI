
import json
import os
from datetime import date

from groq import Groq


def generate_recipes(
    inventory: list[dict],
    cuisine: str | None = None,
    dietary_preferences: list[str] | None = None,
    excluded_ingredients: list[str] | None = None,
    priority_ingredients: list[str] | None = None,
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
            "priority_ingredients": priority_ingredients or [],
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
6. Give priority_ingredients in USER PREFERENCES extra weight: try to use as many of these ingredients as practical across the suggested recipes.
7. Treat priority_ingredients as a preference, not permission to violate dietary preferences, excluded ingredients, food-safety rules, or the confirmed inventory.
8. An expiry date is only a planning hint. Never claim it proves food is safe.
9. Do not recommend using expired food merely to avoid waste. Never prioritize an item with a recorded expiry date earlier than today.
10. Keep prep_minutes at or below the requested maximum when possible.
11. Use the requested serving count.
12. Make cooking instructions clear and practical.
13. Do not invent inventory quantities.
14. Return JSON only, with no Markdown or extra text.
15. Estimate calories and macronutrients per serving, not for the entire recipe.
16. Return numeric values for calories_kcal, protein_g, carbohydrates_g, and fat_g.
17. Base estimates on the listed ingredients and reasonable portion sizes.
18. State in the disclaimer that nutrition values are estimates and may vary with ingredient quantities and brands.

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
      "calories_kcal": 350,
      "protein_g": 18,
      "carbohydrates_g": 42,
      "fat_g": 12,
      "disclaimer": "Nutrition values are estimates. Check food condition and cook safely."
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
