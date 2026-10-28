
export async function assessImageQuality(file) {
  let bitmap

  try {
    bitmap = await createImageBitmap(file)

    const maxSide = 320
    const scale = Math.min(
      1,
      maxSide / Math.max(bitmap.width, bitmap.height)
    )

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))

    const context = canvas.getContext('2d', {
      willReadFrequently: true,
    })

    if (!context) {
      return {
        ok: true,
        warnings: ['Image quality could not be checked.'],
      }
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const { data, width, height } = context.getImageData(
      0, 0, canvas.width, canvas.height
    )

    const gray = new Float32Array(width * height)
    let total = 0

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const value =
        0.299 * data[i] +
        0.587 * data[i + 1] +
        0.114 * data[i + 2]

      gray[p] = value
      total += value
    }

    const brightness = total / gray.length
    const warnings = []

    if (brightness < 55) {
      warnings.push('This photo is very dark. Turn on the fridge light or improve the lighting.')
    } else if (brightness < 80) {
      warnings.push('This photo looks a little dark. Better lighting may improve detection.')
    }

    // Estimate sharpness from the variance of the Laplacian.
    // This is a heuristic, not a definitive blur detector.
    let sum = 0
    let sumSquares = 0
    let count = 0

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x

        const laplacian =
          gray[i - width] +
          gray[i + width] +
          gray[i - 1] +
          gray[i + 1] -
          4 * gray[i]

        sum += laplacian
        sumSquares += laplacian * laplacian
        count++
      }
    }

    if (count > 0) {
      const mean = sum / count
      const variance = sumSquares / count - mean * mean

      if (variance < 35) {
        warnings.push('This photo may be blurry. Hold the camera steady and retake it if possible.')
      }
    }

    return {
      ok: true,
      warnings,
      brightness: Math.round(brightness),
    }
  } catch {
    return {
      ok: false,
      warnings: ['Could not inspect this image. Try another photo.'],
    }
  } finally {
    bitmap?.close()
  }
}
