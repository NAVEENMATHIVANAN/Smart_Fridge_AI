
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
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
