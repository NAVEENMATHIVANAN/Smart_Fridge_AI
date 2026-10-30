
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addInventoryItem,
  deleteInventoryItem,
  detectIngredients,
  getHealth,
  getInventory,
  updateInventoryItem,
  suggestExpiryDate,
  getStorageGuidance,
} from './services/api'

import { getFreshness } from './utils/freshness'
import { assessImageQuality } from './utils/imageQuality'
import RecipeSuggestions from './components/RecipeSuggestions'
import WeeklyMealPlanner from './components/WeeklyMealPlanner'

const initialForm = {
  name: '',
  quantity: '1',
  unit: 'pieces',
  category: 'Vegetable',
  purchase_date: '',
  expiry_date: '',
  storage_notes: '',
}

const categories = ['Fruit', 'Vegetable', 'Dairy', 'Protein', 'Juices', 'Other']

function getStockStatus(quantity) {
  const value = Number(quantity)
  if (!Number.isFinite(value) || value < 0) return { label: 'Check quantity', className: 'bg-gray-100 text-gray-700' }
  if (value === 0) return { label: 'Empty', className: 'bg-red-100 text-red-800' }
  if (value <= 1) return { label: 'Low stock', className: 'bg-amber-100 text-amber-900' }
  return { label: 'In stock', className: 'bg-emerald-100 text-emerald-800' }
}

