import json
import os
import time
from datetime import date
from groq import Groq


def generate_weekly_meal_plan(
    inventory: list[dict],
    dietary_preferences: list[str] | None = None,
    excluded_ingredients: list[str] | None = None,
    priority_ingredients: list[str] | None = None,
    servings: int = 2,
    max_prep_minutes: int = 45,
    existing_plan: list[dict] | None = None,
    target_day: str | None = None,
    target_meal: str | None = None,
) -> list[dict]:
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.8-27b")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured.")
    if not inventory:
        return []

    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    slots = ["Breakfast", "Lunch", "Dinner"]
    # Handle transient API failures and occasional malformed model responses
    # in one predictable retry loop instead of failing on the first attempt.
    client = Groq(api_key=api_key, max_retries=0, timeout=60.0)
    context = {
        "today": date.today().isoformat(),
        "inventory": inventory,
        "dietary_preferences": dietary_preferences or [],
        "excluded_ingredients": excluded_ingredients or [],
        "priority_ingredients": priority_ingredients or [],
        "servings": servings,
        "max_prep_minutes": max_prep_minutes,
        "days": days,
        "meal_slots": slots,
        "existing_plan": existing_plan or [],
        "target_day": target_day,
        "target_meal": target_meal,
    }
    if target_day and target_meal:
        task = f"Regenerate only {target_meal} for {target_day}. Return exactly one meal object in the meals array. Do not change any other meal."
    else:
        task = "Create a complete seven-day plan: exactly 21 meals, one breakfast, lunch, and dinner for each day. Avoid repeating the same dish."
    prompt = f"""
You are a practical home meal-planning assistant. Return JSON only.
Planning context:
{json.dumps(context, ensure_ascii=False)}

Task: {task}
Rules:
- Available ingredients must come only from confirmed inventory.
- Any ingredient not in inventory must be in missing_ingredients.
- Respect dietary preferences and excluded ingredients strictly.
- Prefer priority_ingredients across the week where practical, but never use expired inventory or compromise food safety.
- Recorded expiry dates are planning hints, not proof of safety. Do not recommend food whose recorded expiry date is before today.
- Keep prep_minutes at or below max_prep_minutes when practical, and use the requested servings.
- Vary meals across the week. Use realistic home cooking and concise practical steps.
- Include day as one of Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- meal_slot must be Breakfast, Lunch, or Dinner.
- Each meal object: day, meal_slot, title, description, prep_minutes, servings, available_ingredients (array), missing_ingredients (array), steps (array).
- When regenerating one meal, return only the requested day and meal_slot.
Return shape: {{"meals":[{{"day":"Monday","meal_slot":"Breakfast","title":"...","description":"...","prep_minutes":20,"servings":2,"available_ingredients":[],"missing_ingredients":[],"steps":[]}}]}}
"""
    last_error = None

    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Create realistic meal plans from confirmed inventory. "
                            "Follow the exact JSON format and food-safety rules."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.25,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            data = json.loads(content or "")
            meals = data.get("meals")

            if not isinstance(meals, list):
                raise ValueError("The AI response did not contain a valid meals list.")

            valid = []
            for meal in meals:
                if not isinstance(meal, dict):
                    continue
                if meal.get("day") not in days or meal.get("meal_slot") not in slots:
                    continue
                if not isinstance(meal.get("title"), str) or not meal["title"].strip():
                    continue

                for key in ("available_ingredients", "missing_ingredients", "steps"):
                    if not isinstance(meal.get(key), list):
                        meal[key] = []

                valid.append(meal)

            if target_day and target_meal:
                # Never accept a different day/slot as the replacement.
                matching = [
                    meal for meal in valid
                    if meal.get("day") == target_day
                    and meal.get("meal_slot") == target_meal
                ]
                if not matching:
                    raise ValueError(
                        f"The AI did not return a valid meal for {target_day} {target_meal}."
                    )
                return [matching[0]]

            if not valid:
                raise ValueError("The AI did not return any valid meals.")

            return valid[:21]

        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))

    if target_day and target_meal:
        raise RuntimeError(
            f"Could not regenerate {target_day} {target_meal} after 3 attempts. "
            "Your existing meal has been kept. Please try again."
        ) from last_error

    raise RuntimeError(
        "Could not generate the meal plan after 3 attempts. Please try again."
    ) from last_error
