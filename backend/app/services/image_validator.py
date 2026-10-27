
from io import BytesIO

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from fastapi import HTTPException, UploadFile

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


def validate_image(data: bytes) -> None:
    if not data:
        raise HTTPException(status_code=400, detail="An uploaded image is empty.")

    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Each image must be 8 MB or smaller.",
        )

    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in ALLOWED_FORMATS:
                raise HTTPException(
                    status_code=415,
                    detail="Use JPEG, PNG, or WebP images.",
                )

            width, height = image.size
            if width < 32 or height < 32:
                raise HTTPException(
                    status_code=400,
                    detail="Image dimensions must be at least 32 x 32 pixels.",
                )

            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=413,
                    detail="The image dimensions are too large.",
                )

            image.verify()

    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid supported image.",
        ) from None

    # Independently check that OpenCV can decode the image.
    decoded = cv2.imdecode(
        np.frombuffer(data, dtype=np.uint8),
        cv2.IMREAD_COLOR,
    )

    if decoded is None:
        raise HTTPException(
            status_code=400,
            detail="OpenCV could not decode the uploaded image.",
        )


async def read_validated_image(file: UploadFile) -> bytes:
    data = await file.read(MAX_FILE_BYTES + 1)
    validate_image(data)
    return data