function App() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(initialForm)
  const [photos, setPhotos] = useState([])
  const [health, setHealth] = useState('checking')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const fileInput = useRef(null)
  const photoUrls = useRef(new Set())
  
  const videoRef = useRef(null)
  const cameraStreamRef = useRef(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraMessage, setCameraMessage] = useState('') 

  const [detected, setDetected] = useState([])
  const [detecting, setDetecting] = useState(false)
  const [suggestingExpiry, setSuggestingExpiry] = useState(false)
  const [suggestionExplanation, setSuggestionExplanation] = useState('')
  const [editingItems, setEditingItems] = useState({})
  const [stockFilter, setStockFilter] = useState('all')
  const [expandedCategories, setExpandedCategories] = useState({})
  const [expandedItems, setExpandedItems] = useState({})
  const [selectedStorageItems, setSelectedStorageItems] = useState([])
  const [storageGuidance, setStorageGuidance] = useState({})
  const [loadingStorageGuidance, setLoadingStorageGuidance] = useState(false)
  const [foodPriorities, setFoodPriorities] = useState(null)
  const [analyzingFoodPriorities, setAnalyzingFoodPriorities] = useState(false)
  const [activeView, setActiveView] = useState('inventory')
  const [shoppingList, setShoppingList] = useState(() => {
    try {
      const saved = localStorage.getItem('freshspace-shopping-list')
      const parsed = saved ? JSON.parse(saved) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [newShoppingItem, setNewShoppingItem] = useState('')
  const [shoppingNotice, setShoppingNotice] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem('freshspace-shopping-list', JSON.stringify(shoppingList))
    } catch {
      // Keep the current in-memory list if browser storage is unavailable.
    }
  }, [shoppingList])

  function addShoppingItems(names) {
    const cleanNames = [...new Set(
      (Array.isArray(names) ? names : [])
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .map((name) => name.slice(0, 120))
    )]

    if (cleanNames.length === 0) {
      setShoppingNotice('This recipe has no missing ingredients to add.')
      return
    }

    const existingNames = new Set(
      shoppingList.map((item) => item.name.toLocaleLowerCase())
    )
    const additions = cleanNames
      .filter((name) => !existingNames.has(name.toLocaleLowerCase()))
      .map((name) => ({
        id: name.toLocaleLowerCase(),
        name,
        purchased: false,
      }))

    if (additions.length > 0) {
      setShoppingList((current) => {
        const currentNames = new Set(current.map((item) => item.name.toLocaleLowerCase()))
        const freshAdditions = additions.filter(
          (item) => !currentNames.has(item.name.toLocaleLowerCase())
        )
        return [...current, ...freshAdditions]
      })
    }
    setShoppingNotice(
      additions.length > 0
        ? `Added ${additions.length} new item(s). Existing items were not duplicated.`
        : 'Those ingredients are already on your shopping list.'
    )
  }

  function addManualShoppingItem(event) {
    event.preventDefault()
    const name = newShoppingItem.trim()
    if (!name) return
    addShoppingItems([name])
    setNewShoppingItem('')
  }

  function toggleShoppingItem(itemId) {
    setShoppingList((current) =>
      current.map((item) => item.id === itemId
        ? { ...item, purchased: !item.purchased }
        : item)
    )
  }

  function removeShoppingItem(itemId) {
    setShoppingList((current) => current.filter((item) => item.id !== itemId))
  }

  function clearPurchasedItems() {
    setShoppingList((current) => current.filter((item) => !item.purchased))
    setShoppingNotice('Purchased items were cleared from the list.')
  }

  async function copyShoppingList() {
    const text = shoppingList
      .map((item) => `${item.purchased ? '[x]' : '[ ]'} ${item.name}`)
      .join('\\n')

    if (!text) {
      setShoppingNotice('Your shopping list is empty.')
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setShoppingNotice('Shopping list copied to clipboard.')
    } catch {
      setShoppingNotice('Clipboard access is unavailable. You can still select and copy the list.')
    }
  }

  async function refreshInventory() {
    const data = await getInventory()
    setItems(data)
  }

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [status, inventory] = await Promise.all([
          getHealth(),
          getInventory(),
        ])
        if (active) {
          setHealth(status.status === 'ok' ? 'connected' : 'offline')
          setItems(inventory)
        }
      } catch {
        if (active) {
          setHealth('offline')
          setError('Cannot connect to FastAPI. Check that the backend is running.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [])

  const totalQuantity = useMemo(
    () => items.reduce((total, item) => total + Number(item.quantity || 0), 0),
    [items],
  )

  const categoryCount = new Set(items.map((item) => item.category).filter(Boolean)).size

  const filteredItems = items.filter((item) => {
    const status = getStockStatus(item.quantity).label
    if (stockFilter === 'low') return status === 'Low stock'
    if (stockFilter === 'empty') return status === 'Empty'
    return true
  })

  const categoryOrder = ['Fruit', 'Vegetable', 'Dairy', 'Protein', 'Juices', 'Other', 'Uncategorized']
  const groupedItems = categoryOrder.map((category) => ({
    category,
    items: filteredItems.filter((item) => (item.category || 'Uncategorized') === category),
  }))


  
const expiryAlerts = useMemo(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const threeDaysFromNow = new Date(today)
  threeDaysFromNow.setDate(today.getDate() + 3)

  return items.reduce(
    (result, item) => {
      if (!item.expiry_date) return result

      const expiryDate = new Date(`${item.expiry_date}T00:00:00`)

      if (Number.isNaN(expiryDate.getTime())) return result

      if (expiryDate < today) {
        result.expired.push(item)
      } else if (expiryDate <= threeDaysFromNow) {
        result.expiringSoon.push(item)
      } else {
        result.fresh.push(item)
      }

      return result
    },
    {
      expired: [],
      expiringSoon: [],
      fresh: [],
    }
  )
}, [items])

  async function analyzeFoodPriorities() {
    if (items.length === 0) {
      setNotice('Add ingredients to your inventory before checking food priorities.')
      return
    }

    setAnalyzingFoodPriorities(true)
    setError('')
    setNotice('')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const results = []

    try {
      for (const item of items) {
        let expiryDate = item.expiry_date || null
        let source = 'Recorded expiry date'
        let explanation = ''

        if (!expiryDate) {
          try {
            const suggestion = await suggestExpiryDate({
              name: item.name,
              category: item.category || null,
              purchase_date: item.purchase_date || null,
              storage_notes: item.storage_notes || null,
            })
            expiryDate = suggestion.suggested_expiry_date || null
            source = 'AI estimate — expiry date not recorded'
            explanation = suggestion.explanation || ''
          } catch (err) {
            results.push({
              ...item,
              priority: 'unknown',
              priorityLabel: 'Needs review',
              priorityNote: `Could not estimate an expiry date: ${err.message}`,
              source: 'No recorded expiry date',
            })
            continue
          }
        }

        const parsedExpiry = expiryDate ? new Date(`${expiryDate}T00:00:00`) : null
        if (!parsedExpiry || Number.isNaN(parsedExpiry.getTime())) {
          results.push({ ...item, priority: 'unknown', priorityLabel: 'Needs review', priorityNote: 'No reliable expiry date is available.', source })
          continue
        }

        const daysRemaining = Math.ceil((parsedExpiry - today) / 86400000)
        const priority = daysRemaining < 0 ? 'expired' : daysRemaining <= 3 ? 'urgent' : daysRemaining <= 7 ? 'soon' : 'later'
        const priorityLabel = priority === 'expired' ? 'Past estimated/recorded expiry' : priority === 'urgent' ? 'Use first' : priority === 'soon' ? 'Use soon' : 'Use later'
        results.push({
          ...item,
          priority,
          priorityLabel,
          daysRemaining,
          priorityExpiry: expiryDate,
          source,
          priorityNote: explanation,
        })
      }

      const order = { expired: 0, urgent: 1, soon: 2, later: 3, unknown: 4 }
      results.sort((a, b) => order[a.priority] - order[b.priority] || (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))
      setFoodPriorities(results)
      setNotice('Food-use priorities are ready. AI-estimated dates are suggestions, not confirmed expiry dates.')
    } finally {
      setAnalyzingFoodPriorities(false)
    }
  }


  async function handleAdd(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!form.name.trim()) {
      setError('Enter an ingredient name.')
      return
    }

    const quantity = Number(form.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('Quantity cannot be negative.')
      return
    }

    setSaving(true)
    try {
      const created = await addInventoryItem({
        name: form.name.trim(),
        quantity,
        unit: form.unit,
        category: form.category,
        purchase_date: form.purchase_date || null,
        expiry_date: form.expiry_date || null,
        storage_notes: form.storage_notes.trim() || null,
      })
      setItems((current) => [...current, created])
      setForm(initialForm)
      setNotice(`${created.name} was saved to your inventory.`)
    } catch (err) {
      setError(`Could not save ingredient. ${err.message}`)
    } finally {
      setSaving(false)
    }
  }


  async function handleSuggestExpiry() {
    if (!form.name.trim()) {
      setError('Enter an ingredient name before requesting an expiry suggestion.')
      return
    }

    setError('')
    setNotice('')
    setSuggestionExplanation('')
    setSuggestingExpiry(true)

    try {
      const result = await suggestExpiryDate({
        name: form.name.trim(),
        category: form.category,
        purchase_date: form.purchase_date || null,
        storage_notes: form.storage_notes.trim() || null,
      })

      setForm((current) => ({
        ...current,
        expiry_date: result.suggested_expiry_date,
      }))
      setSuggestionExplanation(
        `${result.explanation} ${result.disclaimer}`,
      )
    } catch (err) {
      setError(`Could not suggest an expiry date. ${err.message}`)
    } finally {
      setSuggestingExpiry(false)
    }
  }

  function changeItemField(itemId, field, value) {
    setEditingItems((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {}),
        [field]: value,
      },
    }))
  }

  function toggleStorageItem(itemId) {
    setSelectedStorageItems((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    )
  }

  function selectAllStorageItems() {
    setSelectedStorageItems(items.map((item) => item.id))
  }

  async function handleGetStorageGuidance() {
    const selected = items.filter((item) => selectedStorageItems.includes(item.id))
    if (selected.length === 0) {
      setError('Select at least one inventory item for storage guidance.')
      return
    }

    setError('')
    setNotice('')
    setLoadingStorageGuidance(true)

    const results = await Promise.allSettled(
      selected.map((item) => getStorageGuidance({
        ingredient: item.name,
        category: item.category || null,
        storage_notes: item.storage_notes || null,
      })),
    )

    const nextGuidance = {}
    const failures = []
    results.forEach((result, index) => {
      const item = selected[index]
      if (result.status === 'fulfilled') {
        nextGuidance[item.id] = result.value
      } else {
        failures.push(`${item.name}: ${result.reason?.message || 'Request failed'}`)
      }
    })

    setStorageGuidance((current) => ({ ...current, ...nextGuidance }))
    setSelectedStorageItems([])
    setLoadingStorageGuidance(false)

    if (failures.length) {
      setError(`Guidance could not be generated for: ${failures.join('; ')}`)
    }
    if (Object.keys(nextGuidance).length) {
      setNotice(`Generated storage guidance for ${Object.keys(nextGuidance).length} item(s).`)
    }
  }

  async function saveItemChanges(item) {
    const changes = editingItems[item.id] || {}
    setError('')
    setNotice('')

    try {
      const quantity = Number(changes.quantity !== undefined ? changes.quantity : item.quantity)
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw new Error('Quantity must be a valid number greater than or equal to zero.')
      }
      const updated = await updateInventoryItem(item.id, {
        name: (changes.name !== undefined ? changes.name : item.name).trim(),
        quantity,
        unit: changes.unit !== undefined ? changes.unit : item.unit,
        category: changes.category !== undefined ? changes.category || null : item.category || null,
        purchase_date: changes.purchase_date !== undefined
          ? changes.purchase_date || null
          : item.purchase_date || null,
        expiry_date: changes.expiry_date !== undefined
          ? changes.expiry_date || null
          : item.expiry_date || null,
        storage_notes: changes.storage_notes !== undefined
          ? changes.storage_notes || null
          : item.storage_notes || null,
      })

      setItems((current) =>
        current.map((existing) => existing.id === item.id ? updated : existing),
      )
      setEditingItems((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      setNotice(`Inventory details updated for ${updated.name}.`)
    } catch (err) {
      setError(`Could not update ${item.name}. ${err.message}`)
    }
  }

async function handleDelete(item) {
  const confirmed = window.confirm(
    `Delete "${item.name}" from your inventory?`,
  )

  if (!confirmed) return

  setError('')
  setNotice('')

  try {
    await deleteInventoryItem(item.id)

    setItems((current) =>
      current.filter((existing) => existing.id !== item.id),
    )

    setNotice(`${item.name} was deleted from your inventory.`)
  } catch (err) {
    setError(`Could not delete ${item.name}. ${err.message}`)
  }
}


async function handleDetect() {
  setError('')
  setNotice('')
  setDetected([])

  if (photos.length === 0) {
    setError('Choose at least one fridge photo first.')
    return
  }

  setDetecting(true)

  try {
    // Check photo quality before sending images to the AI.
    const qualityResults = await Promise.all(
      photos.map(({ file }) => assessImageQuality(file))
    )

    const qualityWarnings = qualityResults.flatMap((result, index) =>
      result.warnings.map(
        (warning) => `Photo ${index + 1}: ${warning}`
      )
    )

    if (qualityWarnings.length > 0) {
      setCameraMessage(qualityWarnings.join(' '))
    } else {
      setCameraMessage('')
    }

    // Continue detection even when quality warnings are present.
    const result = await detectIngredients(
      photos.map((photo) => photo.file),
    )

    const ingredients = Array.isArray(result.ingredients)
      ? result.ingredients
      : []

    if (ingredients.length === 0) {
      setDetected([])
      setNotice(
        'No ingredients were detected. Try clearer, well-lit photos showing the fridge contents.'
      )
      return
    }

    setDetected(
      ingredients.map((item, index) => ({
        ...item,
        reviewId: `${item.name}-${index}`,
        quantity: String(item.quantity),
        purchase_date: '',
        expiry_date: '',
        storage_notes: '',
        confirmed: true,
      })),
    )

    setNotice(
      `Analyzed ${result.image_count} photo(s). Review the candidates below.`
    )
  } catch (err) {
  setError(`Ingredient detection failed: ${err.message}`)
  setNotice('Your selected photos have been kept. You can retry detection.')
  } finally {
    setDetecting(false)
  }
}


function updateDetected(reviewId, field, value) {
  setDetected((current) =>
    current.map((item) =>
      item.reviewId === reviewId
        ? { ...item, [field]: value }
        : item,
    ),
  )
}

async function saveDetected() {
  const selected = detected.filter((item) => item.confirmed)

  if (selected.length === 0) {
    setError('Select at least one ingredient to save.')
    return
  }

  setSaving(true)
  setError('')
  setNotice('')

  try {
    const saved = []

    for (const item of selected) {
      const quantity = Number(item.quantity)

      if (!item.name.trim() || !Number.isFinite(quantity) || quantity < 0) {
        throw new Error('Each selected item needs a name and a non-negative quantity.')
      }

      const created = await addInventoryItem({
        name: item.name.trim(),
        quantity,
        unit: item.unit,
        category: item.category,
        purchase_date: item.purchase_date || null,
        expiry_date: item.expiry_date || null,
        storage_notes: item.storage_notes?.trim() || null,
      })

      saved.push(created)
    }

    setItems((current) => [...current, ...saved])
    setDetected([])
    setNotice(`Saved ${saved.length} confirmed ingredient(s) to inventory.`)
  } catch (err) {
    // Reload because earlier items may already have been saved.
    try {
      await refreshInventory()
    } catch {
      // Preserve the original error.
    }

    setError(`Could not finish saving all ingredients: ${err.message}`)
  } finally {
    setSaving(false)
  }
  }

  
function handlePhotos(event) {
  const selected = Array.from(event.target.files || [])
  const valid = selected.filter((file) => file.type.startsWith('image/'))

  if (valid.length !== selected.length) {
    setError('Only image files can be selected.')
  } else {
    setError('')
  }

  setPhotos((current) => {
    const combined = [
      ...current.map((photo) => photo.file),
      ...valid,
    ].slice(0, 3)

    return combined.map((file) => {
      const existing = current.find(
        (photo) =>
          photo.file.name === file.name &&
          photo.file.lastModified === file.lastModified &&
          photo.file.size === file.size,
      )

      if (existing) return existing

      const url = URL.createObjectURL(file)
      photoUrls.current.add(url)

      return {
        file,
        url,
        id: `${file.name}-${file.lastModified}-${file.size}`,
      }
    })
  })

  event.target.value = ''
}

function removePhoto(id) {
  setPhotos((current) => {
    const removed = current.find((photo) => photo.id === id)

    if (removed) {
      URL.revokeObjectURL(removed.url)
      photoUrls.current.delete(removed.url)
    }

    return current.filter((photo) => photo.id !== id)
  })
}


  useEffect(() => {
  return () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())

    photoUrls.current.forEach((url) => URL.revokeObjectURL(url))
    photoUrls.current.clear()
  }
}, [])



