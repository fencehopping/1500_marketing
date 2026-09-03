import assert from "node:assert/strict";
import worker from "../worker/admin-api.mjs";

const originalFetch = globalThis.fetch;

const taxonomyRows = [
  row("cat-food", "food", "Food", "", 1, 2),
  row("cat-water", "water", "Water", "", 1, 1),
  row("water-storage", "storage", "Storage", "cat-water", 2, 2),
  row("water-filters", "filters", "Filters", "cat-water", 2, 1, {
    description: "Filters, pumps, and purifier bottles",
  }),
  row("gravity-filter", "gravity-filter", "Gravity Filter", "water-filters", 3, 1, {
    description: "Handles commas, \"quotes\", and\nline breaks",
    image_asset_id: "water-filtration-gravity-water-filter-bag",
    affiliate_query: "gravity water filter",
  }),
  row("rice-bag", "rice-bag", "Rice Bag", "cat-food", 2, 1),
];

const aiFoodRows = [
  {
    id: "ai-food-1",
    parent_external_id: "scrambled-eggs-with-butter",
    canonical_name: "Scrambled eggs with butter",
    display_name: "Scrambled eggs with butter",
    serving_description: "2 large eggs with 1 teaspoon butter",
    calories: 180,
    protein: 13,
    carbs: 1,
    fiber: 0,
    sugar: 0,
    fat: 14,
    image_name: null,
    use_count: 2,
    created_at: "2026-08-31T12:00:00Z",
    updated_at: "2026-08-31T12:00:00Z",
  },
  {
    id: "ai-food-2",
    parent_external_id: "scrambled-eggs-with-butter",
    canonical_name: "Scrambled eggs with butter",
    display_name: "Scrambled eggs with butter",
    serving_description: "3 eggs",
    calories: 250,
    protein: 19,
    carbs: 2,
    fiber: 0,
    sugar: 0,
    fat: 19,
    image_name: null,
    use_count: 1,
    created_at: "2026-09-01T12:00:00Z",
    updated_at: "2026-09-01T12:00:00Z",
  },
  {
    id: "ai-food-3",
    parent_external_id: "small-latte",
    canonical_name: "Small latte",
    display_name: "Small latte",
    serving_description: "8 fl oz",
    calories: 120,
    protein: 6,
    carbs: 10,
    fiber: 0,
    sugar: 9,
    fat: 6,
    image_name: "latte",
    use_count: 1,
    created_at: "2026-08-30T12:00:00Z",
    updated_at: "2026-08-30T12:00:00Z",
  },
];

const env = {
  ALLOWED_ORIGINS: "https://fifteenhundred.app,http://localhost:5173",
  ALLOWED_ADMIN_EMAIL: "nickholroyd@gmail.com",
  GOOGLE_CLIENT_ID: "test-client-id",
  IMAGES_BUCKET: createFakeBucket({
    "images/apple.png": {
      body: new Uint8Array([137, 80, 78, 71, 1]),
      customMetadata: { keyword: "apple" },
    },
    "images/banana.jpg": {
      body: new Uint8Array([255, 216, 255, 2]),
      customMetadata: { keyword: "banana" },
    },
  }),
  PUBLIC_IMAGES_BASE_URL: "https://cdn.example.test/images",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  TAXONOMY_TABLE_NAME: "prep_taxonomy",
  OPENAI_API_KEY: "test-openai-key",
};

try {
  await rejectsMissingAuth();
  await analyzesFlexibleRecipeInput();
  await analyzesMealFromTextAndPhoto();
  await loadsXRecipeMetadata();
  await analyzesXRecipeVideo();
  await generatesRecipeNutrition();
  await generatesRecipeImage();
  await uploadsRecipeImage();
  await managesCatalogRecipes();
  await scansAccountRecipesForAutomaticTagging();
  await exportsCsv();
  await listsAndExportsAIFoodCatalog();
  await createsOneTimeImageZipLink();
  console.log("admin-api smoke tests passed");
} finally {
  globalThis.fetch = originalFetch;
}

