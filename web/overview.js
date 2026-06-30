const overviewState = { cases: [], products: [] };

const $ = (selector) => document.querySelector(selector);

function categoryLabel(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function setStatus(text, ready = true) {
  $("#overview-status").textContent = text;
  document.querySelector(".status-dot").classList.toggle("ready", ready);
}

function renderCases() {
  $("#overview-case-count").textContent = `${overviewState.cases.length} cases`;
  const list = $("#case-preview-list");
  list.replaceChildren();

  for (const item of overviewState.cases.slice(0, 8)) {
    const row = document.createElement("article");
    row.className = "case-preview";
    const title = document.createElement("strong");
    title.textContent = item.id;
    const query = document.createElement("p");
    query.textContent = item.query;
    const constraints = item.constraints || {};
    const meta = document.createElement("span");
    const features = constraints.required_features?.length ? ` | features: ${constraints.required_features.join(", ")}` : "";
    meta.textContent = `${categoryLabel(constraints.category || "unknown")} | max ${money(constraints.max_price)} | rating >= ${constraints.min_rating}${constraints.must_be_in_stock ? " | in stock" : ""}${features}`;
    row.append(title, query, meta);
    list.append(row);
  }
}

function renderProducts() {
  $("#overview-product-count").textContent = `${overviewState.products.length} products`;
  const summary = $("#catalog-summary");
  const list = $("#product-preview-list");
  summary.replaceChildren();
  list.replaceChildren();

  const categories = new Map();
  for (const product of overviewState.products) {
    categories.set(product.category, (categories.get(product.category) || 0) + 1);
  }
  for (const [category, count] of [...categories.entries()].sort()) {
    const pill = document.createElement("span");
    pill.className = "category-pill summary-pill";
    pill.textContent = `${categoryLabel(category)} (${count})`;
    summary.append(pill);
  }

  for (const product of overviewState.products.slice(0, 10)) {
    const row = document.createElement("article");
    row.className = "product-preview";
    const title = document.createElement("strong");
    title.textContent = product.name;
    const meta = document.createElement("span");
    meta.textContent = `${product.id} | ${categoryLabel(product.category)} | ${money(product.price)} | ${product.rating} stars | ${product.in_stock ? "in stock" : "out of stock"}`;
    const features = document.createElement("p");
    features.textContent = product.features.join(", ");
    row.append(title, meta, features);
    list.append(row);
  }
}

async function initialiseOverview() {
  try {
    const [casesResponse, productsResponse] = await Promise.all([fetch("/api/cases"), fetch("/api/products")]);
    const casesPayload = await casesResponse.json();
    const productsPayload = await productsResponse.json();
    if (!casesResponse.ok) throw new Error(casesPayload.error || "Could not load test cases.");
    if (!productsResponse.ok) throw new Error(productsPayload.error || "Could not load products.");
    overviewState.cases = casesPayload.cases || [];
    overviewState.products = productsPayload.products || [];
    renderCases();
    renderProducts();
    setStatus(`${overviewState.cases.length} cases and ${overviewState.products.length} products loaded`);
  } catch (error) {
    setStatus(error.message, false);
  }
}

initialiseOverview();
