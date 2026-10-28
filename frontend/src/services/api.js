
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')

async function request(path, options = {}) {
  const headers = { ...options.headers }

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let message = `Request failed: ${response.status}`

    try {
      const body = await response.json()
      message = typeof body.detail === 'string'
        ? body.detail
        : JSON.stringify(body.detail ?? body)
    } catch {
      // Keep the HTTP status message if the response is not JSON.
    }

    throw new Error(message)
  }

  return response.json()
}

export function getHealth() {
  return request('/health')
}

export function getInventory() {
  return request('/api/inventory')
}

export function addInventoryItem(item) {
  return request('/api/inventory', {
    method: 'POST',
    body: JSON.stringify(item),
  })
}

export async function deleteInventoryItem(itemId) {
  const response = await fetch(
    `${API_BASE_URL}/api/inventory/${itemId}`,
    {
      method: 'DELETE',
    },
  )

  if (!response.ok) {
    let message = 'Could not delete inventory item.'

    try {
      const data = await response.json()
      message = data.detail || message
    } catch {
      // Keep the default error message.
    }

    throw new Error(message)
  }

  return response.json()
}



export async function detectIngredients(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 3) {
    throw new Error('Select between 1 and 3 photos before scanning.')
  }

  const formData = new FormData()

  files.forEach((file) => {
    formData.append('files', file)
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 90000)

  try {
    let response

    try {
      response = await fetch(
        `${API_BASE_URL}/api/detect-ingredients`,
        {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        }
      )
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(
          'Detection timed out after 90 seconds. Your photos are still selected. Retry, or use fewer or smaller photos.'
        )
      }

      throw new Error(
        'Cannot connect to the backend. Check that FastAPI is running at ' +
        `${API_BASE_URL}. Your selected photos are still available.`
      )
    }

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const detail =
        typeof data.detail === 'string'
          ? data.detail
          : data.detail
            ? JSON.stringify(data.detail)
            : ''

      if (response.status === 502 || response.status === 503) {
        throw new Error(
          `The AI service is temporarily unavailable. ${detail} Retry in a moment.`
        )
      }

      if (response.status === 413) {
        throw new Error(
          'The photos are too large for the server. Choose smaller images.'
        )
      }

      if (response.status === 422) {
        throw new Error(
          `The photos could not be accepted. Check that you selected 1–3 valid images. ${detail}`
        )
      }

      throw new Error(
        `Detection failed (HTTP ${response.status}). ${detail}`
      )
    }

    return data
  } finally {
    clearTimeout(timeoutId)
  }
}





export async function updateInventoryItem(itemId, updates) {
  const response = await fetch(
    `${API_BASE_URL}/api/inventory/${itemId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  )

  const responseText = await response.text()
  let data = {}

  try {
    data = responseText ? JSON.parse(responseText) : {}
  } catch {
    data = { detail: responseText }
  }

  if (!response.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : JSON.stringify(data.detail || data)

    throw new Error(`HTTP ${response.status}: ${detail}`)
  }

  return data
}



export async function suggestExpiryDate({
  name,
  category = null,
  purchase_date = null,
  storage_notes = null,
}) {
  const response = await fetch(
    `${API_BASE_URL}/api/expiry-suggestion`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        category,
        purchase_date: purchase_date || null,
        storage_notes: storage_notes || null,
      }),
    }
  )

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Could not suggest an expiry date.')
  }

  return data
}
