const state = {
  benchmarks: [],
  benchmarkModel: "",
  activeRun: null,
  activeCaseId: "",
  products: [],
  productDetails: new Map(),
  activeProductId: "",
  defaultModel: "",
  seedQueries: [
    "Find me a quiet wireless keyboard under 1600 for an office",
    "I need a 1080p webcam under 2000 with a privacy shutter for remote work",
    "Recommend wireless noise-cancelling headphones under 2600 for my bus commute",
    "Pick a mechanical keyboard below 2300 for coding at night, no number pad needed",
    "Find a 1440p monitor under 13000 for gaming and work",
  ],
  running: false,
};

const $ = (selector) => document.querySelector(selector);

function safeText(value) {
  return value == null ? "" : String(value);
}

function categoryLabel(value) {
  return safeText(value).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function setStatus(text, ready = true) {
  $("#page-status").textContent = text;
  $(".status-dot").classList.toggle("ready", ready);
}

function productLine(product) {
  if (!product) return "No product selected.";
  return `${product.name} (${product.id}) · ${money(product.price)} · ${product.rating} stars · ${product.in_stock ? "in stock" : "out of stock"}`;
}

function latestComparableRun() {
  const completeRuns = state.benchmarks.filter((run) => run.complete);
  if (completeRuns.length) return completeRuns[0];
  return [...state.benchmarks].sort((a, b) => b.casesRun - a.casesRun)[0] || null;
}

function renderBenchmark() {
  const run = latestComparableRun();
  state.activeRun = run;
  const list = $("#case-review-list");
  list.replaceChildren();

  if (!run) {
    $("#benchmark-score").textContent = "-";
    $("#benchmark-message").textContent = "No benchmark run found. Run `make eval`, then refresh.";
    $("#case-count").textContent = "0 cases";
    list.append(emptyBlock("Run `make eval` in the terminal, then click Refresh."));
    return;
  }

  $("#benchmark-score").textContent = `${run.passed} / ${run.casesRun}`;
  const completeness = run.complete ? "complete" : `partial (${run.casesRun} of ${run.expectedCases})`;
  const instruction = run.complete ? "" : " · run `make eval` to generate all 18 cases";
  $("#benchmark-message").textContent = `${run.directory} · ${completeness} · ${run.models.join(", ") || "model not recorded"}${instruction}`;
  $("#case-count").textContent = `${run.cases.length} case${run.cases.length === 1 ? "" : "s"}`;

  for (const item of run.cases) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `case-review-row ${item.passed ? "ok" : "bad"}${item.id === state.activeCaseId ? " active" : ""}`;
    const id = document.createElement("strong");
    id.textContent = item.id;
    const verdict = document.createElement("span");
    verdict.className = "case-verdict";
    verdict.textContent = item.passed ? "PASS" : "FAIL";
    const issue = document.createElement("span");
    issue.className = "case-issue";
    issue.textContent = item.issue;
    button.append(id, verdict, issue);
    button.addEventListener("click", () => inspectCase(run.directory, item.id));
    list.append(button);
  }

  if (!state.activeCaseId && run.cases.length) {
    const firstFailure = run.cases.find((item) => !item.passed) || run.cases[0];
    inspectCase(run.directory, firstFailure.id);
  }
}

async function loadBenchmarks() {
  try {
    const response = await fetch("/api/benchmarks");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not read benchmark results.");
    state.benchmarks = payload.runs || [];
    state.benchmarkModel = payload.benchmarkModel || "";
    if (state.activeRun && !state.benchmarks.some((run) => run.directory === state.activeRun.directory)) {
      state.activeCaseId = "";
    }
    renderBenchmark();
    setStatus("Benchmark loaded");
  } catch (error) {
    setStatus(error.message, false);
  }
}

async function inspectCase(directory, caseId) {
  state.activeCaseId = caseId;
  renderBenchmark();
  $("#case-detail-status").textContent = "Loading";
  const detail = $("#case-detail");
  detail.replaceChildren(emptyBlock("Loading case..."));

  try {
    const response = await fetch(`/api/trace?dir=${encodeURIComponent(directory)}&case=${encodeURIComponent(caseId)}`);
    const trace = await response.json();
    if (!response.ok) throw new Error(trace.error || "Could not load case.");
    renderCaseDetail(trace);
  } catch (error) {
    $("#case-detail-status").textContent = "Error";
    detail.replaceChildren(emptyBlock(error.message));
  }
}