async function scansAccountRecipesForAutomaticTagging() {
  let requestedURL;
  globalThis.fetch = async (url) => {
    requestedURL = new URL(String(url));
    return Response.json([]);
  };

  let scheduledWork;
  await worker.scheduled({}, env, {
    waitUntil(promise) {
      scheduledWork = promise;
    },
  });
  await scheduledWork;

  assert.equal(requestedURL.pathname, "/rest/v1/catalog_recipes");
  assert.equal(requestedURL.searchParams.get("status"), "eq.draft");
  assert.equal(requestedURL.searchParams.get("tagging_status"), "eq.pending");
  assert.equal(requestedURL.searchParams.get("source_shared_recipe_id"), "not.is.null");
}

async function analyzesMealFromTextAndPhoto() {
  const estimate = {
    mealName: "Eggs, Toast, and Latte",
    summary: "A breakfast estimate using the described butter and visible portions.",
    confidence: "medium",
    items: [
      {
        name: "Scrambled eggs with butter",
        quantityDescription: "2 large eggs with 1 teaspoon butter",
        calories: 180,
        protein: 13,
        carbs: 1,
        fiber: 0,
        sugar: 0,
        fat: 14,
        confidence: "high",
        assumption: "Used the stated two eggs and a typical teaspoon of butter.",
      },
      {
        name: "Sourdough toast",
        quantityDescription: "1 medium slice",
        calories: 130,
        protein: 5,
        carbs: 25,
        fiber: 1,
        sugar: 1,
        fat: 1,
        confidence: "medium",
        assumption: "Estimated a medium bakery-style slice.",
      },
    ],
  };
  let responseRequestBody;
  globalThis.fetch = async (url, options) => {
    if (String(url) === "https://example.supabase.co/auth/v1/user") {
      assert.equal(options.headers.Authorization, "Bearer test-user-token");
      assert.equal(options.headers.apikey, "test-service-role-key");
      return Response.json({ id: "3d794540-8e74-4fb0-8205-aaf680bd44bc" });
    }
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer test-openai-key");
    responseRequestBody = JSON.parse(options.body);
    return Response.json({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(estimate) }] }],
    });
  };

  const response = await worker.fetch(
    new Request("https://worker.test/meal/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-user-token",
      },
      body: JSON.stringify({
        description: "Two scrambled eggs cooked in butter, sourdough toast, and a small latte.",
        image: `${"1".repeat(120)}==`,
      }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), estimate);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(responseRequestBody.model, "gpt-5.4-mini");
  assert.equal(responseRequestBody.store, false);
  assert.equal(responseRequestBody.safety_identifier, "3d794540-8e74-4fb0-8205-aaf680bd44bc");
  assert.equal(responseRequestBody.text.format.type, "json_schema");
  assert.equal(responseRequestBody.text.format.strict, true);
  assert.equal(responseRequestBody.input[0].content.filter((item) => item.type === "input_image").length, 1);
  assert.match(responseRequestBody.input[0].content[0].text, /Two scrambled eggs/);

  const emptyResponse = await worker.fetch(
    new Request("https://worker.test/meal/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-user-token",
      },
      body: JSON.stringify({ description: "" }),
    }),
    env,
  );
  assert.equal(emptyResponse.status, 400);

  const unauthorizedResponse = await worker.fetch(
    new Request("https://worker.test/meal/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Toast" }),
    }),
    env,
  );
  assert.equal(unauthorizedResponse.status, 401);
}

