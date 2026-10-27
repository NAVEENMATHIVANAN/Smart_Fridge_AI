
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addInventoryItem,
  deleteInventoryItem,
  detectIngredients,
  getHealth,
  getInventory,
} from './services/api'

const initialForm = {
  name: '',
  quantity: '1',
  unit: 'pieces',
  category: 'Vegetable',
}

const categories = ['Vegetable', 'Fruit', 'Dairy', 'Protein', 'Other']

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
  const [detected, setDetected] = useState([])
  const [detecting, setDetecting] = useState(false)

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

  async function handleAdd(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!form.name.trim()) {
      setError('Enter an ingredient name.')
      return
    }

    const quantity = Number(form.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantity must be greater than zero.')
      return
    }

    setSaving(true)
    try {
      const created = await addInventoryItem({
        name: form.name.trim(),
        quantity,
        unit: form.unit,
        category: form.category,
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
    const result = await detectIngredients(
      photos.map((photo) => photo.file),
    )

    setDetected(
      result.ingredients.map((item, index) => ({
        ...item,
        reviewId: `${item.name}-${index}`,
        quantity: String(item.quantity),
        confirmed: true,
      })),
    )

    setNotice(
      `Analyzed ${result.image_count} photo(s). Review the candidates below.`,
    )
  } catch (err) {
    setError(`Ingredient detection failed: ${err.message}`)
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

      if (!item.name.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Each selected item needs a name and positive quantity.')
      }

      const created = await addInventoryItem({
        name: item.name.trim(),
        quantity,
        unit: item.unit,
        category: item.category,
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
    return () => photos.forEach((photo) => URL.revokeObjectURL(photo.url))
  }, [photos])

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
              Keep your ingredients organized today. AI-powered fridge scanning
              and personalized recipe ideas are coming next.
            </p>
            <button
              onClick={() => document.getElementById('photo-upload')?.scrollIntoView({ behavior: 'smooth' })}
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
          
          <button
           type="button"
           onClick={handleDetect}
           disabled={detecting || photos.length === 0 || health !== 'connected'}
           className="mt-4 w-full rounded-xl bg-[#245c43] px-4 py-3 text-sm font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed"
           >
          {detecting ? 'Analyzing photos…' : 'Detect ingredients with AI'}
           </button>

        </section>

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
                    min="0.01"
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
              </div>
              <button disabled={saving || health !== 'connected'} className="mt-4 w-full rounded-lg bg-[#245c43] px-4 py-3 text-sm font-semibold text-white hover:bg-[#173e30] disabled:cursor-not-allowed">
                {saving ? 'Saving…' : '+ Add to inventory'}
              </button>
            </form>

            {loading ? (
              <p className="py-8 text-center text-sm text-[#78877c]">Loading inventory…</p>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#dce5da] px-5 py-10 text-center">
                <div className="text-4xl">🥕</div>
                <h3 className="mt-3 font-semibold">Your fridge list is empty</h3>
                <p className="mt-1 text-sm text-[#78877c]">Add an ingredient above to get started.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#edf0eb]">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eef5eb] text-xl">
                        {item.category === 'Fruit' ? '🍎' : item.category === 'Dairy' ? '🥛' : item.category === 'Protein' ? '🥚' : item.category === 'Vegetable' ? '🥦' : '🧺'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="mt-0.5 text-xs text-[#78877c]">{item.category || 'Uncategorized'}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                   <span className="text-sm font-medium">
                    {item.quantity} {item.unit}
                   </span>

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
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="photo-upload" className="rounded-2xl border border-[#e4eae2] bg-white p-5 md:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">Scan your fridge</h2>
              <p className="mt-1 text-sm leading-6 text-[#78877c]">
                Select up to three photos of your fridge. AI detection will be connected in the next stage.
              </p>
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

              <p className="text-sm font-semibold">AI ingredient detection</p>
              <p className="mt-1 text-xs leading-5 text-[#78877c]">
                Your photos will be analyzed securely through the configured vision API.
                Review detected ingredients before saving them.
              </p>
            </div>
          </section>
        </div>

        <footer className="mt-10 border-t border-[#e4eae2] py-6 text-center text-xs text-[#78877c]">
          FreshSpace · Local-first Smart Fridge AI · Your inventory stays on your computer
        </footer>
      </div>
    </main>
  )
}

export default App
