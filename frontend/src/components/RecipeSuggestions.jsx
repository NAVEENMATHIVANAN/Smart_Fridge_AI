
import { useState } from 'react'
import { suggestRecipes } from '../services/api'

export default function RecipeSuggestions() {
  const [cuisine, setCuisine] = useState('Any')
  const [diet, setDiet] = useState('None')
  const [excludedIngredients, setExcludedIngredients] = useState('')
  const [servings, setServings] = useState('2')
  const [maxPrepMinutes, setMaxPrepMinutes] = useState('45')

  const [recipes, setRecipes] = useState([])
  const [inventoryCount, setInventoryCount] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleGenerateRecipes(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    setRecipes([])

    try {
      const dietaryPreferences =
        diet === 'None' ? [] : [diet]

      const excluded = excludedIngredients
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

      const result = await suggestRecipes({
        cuisine: cuisine === 'Any' ? null : cuisine,
        dietaryPreferences,
        excludedIngredients: excluded,
        servings,
        maxPrepMinutes,
      })

      setRecipes(result.recipes || [])
      setInventoryCount(result.inventory_count)
      setMessage(result.message || '')
    } catch (err) {
      setError(err.message || 'Unable to generate recipes.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-700">
          Smart Fridge AI
        </p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">
          Recipe suggestions
        </h2>
        <p className="mt-2 text-slate-600">
          Generate recipes from your saved ingredients, including US-style comfort food, Southern dishes, and Tex-Mex ideas.
        </p>
      </div>

      <form
        onSubmit={handleGenerateRecipes}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-[#f8faf6] p-4 sm:grid-cols-2"
      >
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">
            Cuisine
          </span>
          <select
            value={cuisine}
            onChange={(event) => setCuisine(event.target.value)}
            className="w-full rounded-lg border border-slate-300 p-3"
          >
            <option>Any</option>
            <option>Indian</option>
            <option>US / American</option>
            <option>Southern US</option>
            <option>Tex-Mex</option>
            <option>Cajun / Creole</option>
            <option>South Indian</option>
            <option>North Indian</option>
            <option>Italian</option>
            <option>Chinese</option>
            <option>Mexican</option>
            <option>Mediterranean</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">
            Dietary preference
          </span>
          <select
            value={diet}
            onChange={(event) => setDiet(event.target.value)}
            className="w-full rounded-lg border border-slate-300 p-3"
          >
            <option>None</option>
            <option>Vegetarian</option>
            <option>Vegan</option>
            <option>Gluten-free</option>
            <option>Dairy-free</option>
            <option>High-protein</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">
            Servings
          </span>
          <input
            type="number"
            min="1"
            max="12"
            value={servings}
            onChange={(event) => setServings(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 p-3"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">
            Maximum preparation time (minutes)
          </span>
          <input
            type="number"
            min="5"
            max="240"
            value={maxPrepMinutes}
            onChange={(event) => setMaxPrepMinutes(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 p-3"
          />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">
            Ingredients to exclude
          </span>
          <input
            type="text"
            value={excludedIngredients}
            onChange={(event) =>
              setExcludedIngredients(event.target.value)
            }
            placeholder="e.g. peanuts, prawns, mushrooms"
            className="w-full rounded-lg border border-slate-300 p-3"
          />
          <span className="text-xs text-slate-500">
            Separate ingredients with commas. For serious allergies,
            verify every ingredient and prevent cross-contact.
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
        >
          {loading ? 'Generating recipes...' : 'Generate recipes'}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
        >
          {error}
        </div>
      )}

      {message && (
        <p className="text-sm text-slate-600" role="status">
          {message}
          {inventoryCount !== null && ` Saved inventory items: ${inventoryCount}.`}
        </p>
      )}

      {recipes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {recipes.map((recipe, index) => (
            <article
              key={`${recipe.title}-${index}`}
              className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {recipe.title}
                </h3>
                <p className="mt-2 text-slate-600">
                  {recipe.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                    {recipe.prep_minutes} min
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                    {recipe.servings} servings
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800">
                  Ingredients in your fridge
                </h4>
                {recipe.available_ingredients?.length ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {recipe.available_ingredients.map((item, itemIndex) => (
                      <li key={`${item}-${itemIndex}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No matching saved ingredients were listed.
                  </p>
                )}
              </div>

              <div>
                <h4 className="font-semibold text-slate-800">
                  Ingredients to get
                </h4>
                {recipe.missing_ingredients?.length ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {recipe.missing_ingredients.map((item, itemIndex) => (
                      <li key={`${item}-${itemIndex}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-emerald-700">
                    No missing ingredients reported.
                  </p>
                )}
              </div>

              {recipe.uses_expiring_soon?.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <h4 className="font-semibold text-amber-900">
                    Expiry-aware suggestions
                  </h4>
                  <p className="mt-1 text-sm text-amber-800">
                    {recipe.uses_expiring_soon.join(', ')}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Check the food's condition and storage history before use.
                  </p>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-slate-800">
                  Cooking instructions
                </h4>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  {recipe.steps?.map((step, stepIndex) => (
                    <li key={`${stepIndex}-${step}`}>{step}</li>
                  ))}
                </ol>
              </div>

              {recipe.disclaimer && (
                <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                  {recipe.disclaimer}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