async function analyzesFlexibleRecipeInput() {
  const recipe = {
    title: "Lemon Chicken Bowls",
    servings: 4,
    portionDescription: "1 bowl, about 2 cups",
    prepMinutes: 20,
    cookMinutes: 25,
    caloriesPerServing: 510,
    proteinPerServing: 42,
    carbsPerServing: 48,
    fiberPerServing: 7,
    sugarPerServing: 5,
    fatPerServing: 16,
    ingredients: [
      { name: "chicken breast", quantity: "1 1/2 pounds", calories: 1120 },
      { name: "cooked rice", quantity: "4 cups", calories: 820 },
    ],
    instructions: ["Season and cook the chicken.", "Divide rice and chicken among four bowls."],
    notes: "Finish with fresh lemon.",
  };
  let responseRequestBody;
  globalThis.fetch = async (url, options) => {
    if (String(url) === "https://example.com/lemon-chicken") {
      return new Response(`<!doctype html><html><head>
        <title>Lemon chicken bowls</title>
        <meta name="description" content="Bright meal prep bowls">
        </head><body><h1>Lemon Chicken</h1><p>Use 1 1/2 pounds chicken breast.</p>
        <li>4 cups cooked rice</li><p>Divide among four bowls.</p></body></html>`, {
        headers: { "Content-Type": "text/html" },
      });
    }
    if (String(url) === "https://api.openai.com/v1/responses") {
      responseRequestBody = JSON.parse(options.body);
      return Response.json({
        output: [{ content: [{ type: "output_text", text: JSON.stringify(recipe) }] }],
      });
    }
    throw new Error(`Unexpected fetch: ${String(url)}`);
  };

  const response = await worker.fetch(
    new Request("https://worker.test/recipe/import/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Make this high protein and keep the lemon garnish.",
        urls: ["https://example.com/lemon-chicken#ingredients"],
        images: [`${"1".repeat(120)}==`],
      }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ...recipe,
    sourceURL: "https://example.com/lemon-chicken",
  });
  const content = responseRequestBody.input[0].content;
  assert.equal(content.filter((item) => item.type === "input_image").length, 1);
  assert.match(content[0].text, /1 1\/2 pounds chicken breast/);
  assert.match(content[0].text, /Make this high protein/);
  assert.equal(responseRequestBody.text.format.strict, true);
}

async function loadsXRecipeMetadata() {
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://x.com/ShredHappens/status/2068340598558368252");
    assert.match(options.headers["User-Agent"], /Chrome/);
    return new Response(`<!doctype html><html><head>
      <link rel="preload" as="image" href="https://pbs.twimg.com/thumb.jpg?format=webp&amp;name=medium">
      <title>Shredhappens on X: &quot;150 calorie Chicken Summer Rolls&quot; / X</title>
      </head><body>
      https://video.twimg.com/media/vid/avc1/320x568/small.mp4?tag=27
      https://video.twimg.com/media/vid/avc1/480x852/medium.mp4?tag=27
      https://video.twimg.com/media/vid/avc1/720x1280/large.mp4?tag=27
      </body></html>`, { headers: { "Content-Type": "text/html" } });
  };

  const response = await worker.fetch(
    new Request("https://worker.test/recipe/import/social/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://x.com/ShredHappens/status/2068340598558368252?s=20",
      }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    sourceURL: "https://x.com/ShredHappens/status/2068340598558368252",
    caption: "150 calorie Chicken Summer Rolls",
    videoURL: "https://video.twimg.com/media/vid/avc1/480x852/medium.mp4?tag=27",
    thumbnailURL: "https://pbs.twimg.com/thumb.jpg?format=webp&name=medium",
  });
}