function renderCaseDetail(trace) {
  $("#case-detail-status").textContent = trace.passed ? "PASS" : "FAIL";
  const detail = $("#case-detail");
  detail.replaceChildren();

  const query = caseSection("Query");
  query.append(textBlock(trace.query || "(missing query)", "case-query-text"));

  const output = caseSection("Assistant output");
  output.append(textBlock(trace.finalText || "(no final response)", "case-output-text"));

  const selected = caseSection("Selected product");
  selected.append(textBlock(productLine(trace.recommendedProduct), "case-product-text"));

  const reason = caseSection(trace.passed ? "Why wrong" : "Why wrong");
  reason.append(textBlock(trace.passed ? "Not wrong: passed." : (trace.failedConstraints || []).join("; ") || trace.error || "No failure reason recorded.", trace.passed ? "case-pass-text" : "case-fail-text"));

  const constraints = caseSection("Constraint check");
  const list = document.createElement("ul");
  list.className = "constraint-list";
  if (!trace.diagnosis.length) {
    const row = document.createElement("li");
    row.className = "constraint-row bad";
    row.innerHTML = "<span class='constraint-mark'>x</span><span class='constraint-label'>Cart</span><span class='constraint-detail'>No valid product was added.</span>";
    list.append(row);
  } else {
    for (const check of trace.diagnosis) {
      const row = document.createElement("li");
      row.className = `constraint-row ${check.ok ? "ok" : "bad"}`;
      const mark = document.createElement("span");
      mark.className = "constraint-mark";
      mark.textContent = check.ok ? "OK" : "NO";
      const label = document.createElement("span");
      label.className = "constraint-label";
      label.textContent = check.label;
      const value = document.createElement("span");
      value.className = "constraint-detail";
      value.textContent = check.ok ? check.actual : `need ${check.expected}; got ${check.actual}`;
      row.append(mark, label, value);
      list.append(row);
    }
  }
  constraints.append(list);

  detail.append(query, output, selected, reason, constraints);
}

function caseSection(title) {
  const section = document.createElement("section");
  section.className = "case-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function textBlock(text, className) {
  const block = document.createElement("div");
  block.className = `case-text ${className}`;
  block.textContent = text;
  return block;
}

function emptyBlock(message) {
  const block = document.createElement("div");
  block.className = "trace-empty";
  block.textContent = message;
  return block;
}

function filteredProducts() {
  const needle = $("#product-search").value.trim().toLowerCase();
  return state.products.filter((product) => {
    if (!needle) return true;
    return [product.id, product.name, product.category, ...(product.features || [])].join(" ").toLowerCase().includes(needle);
  });
}

function renderProductList() {
  const list = $("#product-list");
  list.replaceChildren();
  const products = filteredProducts();
  if (!products.length) {
    list.append(emptyBlock("No products match the search."));
    return;
  }
  if (!products.some((product) => product.id === state.activeProductId)) {
    state.activeProductId = products[0].id;
    loadProductDetail(state.activeProductId);
  }
  for (const product of products) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `product-row${product.id === state.activeProductId ? " active" : ""}`;
    const title = document.createElement("strong");
    title.textContent = product.name;
    const meta = document.createElement("span");
    meta.textContent = `${product.id} · ${categoryLabel(product.category)} · ${money(product.price)} · ${product.rating} stars`;
    const tags = document.createElement("span");
    tags.className = "product-row-tags";
    tags.textContent = `${product.in_stock ? "In stock" : "Out of stock"} · ${(product.features || []).join(", ")}`;
    button.append(title, meta, tags);
    button.addEventListener("click", () => {
      state.activeProductId = product.id;
      renderProductList();
      loadProductDetail(product.id);
    });
    list.append(button);
  }
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load products.");
    state.products = payload.products || [];
    state.activeProductId = state.products[0]?.id || "";
    renderProductList();
    if (state.activeProductId) await loadProductDetail(state.activeProductId);
  } catch (error) {
    $("#product-list").replaceChildren(emptyBlock(error.message));
  }
}

