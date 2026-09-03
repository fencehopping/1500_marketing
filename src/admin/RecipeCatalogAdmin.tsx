import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Ingredient = { id?: string; text: string; quantity: string; calories: number };
type Instruction = { id?: string; text: string };

type TagAssignment = {
  tagID: string;
  slug: string;
  displayName: string;
  category: string;
  requiresReview: boolean;
  source: "manual" | "ai" | "rule";
  confidence: number | null;
  evidence: string[];
  isLocked: boolean;
};

type CatalogTag = {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  description: string;
  assignmentMode: "manual" | "ai" | "rule" | "hybrid";
  requiresReview: boolean;
};

type OptimizationFilter = {
  id: string;
  slug: string;
  label: string;
  shortLabel: string;
  description: string;
  category: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  isUserFacing: boolean;
  scoringMode: "threshold" | "inverse_threshold" | "range" | "composite" | "boolean" | "heuristic";
  scoringDefinition: Record<string, unknown>;
  minimumNutritionDataRequired: string[];
  scoringVersion: number;
};

type OptimizationScore = {
  filterID: string;
  slug: string;
  label: string;
  category: string;
  score: number;
  calculatedScore: number;
  confidence: number;
  reasons: string[];
  inputs: Record<string, unknown>;
  scoringVersion: number;
  calculatedAt: string;
  isOverridden: boolean;
  overrideScore: number | null;
  overrideReason: string | null;
};

type CatalogRecipe = {
  id: string;
  slug: string;
  status: "draft" | "published" | "archived";
  title: string;
  summary: string;
  sourceType: "url" | "text" | "image" | "ai" | "manual";
  sourceURL: string;
  sourceAttribution: string;
  rightsStatus: "pending" | "owned" | "licensed" | "public_domain" | "reviewed";
  mealTypes: string[];
  servings: number;
  portionDescription: string;
  prepMinutes: number;
  cookMinutes: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fiberPerServing: number;
  sugarPerServing: number;
  fatPerServing: number;
  addedSugarPerServing: number | null;
  saturatedFatPerServing: number | null;
  sodiumMgPerServing: number | null;
  cholesterolMgPerServing: number | null;
  potassiumMgPerServing: number | null;
  calciumMgPerServing: number | null;
  ironMgPerServing: number | null;
  magnesiumMgPerServing: number | null;
  zincMgPerServing: number | null;
  seleniumMcgPerServing: number | null;
  vitaminAMcgPerServing: number | null;
  vitaminCMgPerServing: number | null;
  vitaminDMcgPerServing: number | null;
  vitaminEMgPerServing: number | null;
  vitaminKMcgPerServing: number | null;
  folateMcgPerServing: number | null;
  omega3GPerServing: number | null;
  servingWeightGrams: number | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
  notes: string;
  imageURL: string | null;
  imageAltText: string;
  editorialPriority: number;
  taggingStatus: "pending" | "ready" | "needs_review" | "failed";
  optimizationStatus: "pending" | "ready" | "failed";
  version: number;
  tags: TagAssignment[];
};

type ImportedRecipe = Partial<Omit<CatalogRecipe, "ingredients" | "instructions">> & {
  title: string;
  ingredients: Array<Partial<Ingredient> & { name?: string }>;
  instructions: Array<string | Instruction>;
};

type Props = {
  apiBaseURL: string;
  credential: string | null;
  enabled: boolean;
  onStatus: (message: string) => void;
};

type ActionFeedback = {
  kind: "error" | "success";
  message: string;
};

const mealTypes = ["breakfast", "lunch", "dinner", "snack"];
const advancedNutritionFields = [
  { key: "addedSugarPerServing", label: "Added sugar g" },
  { key: "saturatedFatPerServing", label: "Saturated fat g" },
  { key: "sodiumMgPerServing", label: "Sodium mg" },
  { key: "cholesterolMgPerServing", label: "Cholesterol mg" },
  { key: "potassiumMgPerServing", label: "Potassium mg" },
  { key: "calciumMgPerServing", label: "Calcium mg" },
  { key: "ironMgPerServing", label: "Iron mg" },
  { key: "magnesiumMgPerServing", label: "Magnesium mg" },
  { key: "zincMgPerServing", label: "Zinc mg" },
  { key: "seleniumMcgPerServing", label: "Selenium mcg" },
  { key: "vitaminAMcgPerServing", label: "Vitamin A mcg" },
  { key: "vitaminCMgPerServing", label: "Vitamin C mg" },
  { key: "vitaminDMcgPerServing", label: "Vitamin D mcg" },
  { key: "vitaminEMgPerServing", label: "Vitamin E mg" },
  { key: "vitaminKMcgPerServing", label: "Vitamin K mcg" },
  { key: "folateMcgPerServing", label: "Folate mcg" },
  { key: "omega3GPerServing", label: "Omega-3 g" },
  { key: "servingWeightGrams", label: "Serving weight g" },
] as const;