async function analyzesXRecipeVideo() {
  const recipe = {
    title: "Chicken Summer Rolls",
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 10,
    caloriesPerServing: 150,
    proteinPerServing: 18,
    carbsPerServing: 12,
    fiberPerServing: 2,
    sugarPerServing: 3,
    fatPerServing: 4,
    ingredients: ["8 rice paper wrappers", "1 pound cooked chicken breast"],
    instructions: ["Soften the wrappers.", "Fill and roll."],
    notes: "",
  };
  let responseRequestBody;
  globalThis.fetch = async (url, options) => {
    const requestURL = String(url);
    if (requestURL.startsWith("https://video.twimg.com/")) {
      return new Response(new Uint8Array(500), {
        headers: { "Content-Type": "video/mp4", "Content-Length": "500" },
      });
    }
    if (requestURL === "https://api.openai.com/v1/audio/transcriptions") {
      assert.equal(options.headers.Authorization, "Bearer test-openai-key");
      assert.ok(options.body instanceof FormData);
      return Response.json({ text: "Use eight wrappers and one pound of cooked chicken." });
    }
    if (requestURL === "https://api.openai.com/v1/responses") {
      responseRequestBody = JSON.parse(options.body);
      return Response.json({
        output: [{ content: [{ type: "output_text", text: JSON.stringify(recipe) }] }],
      });
    }
    throw new Error(`Unexpected fetch: ${requestURL}`);
  };

  const frames = Array.from({ length: 4 }, (_, index) => `${String(index + 1).repeat(120)}==`);
  const response = await worker.fetch(
    new Request("https://worker.test/recipe/import/social/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceURL: "https://x.com/ShredHappens/status/2068702982628147219",
        caption: "150 calorie Chicken Summer Rolls",
        videoURL: "https://video.twimg.com/media/vid/avc1/480x852/medium.mp4?tag=27",
        frames,
      }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ...recipe,
    sourceURL: "https://x.com/ShredHappens/status/2068702982628147219",
  });
  assert.equal(responseRequestBody.model, "gpt-5.4-mini");
  assert.equal(responseRequestBody.text.format.type, "json_schema");
  assert.equal(responseRequestBody.text.format.strict, true);
  assert.equal(responseRequestBody.input[0].content.filter((item) => item.type === "input_image").length, 4);
  assert.match(responseRequestBody.input[0].content[0].text, /eight wrappers and one pound/);
}

async function generatesRecipeImage() {
  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/images/generations");
    assert.equal(options.headers.Authorization, "Bearer test-openai-key");
    requestBody = JSON.parse(options.body);
    return Response.json({ data: [{ b64_json: "aGVsbG8=" }] });
  };

  const response = await worker.fetch(
    new Request("https://worker.test/recipe/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://fifteenhundred.app",
      },
      body: JSON.stringify({ title: "Lemon chicken quinoa" }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    imageBase64: "aGVsbG8=",
    mimeType: "image/png",
  });
  assert.equal(requestBody.model, "gpt-image-2");
  assert.equal(requestBody.size, "1024x1024");
  assert.equal(requestBody.quality, "medium");
  assert.equal(requestBody.background, "transparent");
  assert.equal(requestBody.output_format, "png");
  assert.match(requestBody.prompt, /Lemon chicken quinoa/);
  assert.match(requestBody.prompt, /high-resolution realistic studio product rendering/);
  assert.match(requestBody.prompt, /subtle isometric 3\/4 angle/);
  assert.match(requestBody.prompt, /no plate unless necessary/);
  assert.match(requestBody.prompt, /Transparent background\.$/);
  assert.doesNotMatch(requestBody.prompt, /https?:\/\//);
}

async function uploadsRecipeImage() {
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://example.supabase.co/auth/v1/user");
    assert.equal(options.headers.Authorization, "Bearer test-user-token");
    return Response.json({ id: "3d794540-8e74-4fb0-8205-aaf680bd44bc" });
  };

  const recipeId = "930e3084-d1bf-4f10-9dc1-da537769a8f1";
  const ownerId = "3d794540-8e74-4fb0-8205-aaf680bd44bc";
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const response = await worker.fetch(
    new Request("https://worker.test/recipe/image/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-user-token",
        Origin: "https://fifteenhundred.app",
      },
      body: JSON.stringify({
        recipeId,
        title: "Lemon chicken quinoa",
        imageBase64: Buffer.from(pngBytes).toString("base64"),
      }),
    }),
    env,
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const payload = await response.json();
  assert.match(
    payload.imageURL,
    new RegExp(`^https://cdn\\.example\\.test/images/recipes/${ownerId}/${recipeId}\\.png\\?v=\\d+$`),
  );
  const stored = await env.IMAGES_BUCKET.get(`images/recipes/${ownerId}/${recipeId}.png`);
  assert.ok(stored);
  assert.deepEqual(new Uint8Array(await stored.arrayBuffer()), pngBytes);
}