async function loadProductDetail(productId) {
  const detail = $("#product-detail");
  detail.replaceChildren(emptyBlock("Loading product..."));
  try {
    if (state.productDetails.has(productId)) {
      renderProductDetail(state.productDetails.get(productId));
      return;
    }
    const response = await fetch(`/api/product-reviews?product_id=${encodeURIComponent(productId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load product.");
    state.productDetails.set(productId, payload);
    renderProductDetail(payload);
  } catch (error) {
    detail.replaceChildren(emptyBlock(error.message));
  }
}

function renderProductDetail(payload) {
  const detail = $("#product-detail");
  detail.replaceChildren();
  const product = payload.product;

  const title = document.createElement("div");
  title.className = "catalogue-product-title";
  const name = document.createElement("h3");
  name.textContent = product.name;
  const meta = document.createElement("p");
  meta.textContent = `${product.id} · ${categoryLabel(product.category)} · ${money(product.price)} · ${product.rating} stars · ${product.in_stock ? "in stock" : "out of stock"}`;
  title.append(name, meta);

  const features = document.createElement("div");
  features.className = "feature-strip";
  for (const feature of product.features || []) {
    const pill = document.createElement("span");
    pill.textContent = feature;
    features.append(pill);
  }

  const specs = caseSection("Specs");
  const specGrid = document.createElement("dl");
  specGrid.className = "spec-grid";
  for (const [key, value] of Object.entries(product.specs || {})) {
    const item = document.createElement("div");
    item.className = "spec-item";
    const term = document.createElement("dt");
    term.textContent = key.replaceAll("_", " ");
    const desc = document.createElement("dd");
    desc.textContent = String(value);
    item.append(term, desc);
    specGrid.append(item);
  }
  specs.append(specGrid);

  const reviews = caseSection("Review snippets");
  const reviewList = document.createElement("div");
  reviewList.className = "review-card-list";
  const source = payload.reviews.length
    ? payload.reviews
    : (payload.fallback_snippets || []).map((item) => ({ ...item, use_case: "catalogue snippet" }));
  for (const review of source.slice(0, 4)) {
    const card = document.createElement("article");
    card.className = "review-card";
    const head = document.createElement("div");
    head.className = "review-card-head";
    const rating = document.createElement("strong");
    rating.textContent = `${review.rating} / 5`;
    const useCase = document.createElement("span");
    useCase.textContent = review.use_case || "review";
    const text = document.createElement("p");
    text.textContent = review.text;
    head.append(rating, useCase);
    card.append(head, text);
    reviewList.append(card);
  }
  reviews.append(reviewList);

  detail.append(title, features, specs, reviews);
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const payload = await response.json();
    if (response.ok) state.defaultModel = payload.defaultModel || "";
  } catch {
    /* health is optional; default model stays empty */
  }
}

function playgroundStatus(text, ready = true) {
  $("#playground-status").textContent = text;
}

function renderRunResult(payload) {
  const panel = $("#answer-panel");
  panel.replaceChildren();

  const metrics = payload.metrics || {};
  const metricBar = document.createElement("div");
  metricBar.className = "metrics";
  const metricItems = [
    ["Model", metrics.resolvedModel || "—"],
    ["Model calls", String(metrics.modelCalls ?? 0)],
    ["Tool calls", String(metrics.toolCalls ?? 0)],
    ["Latency", metrics.latencyMs ? `${metrics.latencyMs} ms` : "—"],
  ];
  for (const [label, value] of metricItems) {
    const cell = document.createElement("div");
    cell.className = "metric";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    cell.append(span, strong);
    metricBar.append(cell);
  }
  panel.append(metricBar);

  const cart = document.createElement("div");
  const cartId = payload.cartProductId;
  if (cartId) {
    const product = state.products.find((item) => item.id === cartId);
    cart.className = "cart-outcome success";
    cart.textContent = product
      ? `Added to cart: ${product.name} (${cartId}) · ${money(product.price)} · ${product.rating} stars · ${product.in_stock ? "in stock" : "out of stock"}`
      : `Added to cart: ${cartId}`;
  } else {
    cart.className = "cart-outcome warning";
    cart.textContent = "No product was added to the cart.";
  }
  panel.append(cart);

  const answer = document.createElement("div");
  answer.className = "answer-content";
  answer.textContent = payload.finalText || "(no final response)";
  panel.append(answer);

  const traceSection = document.createElement("section");
  traceSection.className = "inspector-section";
  const traceHeading = document.createElement("h3");
  traceHeading.textContent = "Trace";
  const traceList = document.createElement("ol");
  traceList.className = "trace-list";
  const trajectory = payload.trajectory || [];
  trajectory.forEach((event, index) => {
    const item = document.createElement("li");
    item.className = `trace-event ${event.type === "tool_call" ? "tool" : "model"}`;
    item.dataset.index = String(index + 1);
    const summary = document.createElement("summary");
    const kind = document.createElement("span");
    kind.className = "trace-kind";
    kind.textContent = event.type === "tool_call" ? "T" : "M";
    const label = document.createElement("span");
    label.className = "trace-label";
    if (event.type === "tool_call") {
      label.textContent = event.name || "tool_call";
    } else {
      label.textContent = `model · step ${event.step ?? index + 1}`;
    }
    const meta = document.createElement("span");
    meta.className = "trace-meta";
    if (event.type === "tool_call") {
      meta.textContent = event.name || "";
    } else {
      meta.textContent = event.resolved_model || event.requested_model || "";
    }
    summary.append(kind, label, meta);
    const payloadBlock = document.createElement("div");
    payloadBlock.className = "trace-payload";
    const shown = event.type === "tool_call" ? { input: event.input, result: event.result } : { usage: event.usage };
    payloadBlock.textContent = JSON.stringify(shown, null, 2);
    const details = document.createElement("details");
    details.append(summary, payloadBlock);
    item.append(details);
    traceList.append(item);
  });
  traceSection.append(traceHeading, traceList);
  panel.append(traceSection);

  if (cartId) {
    const product = state.products.find((item) => item.id === cartId);
    if (product) {
      const detail = document.createElement("div");
      detail.className = "case-section";
      const heading = document.createElement("h3");
      heading.textContent = "Selected product details";
      detail.append(heading);
      const line = document.createElement("div");
      line.className = "case-text case-product-text";
      line.textContent = productLine(product);
      detail.append(line);
      panel.append(detail);
    }
  }
}

async function runCandidateQuery() {
  if (state.running) return;
  const query = $("#candidate-query").value.trim();
  if (!query) {
    playgroundStatus("Type a query first", false);
    return;
  }
  state.running = true;
  const button = $("#run-query");
  button.disabled = true;
  playgroundStatus("Running…");
  const panel = $("#answer-panel");
  panel.replaceChildren(emptyBlock("Running the agent… this calls the model and may take a few seconds."));
  setStatus("Running query", false);
  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, model: state.defaultModel || "google/gemini-3.1-flash-lite" }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not run query.");
    renderRunResult(payload);
    playgroundStatus("Done");
    setStatus("Query complete");
  } catch (error) {
    panel.replaceChildren(emptyBlock(error.message));
    playgroundStatus("Error", false);
    setStatus(error.message, false);
  } finally {
    state.running = false;
    button.disabled = false;
  }
}

function seedRandomQuery() {
  const pool = state.seedQueries;
  const current = $("#candidate-query").value.trim();
  let next = current;
  let guard = 0;
  while (next === current && guard < pool.length) {
    next = pool[Math.floor(Math.random() * pool.length)];
    guard += 1;
  }
  $("#candidate-query").value = next;
  $("#candidate-query").focus();
  playgroundStatus("Random query loaded — press Run");
}

async function initialise() {
  await Promise.all([loadHealth(), loadBenchmarks(), loadProducts()]);
}

$("#refresh-benchmark").addEventListener("click", loadBenchmarks);
$("#product-search").addEventListener("input", renderProductList);
$("#run-query").addEventListener("click", runCandidateQuery);
$("#seed-query").addEventListener("click", seedRandomQuery);
$("#candidate-query").addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    runCandidateQuery();
  }
});

initialise();
