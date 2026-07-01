const state = {
  benchmarks: [],
  benchmarkModel: "",
  activeRun: null,
  activeCaseId: "",
  products: [],
  productDetails: new Map(),
  activeProductId: "",
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

async function initialise() {
  await Promise.all([loadBenchmarks(), loadProducts()]);
}

$("#refresh-benchmark").addEventListener("click", loadBenchmarks);
$("#product-search").addEventListener("input", renderProductList);

initialise();
