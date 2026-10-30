import { useEffect, useState } from 'react'
import { generateWeeklyMealPlan } from '../services/api'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SLOTS = ['Breakfast', 'Lunch', 'Dinner']
const STORAGE_KEY = 'freshspace-weekly-meal-plan'

export default function WeeklyMealPlanner({ priorityIngredients = [], onAddMissingIngredients = () => {} }) {
  const [plan, setPlan] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const parsed = saved ? JSON.parse(saved) : []
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  })
  const [diet, setDiet] = useState('None')
  const [excludedText, setExcludedText] = useState('')
  const [servings, setServings] = useState('2')
  const [maxPrepMinutes, setMaxPrepMinutes] = useState('45')
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)) } catch { /* keep in memory */ }
  }, [plan])

  const preferences = () => ({
    dietaryPreferences: diet === 'None' ? [] : [diet],
    excludedIngredients: excludedText.split(',').map((v) => v.trim()).filter(Boolean),
    priorityIngredients,
    servings,
    maxPrepMinutes,
  })

  async function createPlan() {
    setLoading(true); setError(''); setNotice('')
    try {
      const result = await generateWeeklyMealPlan(preferences())
      setPlan(result.plan || [])
      setNotice(result.message || 'Your weekly meal plan is ready.')
      if (!(result.plan || []).length) setError('No meals were returned. Check that your inventory contains suitable ingredients.')
    } catch (err) { setError(err.message || 'Could not generate a weekly meal plan.') }
    finally { setLoading(false) }
  }

  async function regenerate(day, mealSlot) {
    const key = `${day}-${mealSlot}`
    setRegenerating(key); setError(''); setNotice('')
    try {
      const result = await generateWeeklyMealPlan({
        ...preferences(), existingPlan: plan, targetDay: day, targetMeal: mealSlot,
      })
      const replacement = (result.plan || []).find((meal) => meal.day === day && meal.meal_slot === mealSlot)
      if (!replacement) throw new Error('The AI did not return the requested meal. Please retry.')
      setPlan((current) => [...current.filter((meal) => !(meal.day === day && meal.meal_slot === mealSlot)), replacement])
      setNotice(`${day} ${mealSlot.toLowerCase()} was regenerated.`)
    } catch (err) { setError(err.message || 'Could not regenerate this meal.') }
    finally { setRegenerating('') }
  }

  const mealAt = (day, slot) => plan.find((meal) => meal.day === day && meal.meal_slot === slot)

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-700">FreshSpace · Stage 11</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Weekly meal planner</h2>
        <p className="mt-2 text-sm text-slate-600">Create seven days of breakfast, lunch and dinner using your saved fridge inventory.</p>
        {priorityIngredients.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Prioritizing: {priorityIngredients.join(', ')}</p>}
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-[#f8faf6] p-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Dietary preference
          <select value={diet} onChange={(e) => setDiet(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3">
            {['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'High-protein'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Servings
          <input type="number" min="1" max="12" value={servings} onChange={(e) => setServings(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3" />
        </label>
        <label className="text-sm font-medium text-slate-700">Maximum prep time (minutes)
          <input type="number" min="5" max="240" value={maxPrepMinutes} onChange={(e) => setMaxPrepMinutes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Ingredients to exclude
          <input value={excludedText} onChange={(e) => setExcludedText(e.target.value)} placeholder="e.g. peanuts, prawns, mushrooms" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3" />
          <span className="mt-1 block text-xs font-normal text-slate-500">For serious allergies, verify every ingredient and prevent cross-contact.</span>
        </label>
        <button type="button" onClick={createPlan} disabled={loading || Boolean(regenerating)} className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 sm:col-span-2">
          {loading ? 'Generating 7-day plan…' : plan.length ? 'Generate a new 7-day plan' : 'Generate 7-day meal plan'}
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}

      {plan.length > 0 && (
        <div className="space-y-4">
          {DAYS.map((day) => (
            <section key={day} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-lg font-bold text-slate-900">{day}</h3>
              <div className="grid gap-3 lg:grid-cols-3">
                {SLOTS.map((slot) => {
                  const meal = mealAt(day, slot)
                  const key = `${day}-${slot}`
                  return (
                    <article key={slot} className="rounded-xl bg-[#f8faf6] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{slot}</p>
                      {meal ? <>
                        <h4 className="mt-1 font-semibold text-slate-900">{meal.title}</h4>
                        <p className="mt-1 text-sm text-slate-600">{meal.description}</p>
                        <p className="mt-2 text-xs text-slate-500">⏱ {meal.prep_minutes || '—'} min · {meal.servings || servings} servings</p>
                        {meal.available_ingredients?.length > 0 && <p className="mt-2 text-xs text-slate-600"><strong>In your fridge:</strong> {meal.available_ingredients.join(', ')}</p>}
                        {meal.missing_ingredients?.length > 0 && <>
                          <p className="mt-2 text-xs text-amber-800"><strong>To get:</strong> {meal.missing_ingredients.join(', ')}</p>
                          <button type="button" onClick={() => onAddMissingIngredients(meal.missing_ingredients)} className="mt-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800">+ Add missing to shopping list</button>
                        </>}
                        {meal.steps?.length > 0 && <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-600">{meal.steps.map((step, i) => <li key={`${key}-${i}`}>{step}</li>)}</ol>}
                      </> : <p className="mt-2 text-sm text-slate-500">No meal generated.</p>}
                      <button type="button" onClick={() => regenerate(day, slot)} disabled={loading || Boolean(regenerating)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                        {regenerating === key ? 'Regenerating…' : 'Regenerate this meal'}
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
          <p className="text-xs text-slate-500">Your plan is saved in this browser on this device. AI meal suggestions are not food-safety guarantees; inspect ingredients before use.</p>
        </div>
      )}
    </section>
  )
}