async function startCamera() {
  setError('')
  setCameraMessage('Requesting camera access…')

  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraMessage(
      'Camera access is unavailable. Open the app on localhost or HTTPS, or upload a photo instead.'
    )
    return
  }

  try {
    // Stop any previous stream before opening a new one.
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())

    const video = videoRef.current

if (!video) {
  throw new Error(
    'Camera preview element is missing. Please refresh the page and retry.'
  )
}

const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
})

cameraStreamRef.current = stream
video.srcObject = stream

    if (!video) {
      stream.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
      throw new Error('Camera preview element is not available.')
    }

    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    video.autoplay = true

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Camera started, but no video frame arrived.'))
      }, 10000)

      function cleanup() {
        clearTimeout(timeout)
        video.removeEventListener('loadeddata', onLoaded)
        video.removeEventListener('error', onError)
      }

      function onLoaded() {
        cleanup()
        resolve()
      }

      function onError() {
        cleanup()
        reject(new Error('The browser could not display the camera stream.'))
      }

      video.addEventListener('loadeddata', onLoaded, { once: true })
      video.addEventListener('error', onError, { once: true })

      // Handle a stream that already delivered a frame.
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        cleanup()
        resolve()
      }
    })

    await video.play()

    setCameraActive(true)
    setCameraMessage('Camera ready. Position your fridge contents and capture a photo.')
  } catch (err) {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null

    const message =
      err.name === 'NotAllowedError' || err.name === 'SecurityError'
        ? 'Camera permission was denied. Allow camera access in browser settings.'
        : err.name === 'NotFoundError'
          ? 'No camera was found. Upload a photo instead.'
          : err.name === 'NotReadableError'
            ? 'The camera may be in use by another app. Close other camera apps and retry.'
            : err.message || 'Could not start the camera.'

    setCameraActive(false)
    setCameraMessage(`${message} You can still upload photos.`)
  }
}

