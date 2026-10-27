
import json
import os
from datetime import date, timedelta

from dotenv import load_dotenv
from groq import Groq

load_dotenv()


DISCLAIMER = (
    "This is an approximate planning suggestion, not a food-safety guarantee. "
    "Follow product labels and official storage guidance. Discard food that "
    "shows signs of spoilage; when in doubt, do not consume it."
)


def suggest_expiry(
    name: str,
    category: str | None = None,
    purchase_date: date | None = None,
    storage_notes: str | None = None,
) -> dict:
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.8-27b")

    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is missing. Configure it in backend/.env."
        )

    today = date.today()
    purchased = purchase_date or today

    if purchased > today:
        raise ValueError("Purchase date cannot be in the future.")

    client = Groq(api_key=api_key)

    prompt = f"""
Estimate a conservative, approximate use-by planning date for this food item.
Do not claim the date guarantees safety. Do not assume refrigeration unless
the storage details say so. If storage conditions are unclear, explain that
the estimate is uncertain and that package labels or authoritative food
storage guidance take priority.

Food name: {name}
Category: {category or "Unknown"}
Purchase date: {purchased.isoformat()}
Storage details: {storage_notes or "Not specified"}
Today's date: {today.isoformat()}

Return only a JSON object with these fields:
{{
  "days_from_purchase": integer between 0 and 365,
  "explanation": "short explanation including uncertainty"
}}

Use a reasonable conservative estimate. If the food type or storage
conditions make a reliable estimate impossible, use 0 days and explain why.
Do not return an expiry date directly.
"""

    try:
        result = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You provide cautious food-storage planning estimates. "
                        "Never represent an estimate as a safety guarantee."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=300,
            response_format={"type": "json_object"},
        )

        content = result.choices[0].message.content
        data = json.loads(content or "{}")
        days = data.get("days_from_purchase")
        explanation = data.get("explanation")

        if isinstance(days, bool) or not isinstance(days, int):
            raise ValueError("AI returned an invalid number of days.")
        if not 0 <= days <= 365:
            raise ValueError("AI returned a date estimate outside the allowed range.")
        if not isinstance(explanation, str) or not explanation.strip():
            raise ValueError("AI returned no explanation.")

        return {
            "suggested_expiry_date": purchased + timedelta(days=days),
            "explanation": explanation.strip(),
            "disclaimer": DISCLAIMER,
        }

    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            "Could not validate the AI expiry suggestion. Please try again "
            "or enter the date manually."
        ) from exc