export default function RecipeCatalogAdmin({ apiBaseURL, credential, enabled, onStatus }: Props) {
  const [recipes, setRecipes] = useState<CatalogRecipe[]>([]);
  const [tags, setTags] = useState<CatalogTag[]>([]);
  const [optimizationFilters, setOptimizationFilters] = useState<OptimizationFilter[]>([]);
  const [optimizationScores, setOptimizationScores] = useState<OptimizationScore[]>([]);
  const [draft, setDraft] = useState<CatalogRecipe>(emptyRecipe);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sourceMode, setSourceMode] = useState<"url" | "text" | "ai">("url");
  const [sourceInput, setSourceInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [optimizationQuery, setOptimizationQuery] = useState("");
  const [optimizationCategory, setOptimizationCategory] = useState("all");
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState<"load" | "source" | "save" | "tags" | "image" | "optimization" | "filters" | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  const groupedTags = useMemo(() => {
    const groups = new Map<string, CatalogTag[]>();
    tags.forEach((tag) => groups.set(tag.category, [...(groups.get(tag.category) ?? []), tag]));
    return [...groups.entries()];
  }, [tags]);

  const visibleOptimizationFilters = useMemo(() => optimizationFilters.filter((filter) => {
    const matchesQuery = !optimizationQuery.trim() || `${filter.label} ${filter.slug} ${filter.description}`.toLowerCase().includes(optimizationQuery.trim().toLowerCase());
    return matchesQuery && (optimizationCategory === "all" || filter.category === optimizationCategory);
  }), [optimizationFilters, optimizationQuery, optimizationCategory]);

  const optimizationCategories = useMemo(() => [...new Set(optimizationFilters.map((filter) => filter.category))], [optimizationFilters]);
  const scoresByFilter = useMemo(() => new Map(optimizationScores.map((score) => [score.filterID, score])), [optimizationScores]);
  const publishIssues = useMemo(() => publicationIssues(draft), [draft]);

  useEffect(() => {
    if (enabled) void Promise.all([loadRecipes(), loadTags(), loadOptimizationFilters()]);
  }, [enabled]);

  async function api(path: string, init: RequestInit = {}) {
    if (!credential) throw new Error("Sign in before managing recipes.");
    const response = await fetch(`${apiBaseURL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${credential}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? `Recipe request failed (${response.status}).`);
    }
    return response.json();
  }

  async function loadRecipes(append = false) {
    if (!credential) return;
    setBusy("load");
    try {
      const params = new URLSearchParams({ limit: "100", offset: append ? String(recipes.length) : "0" });
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const data = await api(`/admin/catalog/recipes?${params}`) as { recipes: CatalogRecipe[]; hasMore: boolean };
      setRecipes((current) => append ? [...current, ...data.recipes] : data.recipes);
      setHasMore(data.hasMore);
      onStatus(`${append ? "Added" : "Loaded"} ${data.recipes.length} catalog recipes.`);
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function loadTags() {
    if (!credential) return;
    try {
      const data = await api("/admin/catalog/tags") as { tags: CatalogTag[] };
      setTags(data.tags);
    } catch (error) {
      onStatus(message(error));
    }
  }

  async function loadOptimizationFilters() {
    if (!credential) return;
    try {
      const data = await api("/admin/catalog/filters") as { filters: OptimizationFilter[] };
      setOptimizationFilters(data.filters);
    } catch (error) {
      onStatus(message(error));
    }
  }

  async function loadOptimizationScores(recipeID: string) {
    if (!recipeID) return setOptimizationScores([]);
    try {
      const data = await api(`/admin/catalog/recipes/${recipeID}/optimization`) as { scores: OptimizationScore[] };
      setOptimizationScores(data.scores);
    } catch (error) {
      onStatus(message(error));
    }
  }

  function selectRecipe(recipe: CatalogRecipe) {
    setDraft(structuredClone(recipe));
    setSelectedTags(new Set(recipe.tags.map((tag) => tag.slug)));
    setSourceInput("");
    setActionFeedback(null);
    void loadOptimizationScores(recipe.id);
  }

  async function recalculateOptimization() {
    let recipe = draft;
    if (!recipe.id) {
      const saved = await save("draft");
      if (!saved) return;
      recipe = saved;
    }
    setBusy("optimization");
    try {
      const data = await api(`/admin/catalog/recipes/${recipe.id}/optimization`, { method: "POST" }) as { scores: OptimizationScore[] };
      setOptimizationScores(data.scores);
      setDraft((current) => ({ ...current, optimizationStatus: "ready" }));
      onStatus(`Calculated ${data.scores.length} optimization scores.`);
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function updateOptimizationFilter(filter: OptimizationFilter, change: Partial<OptimizationFilter>) {
    setBusy("filters");
    try {
      const data = await api(`/admin/catalog/filters/${filter.id}`, { method: "PATCH", body: JSON.stringify(change) }) as { filter: OptimizationFilter };
      setOptimizationFilters((current) => current.map((item) => item.id === filter.id ? data.filter : item));
      onStatus(`${data.filter.label} updated. Recipe scores are queued when its formula changes.`);
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function overrideOptimizationScore(score: OptimizationScore) {
    if (!draft.id) return;
    const entered = window.prompt(`Exceptional override for ${score.label}: enter a score from 0–100.`, String(Math.round(score.score)));
    if (entered === null) return;
    const reason = window.prompt("Explain why the calculated score should be overridden. This is saved in the audit fields.", score.overrideReason ?? "");
    if (reason === null) return;
    setBusy("optimization");
    try {
      await api(`/admin/catalog/recipes/${draft.id}/optimization/${score.filterID}/override`, { method: "PUT", body: JSON.stringify({ score: Number(entered), reason }) });
      await loadOptimizationScores(draft.id);
      onStatus(`${score.label} now has a clearly marked manual override.`);
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function clearOptimizationOverride(score: OptimizationScore) {
    if (!draft.id) return;
    setBusy("optimization");
    try {
      await api(`/admin/catalog/recipes/${draft.id}/optimization/${score.filterID}/override`, { method: "DELETE" });
      await loadOptimizationScores(draft.id);
      onStatus(`${score.label} is using its calculated score again.`);
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function analyzeSource() {
    if (!sourceInput.trim()) {
      onStatus(sourceMode === "ai" ? "Describe the recipe you want." : "Add a URL or recipe text first.");
      return;
    }
    setBusy("source");
    try {
      let imported: ImportedRecipe;
      if (sourceMode === "ai") {
        const data = await api("/admin/catalog/recipes/generate", {
          method: "POST",
          body: JSON.stringify({ brief: sourceInput }),
        }) as { recipe: ImportedRecipe };
        imported = data.recipe;
      } else {
        const data = await api("/recipe/import/analyze", {
          method: "POST",
          body: JSON.stringify({
            text: sourceMode === "text" ? sourceInput : "",
            urls: sourceMode === "url" ? [sourceInput] : [],
            images: [],
          }),
        }) as ImportedRecipe;
        imported = data;
      }
      setDraft((current) => mergeImport(current, imported, sourceMode));
      onStatus(`Built an editable draft for ${imported.title}. Review it before publishing.`);
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function save(nextStatus: CatalogRecipe["status"] = draft.status) {
    if (nextStatus === "published" && publishIssues.length > 0) {
      const requirementCount = publishIssues.length;
      const feedback = `${requirementCount} publish ${requirementCount === 1 ? "requirement is" : "requirements are"} still incomplete. Review the checklist beside the Publish button.`;
      setActionFeedback({ kind: "error", message: feedback });
      onStatus(feedback);
      return null;
    }
    setBusy("save");
    try {
      const body = JSON.stringify({ ...draft, status: nextStatus, expectedVersion: draft.version });
      const data = draft.id
        ? await api(`/admin/catalog/recipes/${draft.id}`, { method: "PATCH", body }) as { recipe: CatalogRecipe }
        : await api("/admin/catalog/recipes", { method: "POST", body }) as { recipe: CatalogRecipe };
      setDraft(data.recipe);
      setSelectedTags(new Set(data.recipe.tags.map((tag) => tag.slug)));
      setRecipes((current) => [data.recipe, ...current.filter((item) => item.id !== data.recipe.id)]);
      const feedback = data.recipe.status === "published"
        ? `${data.recipe.title} is published and available to the meal generator.`
        : `${data.recipe.title} saved as ${data.recipe.status}.`;
      setActionFeedback({ kind: "success", message: feedback });
      onStatus(feedback);
      return data.recipe;
    } catch (error) {
      const feedback = message(error);
      setActionFeedback({ kind: "error", message: feedback });
      onStatus(feedback);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function classify() {
    let recipe = draft;
    if (!recipe.id) {
      const saved = await save("draft");
      if (!saved) return;
      recipe = saved;
    }
    setBusy("tags");
    try {
      const data = await api(`/admin/catalog/recipes/${recipe.id}/classify`, { method: "POST" }) as {
        tags: TagAssignment[];
        taggingStatus: CatalogRecipe["taggingStatus"];
      };
      setDraft((current) => ({ ...current, tags: data.tags, taggingStatus: data.taggingStatus }));
      setSelectedTags(new Set(data.tags.map((tag) => tag.slug)));
      onStatus(`Suggested ${data.tags.length} tags. Review and pin the final selection.`);
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function pinTags() {
    if (!draft.id) return onStatus("Save the recipe before pinning tags.");
    setBusy("tags");
    try {
      const data = await api(`/admin/catalog/recipes/${draft.id}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tagSlugs: [...selectedTags] }),
      }) as { tags: TagAssignment[]; taggingStatus: CatalogRecipe["taggingStatus"] };
      setDraft((current) => ({ ...current, tags: data.tags, taggingStatus: data.taggingStatus }));
      onStatus("The selected tags are now locked as editorial choices.");
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function generateImage() {
    let recipe = draft;
    if (!recipe.id) {
      const saved = await save("draft");
      if (!saved) return;
      recipe = saved;
    }
    setBusy("image");
    try {
      const data = await api(`/admin/catalog/recipes/${recipe.id}/image`, { method: "POST" }) as { imageURL: string };
      setDraft((current) => ({ ...current, imageURL: data.imageURL, imageAltText: current.imageAltText || current.title }));
      onStatus("Generated and stored a new catalog image.");
    } catch (error) {
      onStatus(message(error));
    } finally {
      setBusy(null);
    }
  }

  function toggleTag(slug: string) {
    setSelectedTags((current) => {
      const next = new Set(current);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  return (
    <section className="admin-panel recipe-catalog-panel">
      <div className="image-list-header">
        <div>
          <p className="eyebrow">First-party catalog</p>
          <h2>Recipe studio</h2>
          <p className="admin-panel-description">Import, generate, tag, review, and publish recipes for meal generation.</p>
        </div>
        <div className="image-actions">
          <button className="button button-secondary" type="button" onClick={() => { setDraft(emptyRecipe()); setSelectedTags(new Set()); setActionFeedback(null); }}>New recipe</button>
          <button className="button button-secondary" type="button" disabled={busy === "load"} onClick={() => loadRecipes()}>Refresh</button>
        </div>
      </div>

      <div className="recipe-catalog-workspace">
        <aside className="recipe-catalog-sidebar">
          <div className="recipe-catalog-filters">
            <input type="search" value={query} placeholder="Search recipes" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadRecipes(); }} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All states</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select>
          </div>
          <div className="recipe-catalog-list">
            {recipes.length === 0 ? <p className="admin-empty-state">No catalog recipes yet.</p> : null}
            {recipes.map((recipe) => (
              <button className={`recipe-catalog-list-item ${draft.id === recipe.id ? "is-selected" : ""}`} type="button" key={recipe.id} onClick={() => selectRecipe(recipe)}>
                <span>{recipe.title}</span><small>{recipe.status} · {recipe.caloriesPerServing} cal</small>
              </button>
            ))}
            {hasMore ? <button className="button button-secondary" type="button" disabled={busy === "load"} onClick={() => loadRecipes(true)}>{busy === "load" ? "Loading…" : "Load more"}</button> : null}
          </div>
        </aside>

        <div className="recipe-catalog-editor">
          <section className="recipe-source-builder">
            <div className="recipe-source-tabs" role="tablist" aria-label="Recipe source">
              {(["url", "text", "ai"] as const).map((mode) => (
                <button type="button" role="tab" aria-selected={sourceMode === mode} className={sourceMode === mode ? "is-selected" : ""} key={mode} onClick={() => setSourceMode(mode)}>
                  {mode === "url" ? "Import URL" : mode === "text" ? "Paste text" : "Generate with AI"}
                </button>
              ))}
            </div>
            <textarea value={sourceInput} rows={sourceMode === "url" ? 2 : 5} placeholder={sourcePlaceholder(sourceMode)} onChange={(event) => setSourceInput(event.target.value)} />
            <button className="button button-secondary" type="button" disabled={busy === "source"} onClick={analyzeSource}>{busy === "source" ? "Building draft…" : "Build editable draft"}</button>
          </section>

          <div className="recipe-editor-heading">
            <div><span className={`recipe-status recipe-status-${draft.status}`}>{draft.status}</span><span className="recipe-status">tags: {draft.taggingStatus.replace("_", " ")}</span><span className="recipe-status">scores: {draft.optimizationStatus}</span></div>
            <strong>{draft.id ? `v${draft.version}` : "Unsaved"}</strong>
          </div>

          <div className="recipe-form-grid">
            <Field label="Title" wide><input type="text" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="Summary" wide><textarea rows={3} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></Field>
            <Field label="Source URL" wide><input type="url" value={draft.sourceURL} onChange={(event) => setDraft({ ...draft, sourceURL: event.target.value })} /></Field>
            <Field label="Attribution"><input type="text" value={draft.sourceAttribution} onChange={(event) => setDraft({ ...draft, sourceAttribution: event.target.value })} /></Field>
            <Field label="Rights status"><select value={draft.rightsStatus} onChange={(event) => setDraft({ ...draft, rightsStatus: event.target.value as CatalogRecipe["rightsStatus"] })}><option value="pending">Pending review</option><option value="owned">Owned</option><option value="licensed">Licensed</option><option value="public_domain">Public domain</option><option value="reviewed">Reviewed</option></select></Field>
            <Field label="Portions"><NumberInput value={draft.servings} min={1} onChange={(servings) => setDraft({ ...draft, servings })} /></Field>
            <Field label="Portion description"><input type="text" value={draft.portionDescription} onChange={(event) => setDraft({ ...draft, portionDescription: event.target.value })} /></Field>
            <Field label="Prep minutes"><NumberInput value={draft.prepMinutes} onChange={(prepMinutes) => setDraft({ ...draft, prepMinutes })} /></Field>
            <Field label="Cook minutes"><NumberInput value={draft.cookMinutes} onChange={(cookMinutes) => setDraft({ ...draft, cookMinutes })} /></Field>
          </div>

          <fieldset className="recipe-choice-fieldset"><legend>Meal types</legend><div className="recipe-checkbox-row">
            {mealTypes.map((type) => <label key={type}><input type="checkbox" checked={draft.mealTypes.includes(type)} onChange={() => setDraft({ ...draft, mealTypes: draft.mealTypes.includes(type) ? draft.mealTypes.filter((item) => item !== type) : [...draft.mealTypes, type] })} />{type}</label>)}
          </div></fieldset>

          <div className="recipe-macro-grid">
            {(["caloriesPerServing", "proteinPerServing", "carbsPerServing", "fiberPerServing", "sugarPerServing", "fatPerServing"] as const).map((key) => <Field label={macroLabel(key)} key={key}><NumberInput value={draft[key]} onChange={(value) => setDraft({ ...draft, [key]: value })} /></Field>)}
          </div>

          <details className="recipe-advanced-nutrition">
            <summary>Advanced nutrition inputs</summary>
            <p>Optional per-serving values improve score confidence. Leave unknown values blank—blank is different from zero.</p>
            <div className="recipe-macro-grid">
              {advancedNutritionFields.map(({ key, label }) => <Field label={label} key={key}><NullableNumberInput value={draft[key]} onChange={(value) => setDraft({ ...draft, [key]: value })} /></Field>)}
            </div>
          </details>

          <Field label="Ingredients — quantity | ingredient | calories" wide><textarea rows={9} value={ingredientsText(draft.ingredients)} onChange={(event) => setDraft({ ...draft, ingredients: parseIngredients(event.target.value) })} placeholder="1 lb | chicken breast | 750" /></Field>
          <Field label="Instructions — one step per line" wide><textarea rows={8} value={draft.instructions.map((item) => item.text).join("\n")} onChange={(event) => setDraft({ ...draft, instructions: parseInstructions(event.target.value) })} /></Field>
          <div className="recipe-form-grid">
            <Field label="Image URL" wide><input type="url" value={draft.imageURL ?? ""} onChange={(event) => setDraft({ ...draft, imageURL: event.target.value || null })} /></Field>
            <Field label="Image description" wide><input type="text" value={draft.imageAltText} onChange={(event) => setDraft({ ...draft, imageAltText: event.target.value })} /></Field>
            <Field label="Editorial priority"><NumberInput value={draft.editorialPriority} min={-100} onChange={(editorialPriority) => setDraft({ ...draft, editorialPriority })} /></Field>
            <div className="recipe-image-action"><button className="button button-secondary" type="button" disabled={busy === "image" || !draft.title.trim()} onClick={generateImage}>{busy === "image" ? "Generating image…" : "Generate catalog image"}</button></div>
          </div>
          {draft.imageURL ? <img className="recipe-image-preview" src={draft.imageURL} alt={draft.imageAltText || draft.title} /> : null}
          <Field label="Notes" wide><textarea rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>

          <section className="recipe-tag-editor">
            <div className="recipe-tag-heading"><div><h3>Classification</h3><p>Rule tags recalculate automatically. Pinning makes selected AI tags editorial choices.</p></div><div className="image-actions"><button className="button button-secondary" type="button" disabled={busy === "tags"} onClick={classify}>Suggest with AI</button><button className="button button-secondary" type="button" disabled={busy === "tags" || !draft.id} onClick={pinTags}>Pin selection</button></div></div>
            {groupedTags.map(([category, categoryTags]) => <fieldset className="recipe-choice-fieldset" key={category}><legend>{category}</legend><div className="recipe-tag-grid">
              {categoryTags.map((tag) => { const assignment = draft.tags.find((item) => item.slug === tag.slug); return <label className="recipe-tag-option" key={tag.slug} title={tag.description}><input type="checkbox" checked={selectedTags.has(tag.slug)} disabled={tag.assignmentMode === "rule" && Boolean(assignment)} onChange={() => toggleTag(tag.slug)} /><span><strong>{tag.displayName}</strong><small>{assignment?.source ?? tag.assignmentMode}{assignment?.confidence != null ? ` · ${Math.round(assignment.confidence * 100)}%` : ""}{tag.requiresReview ? " · review" : ""}</small></span></label>; })}
            </div></fieldset>)}
          </section>

          <section className="recipe-optimization-editor">
            <div className="recipe-tag-heading">
              <div><h3>Recipe optimization</h3><p>Versioned scores are calculated from nutrition, ingredients, and preparation data. Confidence reflects available inputs; overrides are exceptional and visibly marked.</p></div>
              <button className="button button-secondary" type="button" disabled={busy === "optimization" || !draft.title.trim()} onClick={recalculateOptimization}>{busy === "optimization" ? "Calculating…" : "Recalculate scores"}</button>
            </div>

            {optimizationScores.length ? <div className="recipe-optimization-top">
              {optimizationScores.slice(0, 6).map((score) => <article key={score.filterID} className={`recipe-score-card ${score.isOverridden ? "is-overridden" : ""}`}>
                <div><strong>{score.label}</strong><span>{Math.round(score.score)}</span></div>
                <small>{Math.round(score.confidence * 100)}% confidence · v{score.scoringVersion}{score.isOverridden ? " · manual override" : ""}</small>
                {score.reasons.length ? <ul>{score.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>No strong reason codes with current inputs.</p>}
                <details><summary>Inputs & calculation</summary><pre>{JSON.stringify({ calculatedScore: score.calculatedScore, inputs: score.inputs, overrideReason: score.overrideReason }, null, 2)}</pre></details>
                <div className="recipe-score-actions"><button type="button" onClick={() => overrideOptimizationScore(score)}>Override</button>{score.isOverridden ? <button type="button" onClick={() => clearOptimizationOverride(score)}>Clear override</button> : null}</div>
              </article>)}
            </div> : <p className="admin-empty-state">Save the recipe, then calculate scores to preview its strongest goals.</p>}

            <div className="recipe-filter-manager-heading">
              <div><h4>Filter management</h4><p>{optimizationFilters.length} canonical filters in one database-backed taxonomy.</p></div>
              <div className="recipe-catalog-filters"><input type="search" value={optimizationQuery} placeholder="Search filters" onChange={(event) => setOptimizationQuery(event.target.value)} /><select value={optimizationCategory} onChange={(event) => setOptimizationCategory(event.target.value)}><option value="all">All categories</option>{optimizationCategories.map((category) => <option value={category} key={category}>{optimizationCategoryLabel(category)}</option>)}</select></div>
            </div>
            <div className="recipe-filter-manager">
              {visibleOptimizationFilters.map((filter) => { const score = scoresByFilter.get(filter.id); return <details className="recipe-filter-row" key={filter.id}>
                <summary><span><strong>{filter.label}</strong><small>{optimizationCategoryLabel(filter.category)} · {filter.scoringMode} · v{filter.scoringVersion}</small></span><b>{score ? Math.round(score.score) : "—"}</b></summary>
                <p>{filter.description}</p>
                <div className="recipe-filter-toggles"><label><input type="checkbox" checked={filter.isActive} disabled={busy === "filters"} onChange={(event) => updateOptimizationFilter(filter, { isActive: event.target.checked })} />Active</label><label><input type="checkbox" checked={filter.isUserFacing} disabled={busy === "filters"} onChange={(event) => updateOptimizationFilter(filter, { isUserFacing: event.target.checked })} />User-facing</label></div>
                <pre>{JSON.stringify({ scoringDefinition: filter.scoringDefinition, minimumNutritionDataRequired: filter.minimumNutritionDataRequired }, null, 2)}</pre>
                {score ? <p><strong>{Math.round(score.confidence * 100)}% confidence.</strong> {score.reasons.join(" · ") || "No strong reason codes."}</p> : null}
              </details>; })}
            </div>
          </section>

          <div className="recipe-publish-dock">
            <div className={`recipe-publish-readiness ${publishIssues.length ? "is-blocked" : "is-ready"}`}>
              <strong>{publishIssues.length ? `${publishIssues.length} ${publishIssues.length === 1 ? "requirement" : "requirements"} before publishing` : "Ready to publish"}</strong>
              {publishIssues.length ? <ul>{publishIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <span>Publishing will make this recipe available to the meal generator.</span>}
            </div>
            {actionFeedback ? <p className={`recipe-action-feedback is-${actionFeedback.kind}`} role={actionFeedback.kind === "error" ? "alert" : "status"}>{actionFeedback.message}</p> : null}
            <div className="recipe-editor-actions"><button className="button button-secondary" type="button" disabled={busy === "save"} onClick={() => save("draft")}>Save draft</button>{draft.id && draft.status !== "archived" ? <button className="button button-secondary button-danger" type="button" disabled={busy === "save"} onClick={() => save("archived")}>Archive</button> : null}<button className="button button-primary" type="button" disabled={busy === "save"} onClick={() => save("published")}>{busy === "save" ? "Saving…" : "Publish"}</button></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={`recipe-field ${wide ? "recipe-field-wide" : ""}`}><span>{label}</span>{children}</label>;
}

function NumberInput({ value, min = 0, onChange }: { value: number; min?: number; onChange: (value: number) => void }) {
  return <input type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />;
}

function NullableNumberInput({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return <input type="number" min={0} step="any" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0))} />;
}

function emptyRecipe(): CatalogRecipe {
  return { id: "", slug: "", status: "draft", title: "", summary: "", sourceType: "manual", sourceURL: "", sourceAttribution: "", rightsStatus: "pending", mealTypes: [], servings: 1, portionDescription: "", prepMinutes: 0, cookMinutes: 0, caloriesPerServing: 0, proteinPerServing: 0, carbsPerServing: 0, fiberPerServing: 0, sugarPerServing: 0, fatPerServing: 0, addedSugarPerServing: null, saturatedFatPerServing: null, sodiumMgPerServing: null, cholesterolMgPerServing: null, potassiumMgPerServing: null, calciumMgPerServing: null, ironMgPerServing: null, magnesiumMgPerServing: null, zincMgPerServing: null, seleniumMcgPerServing: null, vitaminAMcgPerServing: null, vitaminCMgPerServing: null, vitaminDMcgPerServing: null, vitaminEMgPerServing: null, vitaminKMcgPerServing: null, folateMcgPerServing: null, omega3GPerServing: null, servingWeightGrams: null, ingredients: [], instructions: [], notes: "", imageURL: null, imageAltText: "", editorialPriority: 0, taggingStatus: "pending", optimizationStatus: "pending", version: 1, tags: [] };
}

function mergeImport(current: CatalogRecipe, imported: ImportedRecipe, mode: "url" | "text" | "ai"): CatalogRecipe {
  return { ...current, title: imported.title, sourceType: imported.sourceType ?? mode, sourceURL: imported.sourceURL ?? (mode === "url" ? current.sourceURL : ""), servings: imported.servings || 1, portionDescription: imported.portionDescription ?? "", prepMinutes: imported.prepMinutes || 0, cookMinutes: imported.cookMinutes || 0, caloriesPerServing: imported.caloriesPerServing || 0, proteinPerServing: imported.proteinPerServing || 0, carbsPerServing: imported.carbsPerServing || 0, fiberPerServing: imported.fiberPerServing || 0, sugarPerServing: imported.sugarPerServing || 0, fatPerServing: imported.fatPerServing || 0, ingredients: imported.ingredients.map((item) => ({ id: item.id, text: item.text ?? item.name ?? "", quantity: item.quantity ?? "", calories: item.calories ?? 0 })), instructions: imported.instructions.map((item) => ({ id: typeof item === "string" ? undefined : item.id, text: typeof item === "string" ? item : item.text })), notes: imported.notes ?? "" };
}

function ingredientsText(ingredients: Ingredient[]) { return ingredients.map((item) => `${item.quantity} | ${item.text} | ${item.calories}`).join("\n"); }
function parseIngredients(value: string): Ingredient[] { return value.split("\n").map((line) => { const [quantity = "", text = "", calories = "0"] = line.split("|").map((part) => part.trim()); return { quantity, text, calories: Math.max(0, Number(calories) || 0) }; }); }
function parseInstructions(value: string): Instruction[] { return value.split("\n").map((text) => ({ text })); }
function sourcePlaceholder(mode: "url" | "text" | "ai") { return mode === "url" ? "https://example.com/recipe" : mode === "text" ? "Paste ingredients, instructions, notes, or recipe copy…" : "A high-protein weeknight dinner under 500 calories with Mediterranean flavors…"; }
function message(error: unknown) { return error instanceof Error ? error.message : "The recipe request failed."; }
function publicationIssues(recipe: CatalogRecipe) {
  const issues: string[] = [];
  if (recipe.rightsStatus === "pending") issues.push("Choose a reviewed rights status.");
  if (recipe.mealTypes.length === 0) issues.push("Select at least one meal type.");
  if (!recipe.ingredients.some((ingredient) => ingredient.text.trim())) issues.push("Add at least one ingredient.");
  if (!recipe.instructions.some((instruction) => instruction.text.trim())) issues.push("Add at least one instruction.");
  if (recipe.caloriesPerServing <= 0) issues.push("Add calories per serving.");
  if (recipe.taggingStatus !== "ready") issues.push("Review the suggested classification, then pin the selection.");
  if (!recipe.imageURL?.trim()) issues.push("Add or generate a recipe image.");
  return issues;
}
function macroLabel(key: string) { return ({ caloriesPerServing: "Calories", proteinPerServing: "Protein g", carbsPerServing: "Carbs g", fiberPerServing: "Fiber g", sugarPerServing: "Sugar g", fatPerServing: "Fat g" } as Record<string, string>)[key]; }
function optimizationCategoryLabel(category: string) { return category.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" & "); }
