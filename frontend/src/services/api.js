
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

export function detectIngredients(files) {
  const formData = new FormData()

  files.forEach((file) => formData.append('files', file))

  return request('/api/detect-ingredients', {
    method: 'POST',
    body: formData,
  })
}