async function generatesRecipeNutrition() {
  const nutrition = {
    caloriesPerServing: 420,
    proteinPerServing: 32,
    carbsPerServing: 38,
    fiberPerServing: 7,
    sugarPerServing: 6,
    fatPerServing: 16,
    ingredientCalories: [750, 440, 120],
  };
  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer test-openai-key");
    requestBody = JSON.parse(options.body);
    return Response.json({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(nutrition) }] }],
    });
  };

  const response = await worker.fetch(
    new Request("https://worker.test/recipe/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Lemon chicken quinoa",
        servings: 4,
        ingredients: ["1 pound chicken breast", "2 cups cooked quinoa", "1 tablespoon olive oil"],
        instructions: ["Cook the chicken in the olive oil and serve over quinoa."],
      }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), nutrition);
  assert.equal(requestBody.model, "gpt-5.4-mini");
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.equal(requestBody.text.format.strict, true);
  assert.deepEqual(Object.keys(requestBody.text.format.schema.properties), Object.keys(nutrition));
  assert.match(requestBody.input[0].content[0].text, /Lemon chicken quinoa/);
  assert.match(requestBody.input[0].content[0].text, /"servings":4/);
  assert.match(requestBody.input[0].content[0].text, /1 tablespoon olive oil/);
  assert.match(requestBody.input[0].content[0].text, /exactly the same order/);
  assert.match(requestBody.input[0].content[0].text, /greater than zero/);
}

