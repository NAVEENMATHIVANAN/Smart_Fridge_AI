
export function getFreshness(expiryDate) {
  if (!expiryDate) {
    return {
      label: 'No expiry date',
      status: 'unknown',
    }
  }

  // Compare ISO date strings to avoid UTC date conversion issues.
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  const todayISO = `${year}-${month}-${day}`

  const soon = new Date(year, today.getMonth(), today.getDate() + 3)
  const soonISO =
    `${soon.getFullYear()}-` +
    `${String(soon.getMonth() + 1).padStart(2, '0')}-` +
    `${String(soon.getDate()).padStart(2, '0')}`

  if (expiryDate < todayISO) {
    return { label: 'Expired', status: 'expired' }
  }

  if (expiryDate <= soonISO) {
    return { label: 'Expiring soon', status: 'soon' }
  }

  return { label: 'Fresh', status: 'fresh' }
}
