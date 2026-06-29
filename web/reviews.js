const reviewState = {
  products: [],
  activeCategory: "all",
  activeProductId: "",
  detailCache: new Map(),
};

const $ = (selector) => document.querySelector(selector);

function categoryLabel(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function productInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function filteredProducts() {
  const needle = $("#review-search").value.trim().toLowerCase();
  return reviewState.products.filter((product) => {
    const categoryMatch = reviewState.activeCategory === "all" || product.category === reviewState.activeCategory;
    const searchMatch = !needle || [product.name, product.category, product.id, ...(product.features || [])].join(" ").toLowerCase().includes(needle);
    return categoryMatch && searchMatch;
  });
}

function setStatus(text, ready = true) {
  $("#review-status").textContent = text;
  const dot = document.querySelector(".status-dot");
  dot.classList.toggle("ready", ready);
}

function renderCategories() {
  const categories = ["all", ...new Set(reviewState.products.map((product) => product.category))];
  const strip = $("#category-strip");
  strip.replaceChildren();
  for (const category of categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-pill${category === reviewState.activeCategory ? " active" : ""}`;
    button.textContent = category === "all" ? "All" : categoryLabel(category);
    button.addEventListener("click", () => {
      reviewState.activeCategory = category;
      renderCategories();
      renderProductList();
    });
    strip.append(button);
  }
}

function renderProductList() {
  const products = filteredProducts();
  const list = $("#product-list");
  list.replaceChildren();
  $("#product-count").textContent = `${products.length} product${products.length === 1 ? "" : "s"}`;

  if (!products.length) {
    const empty = document.createElement("div");
    empty.className = "trace-empty";
    empty.textContent = "No products match the current filter.";
    list.append(empty);
    return;
  }

  if (!products.some((product) => product.id === reviewState.activeProductId)) {
    reviewState.activeProductId = products.find((product) => product.rich_review_count > 0)?.id || products[0].id;
    loadProductDetail(reviewState.activeProductId);
  }

  for (const product of products) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `product-row${product.id === reviewState.activeProductId ? " active" : ""}`;
    const title = document.createElement("strong");
    title.textContent = product.name;
    const meta = document.createElement("span");
    meta.textContent = `${product.id} · ${categoryLabel(product.category)} · ${money(product.price)} · ${product.rating} stars`;
    const tags = document.createElement("span");
    tags.className = "product-row-tags";
    tags.textContent = `${product.in_stock ? "In stock" : "Out of stock"} · ${product.rich_review_count || product.snippet_count} review examples`;
    button.append(title, meta, tags);
    button.addEventListener("click", () => {
      reviewState.activeProductId = product.id;
      renderProductList();
      loadProductDetail(product.id);
    });
    list.append(button);
  }
}

function productStats(product) {
  const stats = document.createElement("div");
  stats.className = "product-stats";
  const items = [
    ["Price", money(product.price)],
    ["Rating", `${product.rating} / 5`],
    ["Reviews", new Intl.NumberFormat("en-IN").format(product.num_reviews)],
    ["Stock", product.in_stock ? "In stock" : "Out of stock"],
  ];
  for (const [label, value] of items) {
    const stat = document.createElement("div");
    stat.className = "product-stat";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value;
    stat.append(labelEl, valueEl);
    stats.append(stat);
  }
  return stats;
}

function renderReviewCard(review, index) {
  const card = document.createElement("article");
  card.className = "review-card";
  const head = document.createElement("div");
  head.className = "review-card-head";
  const rating = document.createElement("strong");
  rating.textContent = `${review.rating} / 5`;
  const useCase = document.createElement("span");
  useCase.textContent = review.use_case || `review ${index + 1}`;
  head.append(rating, useCase);
  const text = document.createElement("p");
  text.textContent = review.text;
  card.append(head, text);
  return card;
}

function renderDetail(payload) {
  const detail = $("#product-detail");
  detail.replaceChildren();

  const product = payload.product;
  $("#review-count").textContent = `${payload.reviews.length || payload.fallback_snippets.length} review${(payload.reviews.length || payload.fallback_snippets.length) === 1 ? "" : "s"}`;

  const header = document.createElement("div");
  header.className = "product-detail-header";
  const photo = document.createElement("div");
  photo.className = `product-photo product-photo-${product.category}`;
  photo.setAttribute("aria-hidden", "true");
  const photoMark = document.createElement("span");
  photoMark.textContent = productInitials(product.name);
  photo.append(photoMark);
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = product.name;
  const subtitle = document.createElement("p");
  subtitle.textContent = `${product.id} · ${categoryLabel(product.category)} · ${product.features.join(", ")}`;
  titleWrap.append(title, subtitle);
  header.append(photo, titleWrap);
  detail.append(header);

  detail.append(productStats(product));

  const specs = document.createElement("section");
  specs.className = "review-section";
  const specsTitle = document.createElement("h3");
  specsTitle.textContent = "Specs";
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
  specs.append(specsTitle, specGrid);
  detail.append(specs);

  const reviews = document.createElement("section");
  reviews.className = "review-section";
  const reviewsTitle = document.createElement("h3");
  reviewsTitle.textContent = "Reviews";
  const reviewList = document.createElement("div");
  reviewList.className = "review-card-list";
  const source = payload.reviews.length
    ? payload.reviews
    : payload.fallback_snippets.map((item) => ({ ...item, use_case: "catalogue snippet" }));
  source.forEach((review, index) => reviewList.append(renderReviewCard(review, index)));
  reviews.append(reviewsTitle, reviewList);
  detail.append(reviews);
}

async function loadProductDetail(productId) {
  try {
    if (reviewState.detailCache.has(productId)) {
      renderDetail(reviewState.detailCache.get(productId));
      return;
    }
    const response = await fetch(`/api/product-reviews?product_id=${encodeURIComponent(productId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load product reviews.");
    reviewState.detailCache.set(productId, payload);
    renderDetail(payload);
  } catch (error) {
    $("#product-detail").innerHTML = `<div class="trace-empty">${error.message}</div>`;
  }
}

async function initialiseReviews() {
  try {
    const response = await fetch("/api/products");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load products.");
    reviewState.products = payload.products || [];
    reviewState.activeProductId = reviewState.products.find((product) => product.rich_review_count > 0)?.id || reviewState.products[0]?.id || "";
    renderCategories();
    renderProductList();
    if (reviewState.activeProductId) await loadProductDetail(reviewState.activeProductId);
    setStatus(`${reviewState.products.length} products loaded`);
  } catch (error) {
    setStatus(error.message, false);
  }
}

$("#review-search").addEventListener("input", renderProductList);
initialiseReviews();