async function managesCatalogRecipes() {
  const recipeID = "930e3084-d1bf-4f10-9dc1-da537769a8f1";
  const tagRows = [
    {
      id: "630e3084-d1bf-4f10-9dc1-da537769a8f1",
      slug: "high-protein",
      display_name: "High protein",
      category: "nutrition",
      description: "At least 25 grams of protein per serving.",
      assignment_mode: "rule",
      requires_review: false,
      is_active: true,
      sort_order: 10,
    },
    {
      id: "730e3084-d1bf-4f10-9dc1-da537769a8f1",
      slug: "meal-prep-friendly",
      display_name: "Meal prep friendly",
      category: "practical",
      description: "Stores and portions well.",
      assignment_mode: "ai",
      requires_review: false,
      is_active: true,
      sort_order: 20,
    },
    {
      id: "830e3084-d1bf-4f10-9dc1-da537769a8f1",
      slug: "steady-energy",
      display_name: "Steady energy",
      category: "wellness",
      description: "Balances protein, fiber, and minimally refined carbohydrates.",
      assignment_mode: "ai",
      requires_review: true,
      is_active: true,
      sort_order: 10,
    },
  ];
  let recipeRow;
  let assignments = [];
  let taggingRequest;
  globalThis.fetch = async (url, options = {}) => {
    const requestURL = new URL(String(url));
    if (requestURL.hostname === "oauth2.googleapis.com") {
      return Response.json({ email: "nickholroyd@gmail.com", email_verified: "true", aud: "test-client-id" });
    }
    if (String(url) === "https://api.openai.com/v1/images/generations") {
      return Response.json({ data: [{ b64_json: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64") }] });
    }
    if (String(url) === "https://api.openai.com/v1/responses") {
      taggingRequest = JSON.parse(options.body);
      return Response.json({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          tags: [
            { slug: "meal-prep-friendly", confidence: 91, evidence: ["Makes four portioned bowls"] },
            { slug: "steady-energy", confidence: 88, evidence: ["Chicken and quinoa provide protein and fiber-rich carbohydrate"] },
          ],
        }) }] }],
      });
    }
    if (requestURL.pathname === "/rest/v1/catalog_recipes") {
      if (options.method === "POST") {
        recipeRow = {
          ...JSON.parse(options.body),
          tagging_status: "pending",
          tagging_model: null,
          tagging_prompt_version: null,
          version: 1,
          published_at: null,
          created_at: "2026-09-03T12:00:00Z",
          updated_at: "2026-09-03T12:00:00Z",
        };
        return Response.json([recipeRow], { status: 201 });
      }
      if (options.method === "PATCH") {
        recipeRow = { ...recipeRow, ...JSON.parse(options.body) };
        return options.headers.Prefer?.includes("return=representation")
          ? Response.json([recipeRow])
          : new Response(null, { status: 204 });
      }
      return Response.json(recipeRow ? [recipeRow] : []);
    }
    if (requestURL.pathname === "/rest/v1/catalog_recipe_versions") {
      return new Response(null, { status: 204 });
    }
    if (requestURL.pathname === "/rest/v1/catalog_tags") {
      return Response.json(tagRows);
    }
    if (requestURL.pathname === "/rest/v1/catalog_recipe_tags") {
      if (options.method === "DELETE") {
        assignments = [];
        return new Response(null, { status: 204 });
      }
      if (options.method === "POST") {
        assignments = JSON.parse(options.body);
        return new Response(null, { status: 204 });
      }
      return Response.json(assignments.map((assignment) => ({
        recipe_id: assignment.recipe_id,
        tag_id: assignment.tag_id,
        source: assignment.source,
        confidence: assignment.confidence,
        evidence: assignment.evidence,
        is_locked: assignment.is_locked,
        reviewed_at: null,
      })));
    }
    throw new Error(`Unexpected fetch: ${String(url)}`);
  };

  const headers = {
    Authorization: "Bearer valid-google-token",
    Origin: "https://fifteenhundred.app",
    "Content-Type": "application/json",
  };
  const createResponse = await worker.fetch(
    new Request("https://worker.test/admin/catalog/recipes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: recipeID,
        title: "Lemon Chicken Bowls",
        sourceType: "url",
        sourceURL: "https://example.com/lemon-chicken",
        rightsStatus: "reviewed",
        mealTypes: ["lunch", "dinner"],
        servings: 4,
        prepMinutes: 20,
        cookMinutes: 25,
        caloriesPerServing: 510,
        proteinPerServing: 42,
        carbsPerServing: 48,
        fiberPerServing: 7,
        sugarPerServing: 5,
        fatPerServing: 16,
        ingredients: [{ text: "chicken breast", quantity: "1 1/2 pounds", calories: 1120 }],
        instructions: [{ text: "Cook the chicken and divide among bowls." }],
      }),
    }),
    env,
  );
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.recipe.id, recipeID);
  assert.equal(created.recipe.title, "Lemon Chicken Bowls");
  assert.deepEqual(created.recipe.mealTypes, ["lunch", "dinner"]);
  assert.equal(created.recipe.version, 1);

  const forgedPublishResponse = await worker.fetch(
    new Request(`https://worker.test/admin/catalog/recipes/${recipeID}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        ...created.recipe,
        status: "published",
        expectedVersion: 1,
        taggingStatus: "ready",
        imageURL: "https://images.example/forged.png",
      }),
    }),
    env,
  );
  assert.equal(forgedPublishResponse.status, 400);

  const tagResponse = await worker.fetch(
    new Request(`https://worker.test/admin/catalog/recipes/${recipeID}/classify`, {
      method: "POST",
      headers,
    }),
    env,
  );
  assert.equal(tagResponse.status, 200);
  const tagged = await tagResponse.json();
  assert.deepEqual(tagged.tags.map((tag) => tag.slug), ["high-protein", "meal-prep-friendly", "steady-energy"]);
  assert.equal(tagged.taggingStatus, "needs_review");
  assert.equal(taggingRequest.text.format.type, "json_schema");
  assert.equal(taggingRequest.text.format.strict, true);
  assert.deepEqual(taggingRequest.text.format.schema.properties.tags.items.properties.slug.enum, ["meal-prep-friendly", "steady-energy"]);
  assert.match(taggingRequest.input[0].content[0].text, /controlled taxonomy/i);

  const pinResponse = await worker.fetch(
    new Request(`https://worker.test/admin/catalog/recipes/${recipeID}/tags`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ tagSlugs: ["high-protein", "meal-prep-friendly", "steady-energy"] }),
    }),
    env,
  );
  assert.equal(pinResponse.status, 200);
  assert.equal((await pinResponse.json()).taggingStatus, "ready");

  const imageResponse = await worker.fetch(
    new Request(`https://worker.test/admin/catalog/recipes/${recipeID}/image`, { method: "POST", headers }),
    env,
  );
  assert.equal(imageResponse.status, 201, await imageResponse.clone().text());
  const image = await imageResponse.json();
  assert.match(image.imageURL, new RegExp(`/catalog-recipes/${recipeID}\\.png\\?v=`));
  assert.ok(await env.IMAGES_BUCKET.get(`images/catalog-recipes/${recipeID}.png`));

  const publishResponse = await worker.fetch(
    new Request(`https://worker.test/admin/catalog/recipes/${recipeID}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        ...created.recipe,
        status: "published",
        expectedVersion: 1,
        taggingStatus: "ready",
        imageURL: image.imageURL,
      }),
    }),
    env,
  );
  assert.equal(publishResponse.status, 200);
  assert.equal((await publishResponse.json()).recipe.status, "published");
}

async function rejectsMissingAuth() {
  const response = await worker.fetch(new Request("https://worker.test/admin/export/taxonomy.csv"), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Missing Google token." });
}

async function exportsCsv() {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return Response.json({
        email: "nickholroyd@gmail.com",
        email_verified: "true",
        aud: "test-client-id",
      });
    }
    if (requestUrl.startsWith("https://example.supabase.co/rest/v1/prep_taxonomy")) {
      return Response.json(taxonomyRows);
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  const response = await worker.fetch(
    new Request("https://worker.test/admin/export/taxonomy.csv", {
      headers: {
        Authorization: "Bearer valid-google-token",
        Origin: "https://fifteenhundred.app",
      },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="prepper-taxonomy.csv"');

  const csv = await response.text();
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(
    lines[0],
    "id,slug,title,parent_id,parent_slug,level,sort_order,description,icon_asset_id,image_asset_id,affiliate_query,is_active,created_at,updated_at",
  );
  assert.equal(lines[1].split(",")[0], "cat-water");
  assert.equal(lines[2].split(",")[0], "water-filters");
  assert.equal(lines[3].split(",")[0], "gravity-filter");
  assert.equal(lines[4].split(",")[0], "water-storage");
  assert.equal(lines[5].split(",")[0], "cat-food");
  assert.match(csv, /gravity-filter,gravity-filter,Gravity Filter,water-filters,filters,3,1,/);
  assert.match(csv, /"Handles commas, ""quotes"", and\nline breaks"/);
  assert.match(csv, /water-filtration-gravity-water-filter-bag,gravity water filter,true,/);
}

async function listsAndExportsAIFoodCatalog() {
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return Response.json({
        email: "nickholroyd@gmail.com",
        email_verified: "true",
        aud: "test-client-id",
      });
    }
    if (requestUrl.startsWith("https://example.supabase.co/rest/v1/food_variants")) {
      const parsed = new URL(requestUrl);
      assert.equal(parsed.searchParams.get("parent_provider"), "eq.ai_meal_estimate");
      assert.equal(options.headers.Authorization, "Bearer test-service-role-key");
      assert.doesNotMatch(parsed.searchParams.get("select"), /owner_id/);
      return Response.json(aiFoodRows);
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  const headers = {
    Authorization: "Bearer valid-google-token",
    Origin: "https://fifteenhundred.app",
  };
  const listResponse = await worker.fetch(
    new Request("https://worker.test/admin/ai-food-catalog", { headers }),
    env,
  );
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("Cache-Control"), "no-store");
  const list = await listResponse.json();
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[0], {
    slug: "scrambled-eggs-with-butter",
    name: "Scrambled eggs with butter",
    suggestedKeyword: "scrambled eggs with butter",
    suggestedFilename: "scrambled-eggs-with-butter.png",
    exampleServing: "3 eggs",
    calories: 250,
    protein: 19,
    carbs: 2,
    fiber: 0,
    sugar: 0,
    fat: 19,
    catalogEntries: 2,
    totalUses: 3,
    currentImageName: "",
    firstAddedAt: "2026-08-31T12:00:00Z",
    lastAddedAt: "2026-09-01T12:00:00Z",
  });
  assert.equal("ownerID" in list.items[0], false);

  const csvResponse = await worker.fetch(
    new Request("https://worker.test/admin/export/ai-food-catalog.csv", { headers }),
    env,
  );
  assert.equal(csvResponse.status, 200);
  assert.equal(csvResponse.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(csvResponse.headers.get("Content-Disposition"), 'attachment; filename="1500-ai-food-catalog.csv"');
  const csv = await csvResponse.text();
  assert.match(csv, /^slug,name,suggested_keyword,suggested_filename,/);
  assert.match(csv, /scrambled-eggs-with-butter,Scrambled eggs with butter,scrambled eggs with butter,scrambled-eggs-with-butter.png/);
  assert.doesNotMatch(csv, /owner_id/);
}

async function createsOneTimeImageZipLink() {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return Response.json({
        email: "nickholroyd@gmail.com",
        email_verified: "true",
        aud: "test-client-id",
      });
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  const linkResponse = await worker.fetch(
    new Request("https://worker.test/admin/download-links?appId=1500", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-google-token",
        Origin: "https://fifteenhundred.app",
      },
    }),
    env,
  );

  assert.equal(linkResponse.status, 201);
  const link = await linkResponse.json();
  assert.equal(link.filename, "1500-images.zip");
  assert.match(link.url, /^https:\/\/worker\.test\/admin\/download\/images\.zip\?appId=1500&token=/);

  const zipResponse = await worker.fetch(
    new Request(link.url, {
      headers: {
        Origin: "https://fifteenhundred.app",
      },
    }),
    env,
  );

  assert.equal(zipResponse.status, 200);
  assert.equal(zipResponse.headers.get("Content-Type"), "application/zip");
  assert.equal(zipResponse.headers.get("Content-Disposition"), 'attachment; filename="1500-images.zip"');

  const zip = new Uint8Array(await zipResponse.arrayBuffer());
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const zipText = new TextDecoder().decode(zip);
  assert.match(zipText, /apple\.png/);
  assert.match(zipText, /banana\.jpg/);

  const usedResponse = await worker.fetch(
    new Request(link.url, {
      headers: {
        Origin: "https://fifteenhundred.app",
      },
    }),
    env,
  );
  assert.equal(usedResponse.status, 410);
  assert.deepEqual(await usedResponse.json(), {
    error: "This download link has already been used or does not exist.",
  });
}

function row(id, slug, title, parentId, level, sortOrder, overrides = {}) {
  return {
    id,
    slug,
    title,
    parent_id: parentId || null,
    level,
    sort_order: sortOrder,
    description: "",
    icon_asset_id: "",
    image_asset_id: "",
    affiliate_query: "",
    is_active: true,
    created_at: "2026-06-08T00:00:00Z",
    updated_at: "2026-06-08T00:00:00Z",
    ...overrides,
  };
}

function createFakeBucket(initialObjects) {
  const objects = new Map(
    Object.entries(initialObjects).map(([key, value]) => [
      key,
      {
        body: value.body,
        customMetadata: value.customMetadata ?? {},
        httpMetadata: value.httpMetadata ?? {},
        uploaded: new Date("2026-06-08T00:00:00Z"),
      },
    ]),
  );

  return {
    async list({ prefix = "" }) {
      return {
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({
            key,
            size: value.body.byteLength,
            customMetadata: value.customMetadata,
            uploaded: value.uploaded,
          })),
        truncated: false,
      };
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) {
        return null;
      }
      return {
        customMetadata: object.customMetadata,
        uploaded: object.uploaded,
        async arrayBuffer() {
          return object.body.buffer.slice(object.body.byteOffset, object.body.byteOffset + object.body.byteLength);
        },
        async text() {
          return new TextDecoder().decode(object.body);
        },
      };
    },
    async put(key, value, options = {}) {
      const body =
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value);
      objects.set(key, {
        body,
        customMetadata: options.customMetadata ?? {},
        httpMetadata: options.httpMetadata ?? {},
        uploaded: new Date("2026-06-08T00:00:00Z"),
      });
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
