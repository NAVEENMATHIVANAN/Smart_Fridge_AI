
import json
import os

from groq import Groq


def generate_storage_guidance(
    ingredient: str,
    question: str | None = None,
    category: str | None = None,
    storage_notes: str | None = None,
) -> dict:
    """
    Generate practical food storage guidance for one ingredient.
    """

    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.8-27b")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured.")

    client = Groq(api_key=api_key)

    context = {
        "ingredient": ingredient,
        "category": category or "Unknown",
        "existing_storage_notes": storage_notes or "None",
        "user_question": question or "Provide general storage guidance.",
    }

    prompt = f"""
You are a practical food storage assistant.

INGREDIENT INFORMATION:
{json.dumps(context, ensure_ascii=False)}

Provide clear and conservative food storage guidance.

Rules:
1. Recommend appropriate storage conditions.
2. Distinguish refrigeration, freezing, and room-temperature storage.
3. Explain preparation before storage.
4. Provide approximate storage duration only when reliable.
5. Mention signs of spoilage where relevant.
6. Do not guarantee food safety based on storage duration alone.
7. Do not assume the food is fresh or safe.
8. If the ingredient is ambiguous, mention the uncertainty.
9. Answer the user's question directly.
10. Return valid JSON only.

Return this structure:
{{
    "ingredient": "Ingredient name",
    "storage_method": "Recommended storage method",
    "temperature": "Recommended temperature or range",
    "preparation": [
        "Preparation instruction"
    ],
    "storage_duration": "Approximate duration with conditions",
    "freezing_guidance": "Freezing instructions",
    "spoilage_signs": [
        "Relevant warning signs"
    ],
    "additional_tips": [
        "Useful storage tips"
    ],
    "answer": "Direct answer to the user's question",
    "disclaimer": "Storage duration is approximate. Check food condition before consumption."
}}
"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You provide practical food storage guidance. "
                    "Never present approximate storage durations as "
                    "guarantees of food safety."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content

    if not content:
        raise RuntimeError("The AI returned an empty storage response.")

    try:
        result = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            "The AI returned invalid storage guidance JSON."
        ) from exc

    required_fields = [
        "ingredient",
        "storage_method",
        "temperature",
        "preparation",
        "storage_duration",
        "freezing_guidance",
        "spoilage_signs",
        "additional_tips",
        "answer",
        "disclaimer",
    ]

    for field in required_fields:
        if field not in result:
            raise RuntimeError(
                f"The AI storage response is missing: {field}"
            )

    return result