function stopCamera() {
  if (cameraStreamRef.current) {
    cameraStreamRef.current.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
  }

  if (videoRef.current) {
    videoRef.current.srcObject = null
  }

  setCameraActive(false)
  setCameraMessage('Camera stopped. You can reopen it or upload photos.')
}

function capturePhoto() {
  const video = videoRef.current

  if (!video || video.readyState < 2 || !video.videoWidth) {
    setCameraMessage('Camera is not ready. Wait for the live preview and try again.')
    return
  }

  if (photos.length >= 3) {
    setCameraMessage('Maximum three photos allowed. Remove a photo before capturing another.')
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const context = canvas.getContext('2d')

  if (!context) {
    setCameraMessage('Unable to capture the photo. Please try again.')
    return
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height)

  canvas.toBlob((blob) => {
    if (!blob) {
      setCameraMessage('Photo capture failed. Please try again.')
      return
    }

    const file = new File(
      [blob],
      `fridge-${Date.now()}.jpg`,
      { type: 'image/jpeg' }
    )

    const url = URL.createObjectURL(file)
    const id = `${file.name}-${file.size}`

    photoUrls.current.add(url)

    setPhotos((current) => {
      if (current.length >= 3) {
        URL.revokeObjectURL(url)
        photoUrls.current.delete(url)
        return current
      }

      return [...current, { file, url, id }]
    })

    setCameraMessage('Photo captured successfully. Review it below.')
  }, 'image/jpeg', 0.92)
}


  return (
    <main className="min-h-screen bg-[#f6f8f5] text-[#203129]">
      <header className="border-b border-[#e4eae2] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <a href="#" className="flex items-center gap-3 no-underline">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e3f3e6] text-2xl">
              🥬
            </span>
            <span>
              <span className="block text-lg font-bold tracking-tight">FreshSpace</span>
              <span className="block text-xs text-[#78877c]">Your intelligent fridge</span>
            </span>
          </a>
          <div className="flex items-center gap-2 rounded-full border border-[#e4eae2] px-3 py-2 text-xs font-medium">
            <span className={`h-2 w-2 rounded-full ${health === 'connected' ? 'bg-emerald-500' : health === 'checking' ? 'bg-amber-400' : 'bg-red-500'}`} />
            {health === 'connected' ? 'Backend connected' : health === 'checking' ? 'Connecting…' : 'Backend offline'}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
        <section className="mb-9 grid gap-7 overflow-hidden rounded-3xl bg-[#173e30] p-7 text-white md:grid-cols-[1.5fr_1fr] md:p-10">
          <div className="flex flex-col items-start justify-center">
            <span className="mb-4 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-[#c9e9cf]">
              YOUR KITCHEN, SIMPLIFIED
            </span>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
              Know what’s fresh. Waste less.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[#d3e4d8] md:text-base">
              Organize your ingredients, scan your fridge, and discover recipes inspired by your saved inventory and cuisines around the world.
            </p>
            <button
              onClick={() => { setActiveView('inventory'); setTimeout(() => document.getElementById('photo-upload')?.scrollIntoView({ behavior: 'smooth' }), 0) }}
              className="mt-6 rounded-xl bg-[#d3edb9] px-5 py-3 text-sm font-semibold text-[#173e30] hover:bg-white"
            >
              Scan my fridge <span aria-hidden="true">↗</span>
            </button>
          </div>
          <div className="grid min-h-52 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] p-5">
            <div className="text-center">
              <div className="text-7xl" aria-hidden="true">🥦 🥑</div>
              <p className="mt-4 text-sm text-[#d3e4d8]">A little more organized, a little less waste.</p>
            </div>
          </div>
          

        </section>

        <nav aria-label="Dashboard views" className="mb-7 flex flex-wrap gap-2 rounded-2xl border border-[#e4eae2] bg-white p-2">
          <button type="button" onClick={() => setActiveView('inventory')} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeView === 'inventory' ? 'bg-[#245c43] text-white' : 'text-[#536459] hover:bg-[#f1f6ef]'}`}>
            🧺 Inventory
          </button>
          <button type="button" onClick={() => setActiveView('recipes')} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeView === 'recipes' ? 'bg-[#245c43] text-white' : 'text-[#536459] hover:bg-[#f1f6ef]'}`}>
            🍲 Recipe ideas
          </button>
          <button type="button" onClick={() => setActiveView('planner')} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeView === 'planner' ? 'bg-[#245c43] text-white' : 'text-[#536459] hover:bg-[#f1f6ef]'}`}>
            📅 Weekly planner
          </button>
          <button type="button" onClick={() => { setActiveView('inventory'); setTimeout(() => document.getElementById('photo-upload')?.scrollIntoView({ behavior: 'smooth' }), 0) }} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#536459] transition hover:bg-[#f1f6ef]">
            📷 Scan fridge
          </button>
        </nav>

        {error && (
          <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss error">✕</button>
          </div>
        )}
        {notice && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        
{detected.length > 0 && (
  <section className="mb-9 rounded-2xl border border-[#dce5da] bg-white p-5 md:p-7">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">
          Review detected ingredients
        </h2>
        <p className="mt-1 text-sm text-[#78877c]">
          Check the names and quantities before saving them to your inventory.
        </p>
      </div>
      <span className="rounded-full bg-[#e3f3e6] px-3 py-1.5 text-sm font-medium text-[#245c43]">
        {detected.filter((item) => item.confirmed).length} selected
      </span>
    </div>

    <div className="space-y-4">
      {detected.map((item) => (
        <div
          key={item.reviewId}
          className="rounded-xl border border-[#e4eae2] bg-[#f8faf6] p-4"
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={item.confirmed}
              onChange={(event) =>
                updateDetected(item.reviewId, "confirmed", event.target.checked)
              }
              aria-label={`Select ${item.name} to save`}
              className="mt-2 h-4 w-4 accent-emerald-700"
            />

            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Ingredient name
                <input
                  value={item.name}
                  onChange={(event) =>
                    updateDetected(item.reviewId, "name", event.target.value)
                  }
                  maxLength={120}
                  className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5"
                />
              </label>

              <label className="text-sm">
                Category
                <select
                  value={item.category}
                  onChange={(event) =>
                    updateDetected(item.reviewId, "category", event.target.value)
                  }
                  className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                Quantity
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={item.quantity}
                  onChange={(event) =>
                    updateDetected(item.reviewId, "quantity", event.target.value)
                  }
                  className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5"
                />
              </label>

              <label className="text-sm">
                Unit
                <input
                  value={item.unit}
                  onChange={(event) =>
                    updateDetected(item.reviewId, "unit", event.target.value)
                  }
                  maxLength={30}
                  className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5"
                />
              </label>

              <label className="text-sm">
                Purchase date
                <input
                  type="date"
                  value={item.purchase_date || ''}
                  onChange={(event) => updateDetected(item.reviewId, 'purchase_date', event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5"
                />
              </label>

              <label className="text-sm">
                Expiry date
                <input
                  type="date"
                  value={item.expiry_date || ''}
                  onChange={(event) => updateDetected(item.reviewId, 'expiry_date', event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5"
                />
              </label>

              <label className="text-sm sm:col-span-2">
                Storage notes
                <input
                  value={item.storage_notes || ''}
                  onChange={(event) => updateDetected(item.reviewId, 'storage_notes', event.target.value)}
                  maxLength={500}
                  placeholder="e.g. Keep refrigerated"
                  className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() =>
                setDetected((current) =>
                  current.filter((entry) => entry.reviewId !== item.reviewId)
                )
              }
              aria-label={`Remove ${item.name}`}
              className="rounded-lg px-2 py-1 text-lg text-red-600 hover:bg-red-50"
            >
              ×
            </button>
          </div>

          {typeof item.confidence === "number" && (
            <p className="mt-3 pl-7 text-xs text-[#78877c]">
              AI confidence: {Math.round(item.confidence * 100)}%
            </p>
          )}
        </div>
      ))}
    </div>

    <button
      type="button"
      onClick={saveDetected}
      disabled={saving || !detected.some((item) => item.confirmed)}
      className="mt-5 w-full rounded-xl bg-[#245c43] px-4 py-3 font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving
        ? "Saving ingredients…"
        : `Save ${detected.filter((item) => item.confirmed).length} selected ingredient(s)`}
    </button>
  </section>
)}


        {activeView === 'inventory' && (
        <>
        <section className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'Inventory items', value: loading ? '…' : items.length, icon: '🧺' },
            { label: 'Total quantity', value: loading ? '…' : totalQuantity, icon: '📦' },
            { label: 'Categories', value: loading ? '…' : categoryCount, icon: '🌱' },
          ].map((stat) => (
            <article key={stat.label} className="rounded-2xl border border-[#e4eae2] bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#78877c]">{stat.label}</span>
                <span className="text-xl">{stat.icon}</span>
              </div>
              <p className="mt-3 text-3xl font-semibold">{stat.value}</p>
            </article>
          ))}

          
<section className="mb-9 rounded-2xl border border-[#e4eae2] bg-white p-5 md:p-7">
  <div className="mb-5">
    <h2 className="text-xl font-semibold">Freshness overview</h2>
    <p className="mt-1 text-sm text-[#78877c]">
      Monitor ingredients using their recorded expiry dates.
    </p>
  </div>

  <div className="grid gap-3 sm:grid-cols-3">
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">Expired</p>
      <p className="mt-2 text-3xl font-bold text-red-900">
        {expiryAlerts.expired.length}
      </p>
    </div>

    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800">Expiring soon</p>
      <p className="mt-2 text-3xl font-bold text-amber-900">
        {expiryAlerts.expiringSoon.length}
      </p>
    </div>

    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-medium text-emerald-800">Fresh</p>
      <p className="mt-2 text-3xl font-bold text-emerald-900">
        {expiryAlerts.fresh.length}
      </p>
    </div>
  </div>

  {(expiryAlerts.expired.length > 0 ||
    expiryAlerts.expiringSoon.length > 0) && (
    <div className="mt-5 space-y-3">
      {expiryAlerts.expired.map((item) => (
        <div
          key={`expired-${item.id}`}
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          <strong>{item.name}</strong> — recorded expiry date has passed.
          Check its condition and discard it if unsafe.
        </div>
      ))}

      {expiryAlerts.expiringSoon.map((item) => (
        <div
          key={`soon-${item.id}`}
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          <strong>{item.name}</strong> — approaching its recorded expiry date.
        </div>
      ))}
    </div>
  )}

  {expiryAlerts.expired.length === 0 &&
    expiryAlerts.expiringSoon.length === 0 && (
      <p className="mt-4 text-sm text-emerald-700">
        No recorded expiry alerts right now.
      </p>
    )}
</section>

<section className="mb-9 rounded-2xl border border-[#e4eae2] bg-white p-5 md:p-7">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 className="text-xl font-semibold">Smart food-use priorities</h2>
      <p className="mt-1 max-w-2xl text-sm text-[#78877c]">Recorded expiry dates determine the order. If an item has no expiry date, AI estimates one using its name, category, purchase date, and storage notes.</p>
    </div>
    <button type="button" onClick={analyzeFoodPriorities} disabled={analyzingFoodPriorities || loading || items.length === 0} className="rounded-xl bg-[#245c43] px-4 py-3 text-sm font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed disabled:opacity-50">
      {analyzingFoodPriorities ? 'Checking inventory…' : '✨ Analyze food priorities'}
    </button>
  </div>

  {foodPriorities && (
    <div className="mt-5 space-y-3">
      {foodPriorities.map((item) => {
        const priorityClass = item.priority === 'expired' ? 'border-red-200 bg-red-50 text-red-900' : item.priority === 'urgent' ? 'border-amber-200 bg-amber-50 text-amber-900' : item.priority === 'soon' ? 'border-yellow-200 bg-yellow-50 text-yellow-900' : item.priority === 'later' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-gray-50 text-gray-800'
        return (
          <article key={item.id} className={`rounded-xl border p-4 ${priorityClass}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{item.name}</h3>
                <p className="mt-1 text-sm">{item.priorityLabel}</p>
              </div>
              <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">{item.priorityExpiry ? `Date: ${item.priorityExpiry}` : 'Date unavailable'}</span>
            </div>
            <p className="mt-2 text-xs opacity-80">{item.source}{item.daysRemaining !== undefined ? ` · ${item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)} day(s) past date` : `${item.daysRemaining} day(s) remaining`}` : ''}</p>
            {item.priorityNote && <p className="mt-2 text-xs opacity-80">{item.priorityNote}</p>}
            {item.priority === 'expired' && <p className="mt-2 text-xs font-medium">Check the food's condition carefully. A date alone cannot determine whether food is safe.</p>}
          </article>
        )
      })}
    </div>
  )}
</section>

        </section>

        <div className="grid items-start gap-7 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-[#e4eae2] bg-white p-5 md:p-7">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Your inventory</h2>
                <p className="mt-1 text-sm text-[#78877c]">Ingredients saved in your fridge</p>
              </div>
              <button
                onClick={() => refreshInventory().catch((err) => setError(err.message))}
                className="rounded-lg border border-[#e4eae2] px-3 py-2 text-sm hover:bg-[#f6f8f5]"
              >
                Refresh
              </button>
            </div>

            <label className="mb-5 block text-sm">
              Inventory filter
              <select
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5"
              >
                <option value="all">All ingredients</option>
                <option value="low">Low stock only</option>
                <option value="empty">Empty items only</option>
              </select>
            </label>

            <form onSubmit={handleAdd} className="mb-7 rounded-xl bg-[#f6f8f5] p-4">
              <h3 className="mb-4 text-sm font-semibold">Add an ingredient manually</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Ingredient name
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Tomatoes"
                    maxLength={120}
                    className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="text-sm">
                  Category
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5 outline-none focus:border-emerald-600"
                  >
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  Quantity
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="text-sm">
                  Unit
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5 outline-none focus:border-emerald-600"
                  >
                    {['pieces', 'items', 'g', 'kg', 'ml', 'litres', 'packets', 'bunches'].map((unit) => <option key={unit}>{unit}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  Purchase date
                  <input
                    type="date"
                    value={form.purchase_date}
                    onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="text-sm">
                  Expiry date
                  <input
                    type="date"
                    value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Storage notes
                  <textarea
                    value={form.storage_notes}
                    onChange={(e) => setForm({ ...form, storage_notes: e.target.value })}
                    maxLength={500}
                    rows={2}
                    placeholder="e.g. Keep refrigerated; opened today"
                    className="mt-1.5 w-full rounded-lg border border-[#dce5da] bg-white px-3 py-2.5 outline-none focus:border-emerald-600"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={handleSuggestExpiry}
                disabled={suggestingExpiry || saving || health !== 'connected'}
                className="mt-3 w-full rounded-lg border border-[#b8cfb5] bg-white px-4 py-2.5 text-sm font-semibold text-[#245c43] hover:bg-[#eef5eb] disabled:cursor-not-allowed"
              >
                {suggestingExpiry ? 'Suggesting expiry date…' : '✨ Suggest expiry date with AI'}
              </button>
              {suggestionExplanation && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  {suggestionExplanation} Review the date before saving.
                </p>
              )}
              <button disabled={saving || health !== 'connected'} className="mt-4 w-full rounded-lg bg-[#245c43] px-4 py-3 text-sm font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed">
                {saving ? 'Saving…' : '+ Add to inventory'}
              </button>
            </form>

            {items.length > 0 && (
              <section className="mb-5 rounded-xl border border-[#dce5da] bg-[#f8faf6] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#245c43]">AI storage guidance</h3>
                    <p className="mt-1 text-xs text-[#78877c]">
                      Select one, a few, or all inventory items to get storage recommendations together.
                    </p>
                    <p className="mt-1 text-xs font-medium text-[#536459]">
                      {selectedStorageItems.length} item(s) selected
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={selectAllStorageItems} className="rounded-lg border border-[#b8cfb5] bg-white px-3 py-2 text-xs font-semibold text-[#245c43] hover:bg-[#eef5eb]">
                      Select all inventory
                    </button>
                    <button type="button" onClick={() => setSelectedStorageItems([])} disabled={selectedStorageItems.length === 0} className="rounded-lg border border-[#dce5da] bg-white px-3 py-2 text-xs font-semibold text-[#536459] disabled:opacity-50">
                      Clear selection
                    </button>
                    <button type="button" onClick={handleGetStorageGuidance} disabled={loadingStorageGuidance || selectedStorageItems.length === 0 || health !== 'connected'} className="rounded-lg bg-[#245c43] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed disabled:opacity-50">
                      {loadingStorageGuidance ? 'Generating guidance…' : `Get guidance (${selectedStorageItems.length})`}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {loading ? (
              <p className="py-8 text-center text-sm text-[#78877c]">Loading inventory…</p>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#dce5da] px-5 py-10 text-center">
                <div className="text-4xl">🥕</div>
                <h3 className="mt-3 font-semibold">Your fridge list is empty</h3>
                <p className="mt-1 text-sm text-[#78877c]">Add an ingredient above to get started.</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#dce5da] p-6 text-center text-sm text-[#78877c]">No ingredients match this stock filter.</p>
            ) : (
              <div className="space-y-6">
                {groupedItems.map((group) => (
                  <section key={group.category} aria-label={`${group.category} inventory`}>
                    <button
                      type="button"
                      aria-expanded={Boolean(expandedCategories[group.category])}
                      onClick={() => setExpandedCategories((current) => ({ ...current, [group.category]: !current[group.category] }))}
                      className="mb-2 flex w-full items-center gap-2 border-b border-[#e4eae2] pb-3 text-left text-sm font-bold text-[#245c43]"
                    >
                      <span>{group.category === 'Fruit' ? '🍎' : group.category === 'Vegetable' ? '🥦' : group.category === 'Dairy' ? '🥛' : group.category === 'Protein' ? '🥚' : group.category === 'Juices' ? '🧃' : group.category === 'Other' ? '🧺' : '📦'}</span>
                      <span className="flex-1">{group.category}</span>
                      <span className="rounded-full bg-[#eef5eb] px-2.5 py-1 text-xs font-medium">{group.items.length}</span>
                      <span aria-hidden="true" className="text-base">{expandedCategories[group.category] ? '⌃' : '⌄'}</span>
                    </button>
                    {expandedCategories[group.category] && (group.items.length > 0 ? (
                    <ul className="divide-y divide-[#edf0eb]">
                {group.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-3 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eef5eb] text-xl">
                          {item.category === 'Fruit' ? '🍎' : item.category === 'Dairy' ? '🥛' : item.category === 'Protein' ? '🥚' : item.category === 'Vegetable' ? '🥦' : item.category === 'Juices' ? '🧃' : '🧺'}
                        </span>
                        <input
                          type="checkbox"
                          checked={selectedStorageItems.includes(item.id)}
                          onChange={() => toggleStorageItem(item.id)}
                          aria-label={`Select ${item.name} for storage guidance`}
                          className="h-4 w-4 shrink-0 accent-emerald-700"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="mt-0.5 text-xs text-[#78877c]">{item.category || 'Uncategorized'}</p>
                          {(() => {
                            const stock = getStockStatus(item.quantity)
                            return <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stock.className}`}>{stock.label}</span>
                          })()}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-medium">{item.quantity} {item.unit}</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          aria-label={`Delete ${item.name}`}
                          title="Delete item"
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const freshness = getFreshness(item.expiry_date)
                      const badgeClass = freshness.status === 'expired'
                        ? 'bg-red-100 text-red-800'
                        : freshness.status === 'soon'
                          ? 'bg-amber-100 text-amber-900'
                          : freshness.status === 'fresh'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-700'
                      const changes = editingItems[item.id] || {}
                      const isExpanded = Boolean(expandedItems[item.id])

                      return (
                        <div className="ml-0">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                                {freshness.label}
                              </span>
                              <span className="text-xs text-[#78877c]">
                                {item.expiry_date ? `Expiry: ${item.expiry_date}` : 'Expiry date not set'}
                              </span>
                            </div>
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedItems((current) => ({
                                ...current,
                                [item.id]: !current[item.id],
                              }))}
                              className="rounded-lg border border-[#b8cfb5] px-3 py-2 text-xs font-semibold text-[#245c43] hover:bg-[#eef5eb]"
                            >
                              {isExpanded ? 'Hide details ▲' : 'View details ▼'}
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 rounded-xl bg-[#f8faf6] p-4">
                              <h4 className="mb-3 text-sm font-semibold text-[#245c43]">
                                {item.name} — inventory details
                              </h4>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-xs text-[#536459]">
                                  Quantity
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={changes.quantity !== undefined ? changes.quantity : String(item.quantity)}
                                    onChange={(e) => changeItemField(item.id, 'quantity', e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-[#dce5da] bg-white px-2 py-2 text-sm"
                                  />
                                </label>
                                <label className="text-xs text-[#536459]">
                                  Unit
                                  <select
                                    value={changes.unit !== undefined ? changes.unit : item.unit}
                                    onChange={(e) => changeItemField(item.id, 'unit', e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-[#dce5da] bg-white px-2 py-2 text-sm"
                                  >
                                    {['pieces', 'items', 'g', 'kg', 'ml', 'litres', 'packets', 'bunches'].map((unit) => (
                                      <option key={unit} value={unit}>{unit}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-xs text-[#536459]">
                                  Purchase date
                                  <input
                                    type="date"
                                    value={changes.purchase_date !== undefined ? changes.purchase_date : (item.purchase_date || '')}
                                    onChange={(e) => changeItemField(item.id, 'purchase_date', e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-[#dce5da] bg-white px-2 py-2 text-sm"
                                  />
                                </label>
                                <label className="text-xs text-[#536459]">
                                  Expiry date
                                  <input
                                    type="date"
                                    value={changes.expiry_date !== undefined ? changes.expiry_date : (item.expiry_date || '')}
                                    onChange={(e) => changeItemField(item.id, 'expiry_date', e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-[#dce5da] bg-white px-2 py-2 text-sm"
                                  />
                                </label>
                                <label className="text-xs text-[#536459] sm:col-span-2">
                                  Storage notes
                                  <textarea
                                    value={changes.storage_notes !== undefined ? changes.storage_notes : (item.storage_notes || '')}
                                    onChange={(e) => changeItemField(item.id, 'storage_notes', e.target.value)}
                                    maxLength={500}
                                    rows={2}
                                    placeholder="e.g. Keep refrigerated; washed and dried"
                                    className="mt-1 w-full rounded-lg border border-[#dce5da] bg-white px-2 py-2 text-sm"
                                  />
                                </label>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveItemChanges(item)}
                                  disabled={Object.keys(changes).length === 0}
                                  className="rounded-lg bg-[#245c43] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Save details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingItems((current) => {
                                    const next = { ...current }
                                    delete next[item.id]
                                    return next
                                  })}
                                  disabled={Object.keys(changes).length === 0}
                                  className="rounded-lg border border-[#dce5da] px-4 py-2.5 text-xs font-semibold text-[#536459] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Discard changes
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </li>
                ))}
                    </ul>
                    ) : (
                      <p className="mb-4 rounded-lg bg-[#f8faf6] px-3 py-4 text-sm text-[#78877c]">No {group.category.toLowerCase()} saved yet.</p>
                    ))}
                  </section>
                ))}
              </div>
            )}

            {Object.keys(storageGuidance).length > 0 && (
              <section className="mt-7 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-[#245c43]">Storage guidance results</h3>
                    <p className="text-xs text-[#78877c]">AI recommendations are estimates; always check the food's actual condition.</p>
                  </div>
                  <button type="button" onClick={() => setStorageGuidance({})} className="rounded-lg border border-[#dce5da] px-3 py-2 text-xs font-semibold text-[#536459] hover:bg-[#f8faf6]">
                    Clear results
                  </button>
                </div>
                {items.filter((item) => storageGuidance[item.id]).map((item) => {
                  const guidance = storageGuidance[item.id]
                  return (
                    <article key={item.id} className="rounded-xl border border-[#dce5da] bg-white p-4">
                      <h4 className="font-semibold text-[#245c43]">{guidance.ingredient || item.name}</h4>
                      <p className="mt-2 text-sm">{guidance.answer}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg bg-[#f8faf6] p-3">
                          <p className="text-xs font-semibold text-[#536459]">Storage method</p>
                          <p className="mt-1 text-sm">{guidance.storage_method}</p>
                        </div>
                        <div className="rounded-lg bg-[#f8faf6] p-3">
                          <p className="text-xs font-semibold text-[#536459]">Temperature</p>
                          <p className="mt-1 text-sm">{guidance.temperature}</p>
                        </div>
                        <div className="rounded-lg bg-[#f8faf6] p-3">
                          <p className="text-xs font-semibold text-[#536459]">Storage duration</p>
                          <p className="mt-1 text-sm">{guidance.storage_duration}</p>
                        </div>
                        <div className="rounded-lg bg-[#f8faf6] p-3">
                          <p className="text-xs font-semibold text-[#536459]">Freezing</p>
                          <p className="mt-1 text-sm">{guidance.freezing_guidance}</p>
                        </div>
                      </div>
                      {Array.isArray(guidance.preparation) && guidance.preparation.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-[#536459]">Preparation</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{guidance.preparation.map((tip, index) => <li key={index}>{tip}</li>)}</ul>
                        </div>
                      )}
                      {Array.isArray(guidance.spoilage_signs) && guidance.spoilage_signs.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-[#536459]">Signs of spoilage</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{guidance.spoilage_signs.map((tip, index) => <li key={index}>{tip}</li>)}</ul>
                        </div>
                      )}
                      {Array.isArray(guidance.additional_tips) && guidance.additional_tips.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-[#536459]">Additional tips</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{guidance.additional_tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul>
                        </div>
                      )}
                      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{guidance.disclaimer}</p>
                    </article>
                  )
                })}
              </section>
            )}
          </section>

          <section id="photo-upload" className="rounded-2xl border border-[#e4eae2] bg-white p-5 md:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">Scan your fridge</h2>
              <p className="mt-1 text-sm leading-6 text-[#78877c]">
                Select up to three photos of your fridge and review AI-detected ingredients before saving.
              </p>
            </div>
             
             
<div className="mb-4 rounded-xl border border-[#dce5da] bg-[#f8faf6] p-4">
  <h3 className="font-semibold">Scan using your camera</h3>

  <p className="mt-1 text-sm text-[#78877c]">
    Allow camera access, point your camera at the fridge, and capture up to three photos.
  </p>

  <video
  ref={videoRef}
  autoPlay
  muted
  playsInline
  className={`mt-4 min-h-48 max-h-80 w-full rounded-xl bg-black object-contain ${
    cameraActive ? 'block' : 'hidden'
  }`}
/>

  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
    {!cameraActive ? (
      <button
        type="button"
        onClick={startCamera}
        disabled={photos.length >= 3}
        className="rounded-lg bg-[#245c43] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        Open camera
      </button>
    ) : (
      <>
        <button
          type="button"
          onClick={capturePhoto}
          disabled={photos.length >= 3}
          className="rounded-lg bg-[#245c43] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Capture photo ({photos.length}/3)
        </button>

        <button
          type="button"
          onClick={stopCamera}
          className="rounded-lg border border-[#dce5da] bg-white px-4 py-3 text-sm font-semibold"
        >
          Stop camera
        </button>
      </>
    )}
  </div>

  {cameraMessage && (
    <p role="status" className="mt-3 text-sm text-[#245c43]">
      {cameraMessage}
    </p>
  )}
</div>

            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={photos.length >= 3}
              className="flex min-h-48 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#cdddc9] bg-[#f8faf6] p-5 text-center hover:border-emerald-600"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e3f3e6] text-3xl">📷</span>
              <span className="mt-3 font-semibold">Choose fridge photos</span>
              <span className="mt-1 text-xs text-[#78877c]">{photos.length}/3 selected · Image files only</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotos}
              className="hidden"
            />

            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative">
                    <img src={photo.url} alt={photo.file.name} className="h-24 w-full rounded-lg border border-[#e4eae2] object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label={`Remove ${photo.file.name}`}
                      className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-[#173e30] text-sm text-white"
                    >
                      ×
                    </button>
                    <p className="mt-1 truncate text-xs text-[#78877c]">{photo.file.name}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl bg-[#f6f8f5] p-4">
              
            <button
             type="button"
             onClick={handleDetect}
             disabled={detecting || photos.length === 0 || health !== 'connected'}
             className="mt-4 w-full rounded-xl bg-[#245c43] px-4 py-3 text-sm font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed"
             >
             {detecting ? 'Analyzing photos…' : 'Detect ingredients with AI'}
            </button>
            
            
             {error && photos.length > 0 && (
            <button
             type="button"
             onClick={handleDetect}
             disabled={detecting}
             className="mt-2 rounded-lg border border-[#245c43] px-4 py-2.5 text-sm font-semibold text-[#245c43] disabled:cursor-not-allowed disabled:opacity-50"
           >
            {detecting ? 'Retrying detection…' : 'Retry detection'}
           </button>
             )}


              <p className="text-sm font-semibold">AI ingredient detection</p>
              <p className="mt-1 text-xs leading-5 text-[#78877c]">
                Your photos will be analyzed securely through the configured vision API.
                Review detected ingredients before saving them.
              </p>
            </div>
          </section>
        </div>
        </>
        )}

        {activeView === 'recipes' && (
          <section className="mb-8 rounded-2xl border border-[#e4eae2] bg-white p-4 sm:p-6 md:p-7">
            <RecipeSuggestions
              priorityIngredients={(foodPriorities || [])
                .filter((item) => item.priority === 'urgent' || item.priority === 'soon')
                .map((item) => item.name)}
              onAddMissingIngredients={addShoppingItems}
            />

            <section className="mt-8 rounded-2xl border border-[#dce5da] bg-[#f8faf6] p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-emerald-700">FreshSpace</p>
                  <h3 className="mt-1 text-xl font-bold text-[#203129]">Shopping list</h3>
                  <p className="mt-1 text-sm text-[#78877c]">
                    Collect missing ingredients from recipes and keep track of what you have purchased.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#245c43]">
                  {shoppingList.filter((item) => !item.purchased).length} to buy
                </span>
              </div>

              <form onSubmit={addManualShoppingItem} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="new-shopping-item">Add an item</label>
                <input
                  id="new-shopping-item"
                  value={newShoppingItem}
                  onChange={(event) => setNewShoppingItem(event.target.value)}
                  maxLength={120}
                  placeholder="Add an item manually, e.g. Olive oil"
                  className="min-w-0 flex-1 rounded-lg border border-[#dce5da] bg-white px-3 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={!newShoppingItem.trim()}
                  className="rounded-lg bg-[#245c43] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add item
                </button>
              </form>

              {shoppingNotice && (
                <p role="status" className="mt-3 text-sm text-[#536459]">{shoppingNotice}</p>
              )}

              {shoppingList.length === 0 ? (
                <p className="mt-5 rounded-xl border border-dashed border-[#cdddc9] bg-white p-5 text-center text-sm text-[#78877c]">
                  Your shopping list is empty. Generate recipes and add their missing ingredients here.
                </p>
              ) : (
                <>
                  <ul className="mt-4 divide-y divide-[#e4eae2] rounded-xl border border-[#e4eae2] bg-white px-4">
                    {shoppingList.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-3">
                        <input
                          type="checkbox"
                          checked={item.purchased}
                          onChange={() => toggleShoppingItem(item.id)}
                          aria-label={`Mark ${item.name} as ${item.purchased ? 'not purchased' : 'purchased'}`}
                          className="h-4 w-4 accent-emerald-700"
                        />
                        <span className={`min-w-0 flex-1 text-sm ${item.purchased ? 'text-[#9aa59c] line-through' : 'text-[#203129]'}`}>
                          {item.name}
                        </span>
                        <span className={`text-xs ${item.purchased ? 'text-emerald-700' : 'text-[#78877c]'}`}>
                          {item.purchased ? 'Purchased' : 'To buy'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeShoppingItem(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={copyShoppingList} className="rounded-lg border border-[#b8cfb5] bg-white px-3 py-2 text-sm font-semibold text-[#245c43] hover:bg-[#eef5eb]">
                      Copy list
                    </button>
                    <button
                      type="button"
                      onClick={clearPurchasedItems}
                      disabled={!shoppingList.some((item) => item.purchased)}
                      className="rounded-lg border border-[#dce5da] bg-white px-3 py-2 text-sm font-semibold text-[#536459] hover:bg-[#f6f8f5] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear purchased
                    </button>
                  </div>
                </>
              )}
              <p className="mt-3 text-xs text-[#78877c]">This list is saved in this browser on this device.</p>
            </section>
          </section>
        )}

        {activeView === 'planner' && (
          <section className="mb-8 rounded-2xl border border-[#e4eae2] bg-white p-4 sm:p-6 md:p-7">
            <WeeklyMealPlanner
              priorityIngredients={(foodPriorities || [])
                .filter((item) => item.priority === 'urgent' || item.priority === 'soon')
                .map((item) => item.name)}
              onAddMissingIngredients={addShoppingItems}
            />
          </section>
        )}

        <footer className="mt-10 border-t border-[#e4eae2] py-6 text-center text-xs text-[#78877c]">
          FreshSpace · Local-first Smart Fridge AI · Your inventory stays on your computer
        </footer>
      </div>
    </main>
  )
}

export default App
