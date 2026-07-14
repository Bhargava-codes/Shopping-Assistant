(function () {
  "use strict";

  var CART_KEY = "eleckart_cart_v1";
  var CATEGORIES = ["mouse", "keyboard", "headphones", "webcam", "monitor"];

  function categoryImgClass(category) {
    return "ek-img-" + category;
  }

  function capitalize(word) {
    return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  }

  function formatPrice(value) {
    return "₹" + Math.round(value || 0).toLocaleString("en-IN");
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text === null || text === undefined ? "" : String(text);
    return div.innerHTML;
  }

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  async function fetchJSON(url, options) {
    var response = await fetch(url, options);
    var body = null;
    try { body = await response.json(); } catch (error) { body = null; }
    if (!response.ok) {
      var message = (body && body.error) || ("Request failed with status " + response.status);
      throw new Error(message);
    }
    return body;
  }

  // Catalogue -------------------------------------------------------------
  var productsCache = null;
  var productsById = {};

  async function loadProducts() {
    if (productsCache) return productsCache;
    var data = await fetchJSON("/api/storefront/products");
    productsCache = data.products || [];
    productsById = {};
    productsCache.forEach(function (product) { productsById[product.id] = product; });
    return productsCache;
  }

  // Cart --------------------------------------------------------------------
  function getCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCartBadge();
    renderCartDrawer();
  }

  function cartCount(cart) {
    return (cart || getCart()).reduce(function (sum, item) { return sum + (item.quantity || 1); }, 0);
  }

  function logEvent(event) {
    fetch("/api/storefront/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(function () { /* best-effort logging, no UI impact on failure */ });
  }

  function addToCart(productId, quantity, source) {
    quantity = quantity && quantity > 0 ? quantity : 1;
    var cart = getCart();
    var existing = cart.find(function (item) { return item.product_id === productId; });
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ product_id: productId, quantity: quantity });
    }
    saveCart(cart);
    logEvent({ type: "cart_add", source: source || "manual", product_id: productId, quantity: quantity });
    var product = productsById[productId];
    showToast((product ? product.name : "Item") + " added to cart.");
  }

  function removeFromCart(productId) {
    saveCart(getCart().filter(function (item) { return item.product_id !== productId; }));
  }

  function changeQuantity(productId, delta) {
    var cart = getCart();
    var item = cart.find(function (i) { return i.product_id === productId; });
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) cart = cart.filter(function (i) { return i.product_id !== productId; });
    saveCart(cart);
  }

  function cartSubtotal(cart) {
    return (cart || getCart()).reduce(function (sum, item) {
      var product = productsById[item.product_id];
      return sum + (product ? product.price * item.quantity : 0);
    }, 0);
  }

  function renderCartBadge() {
    var badge = qs("#cartCount");
    if (badge) badge.textContent = String(cartCount());
  }

  function renderCartDrawer() {
    var container = qs("#cartItems");
    if (!container) return;
    var cart = getCart();
    if (!cart.length) {
      container.innerHTML = '<p class="ek-state">Your cart is empty.</p>';
    } else {
      container.innerHTML = cart.map(function (item) {
        var product = productsById[item.product_id];
        if (!product) return "";
        return (
          '<div class="ek-cart-row">' +
            '<div class="ek-cart-row__image ek-category-image ' + categoryImgClass(product.category) + '"></div>' +
            '<div class="ek-cart-row__info">' +
              '<div class="ek-cart-row__name">' + escapeHtml(product.name) + "</div>" +
              '<div class="ek-cart-row__price">' + formatPrice(product.price) + " each</div>" +
              '<div class="ek-cart-row__bottom">' +
                '<div class="ek-qty">' +
                  '<button type="button" data-qty-minus="' + product.id + '" aria-label="Decrease quantity">−</button>' +
                  "<span>" + item.quantity + "</span>" +
                  '<button type="button" data-qty-plus="' + product.id + '" aria-label="Increase quantity">+</button>' +
                "</div>" +
                '<button type="button" class="ek-cart-row__remove" data-remove="' + product.id + '">Remove</button>' +
              "</div>" +
            "</div>" +
          "</div>"
        );
      }).join("");
    }
    var subtotalEl = qs("#cartSubtotal");
    if (subtotalEl) subtotalEl.textContent = formatPrice(cartSubtotal(cart));
    var placeOrderBtn = qs("#placeOrderBtn");
    if (placeOrderBtn) placeOrderBtn.disabled = cart.length === 0;
  }

  function openCart() {
    var drawer = qs("#cartDrawer");
    if (!drawer) return;
    drawer.classList.add("ek-drawer--open");
    drawer.setAttribute("aria-hidden", "false");
    qs("#cartOverlay").classList.add("ek-overlay--visible");
  }

  function closeCart() {
    var drawer = qs("#cartDrawer");
    if (!drawer) return;
    drawer.classList.remove("ek-drawer--open");
    drawer.setAttribute("aria-hidden", "true");
    qs("#cartOverlay").classList.remove("ek-overlay--visible");
  }

  function openOrderModal() { qs("#orderModalOverlay").classList.add("ek-modal-overlay--visible"); }
  function closeOrderModal() { qs("#orderModalOverlay").classList.remove("ek-modal-overlay--visible"); }

  function placeOrder() {
    if (!getCart().length) return;
    saveCart([]);
    closeCart();
    openOrderModal();
  }

  var toastTimer = null;
  function showToast(message) {
    var toast = qs("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("ek-toast--visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("ek-toast--visible"); }, 2600);
  }

  // Product cards -----------------------------------------------------------
  function productCardHTML(product, opts) {
    opts = opts || {};
    var compactClass = opts.compact ? " ek-card--compact" : "";
    var addButton = opts.showAdd === false ? "" :
      '<button type="button" class="ek-card__add" data-add-to-cart="' + product.id + '"' + (product.in_stock ? "" : " disabled") + ">" +
      (product.in_stock ? "Add to cart" : "Out of stock") + "</button>";
    return (
      '<div class="ek-card' + compactClass + '">' +
        '<a class="ek-card__link" href="product.html?id=' + encodeURIComponent(product.id) + '">' +
          '<div class="ek-card__image ek-category-image ' + categoryImgClass(product.category) + '"></div>' +
          '<div class="ek-card__body">' +
            '<div class="ek-card__category">' + escapeHtml(capitalize(product.category)) + "</div>" +
            '<div class="ek-card__name">' + escapeHtml(product.name) + "</div>" +
            '<div class="ek-card__rating">★ ' + product.rating.toFixed(1) + " <span>(" + product.num_reviews + ")</span></div>" +
            '<div class="ek-card__price-row">' +
              '<span class="ek-card__price">' + formatPrice(product.price) + "</span>" +
              (product.in_stock ? "" : '<span class="ek-card__stock--out">Out of stock</span>') +
            "</div>" +
          "</div>" +
        "</a>" +
        addButton +
      "</div>"
    );
  }

  // Home page: filters + grid ------------------------------------------------
  var homeSearchProductIds = null;

  function computeAllFeatures(products) {
    var set = new Set();
    products.forEach(function (p) { (p.features || []).forEach(function (f) { set.add(f); }); });
    return Array.from(set).sort();
  }

  function renderCategoryFilters() {
    qs("#categoryFilters").innerHTML = CATEGORIES.map(function (category) {
      return (
        '<label class="ek-filter-option">' +
          '<input type="checkbox" data-category-checkbox value="' + category + '"> ' +
          escapeHtml(capitalize(category)) +
        "</label>"
      );
    }).join("");
  }

  function renderFeatureFilters(features) {
    qs("#featureFilters").innerHTML = features.map(function (feature) {
      return (
        '<label class="ek-filter-option">' +
          '<input type="checkbox" data-feature-checkbox value="' + escapeHtml(feature) + '"> ' +
          escapeHtml(feature) +
        "</label>"
      );
    }).join("");
  }

  function updatePriceLabel() {
    qs("#priceValueLabel").textContent = formatPrice(Number(qs("#priceRange").value));
  }

  function currentFilterState() {
    return {
      categories: new Set(qsa("[data-category-checkbox]:checked").map(function (el) { return el.value; })),
      features: new Set(qsa("[data-feature-checkbox]:checked").map(function (el) { return el.value; })),
      maxPrice: Number(qs("#priceRange").value),
      minRating: Number(qs("#ratingFilter").value),
      sort: qs("#sortSelect").value,
    };
  }

  function applyAndRenderGrid() {
    var filters = currentFilterState();
    var base = productsCache || [];
    if (homeSearchProductIds) {
      base = homeSearchProductIds.map(function (id) { return productsById[id]; }).filter(Boolean);
    }
    var filtered = base.filter(function (product) {
      if (filters.categories.size && !filters.categories.has(product.category)) return false;
      if (product.price > filters.maxPrice) return false;
      if (product.rating < filters.minRating) return false;
      if (filters.features.size) {
        var hasAll = true;
        filters.features.forEach(function (feature) {
          if (product.features.indexOf(feature) === -1) hasAll = false;
        });
        if (!hasAll) return false;
      }
      return true;
    });

    if (filters.sort === "price-asc") filtered = filtered.slice().sort(function (a, b) { return a.price - b.price; });
    else if (filters.sort === "price-desc") filtered = filtered.slice().sort(function (a, b) { return b.price - a.price; });
    else if (filters.sort === "rating-desc") filtered = filtered.slice().sort(function (a, b) { return b.rating - a.rating; });

    renderGrid(filtered);
  }

  function renderGrid(products) {
    var grid = qs("#productGrid");
    var countEl = qs("#resultsCount");
    if (!products.length) {
      grid.innerHTML = '<div class="ek-state">No products match your filters.<br><button type="button" id="emptyClearFilters">Clear filters</button></div>';
      var btn = qs("#emptyClearFilters");
      if (btn) btn.addEventListener("click", clearFilters);
      countEl.textContent = "";
      return;
    }
    countEl.textContent = products.length + (products.length === 1 ? " product" : " products");
    grid.innerHTML = products.map(function (product) { return productCardHTML(product); }).join("");
  }

  function clearFilters() {
    qsa("[data-category-checkbox]").forEach(function (el) { el.checked = false; });
    qsa("[data-feature-checkbox]").forEach(function (el) { el.checked = false; });
    qs("#ratingFilter").value = "0";
    qs("#priceRange").value = qs("#priceRange").max;
    updatePriceLabel();
    qs("#sortSelect").value = "relevance";
    homeSearchProductIds = null;
    qs("#searchInput").value = "";
    applyAndRenderGrid();
  }

  function selectSingleCategory(category) {
    qsa("[data-category-checkbox]").forEach(function (el) { el.checked = el.value === category; });
    applyAndRenderGrid();
    var browse = qs("#browse");
    if (browse) browse.scrollIntoView({ behavior: "smooth" });
  }

  async function runCatalogueSearch(query) {
    var grid = qs("#productGrid");
    grid.innerHTML = '<div class="ek-state">Searching…</div>';
    try {
      var result = await fetchJSON("/api/storefront/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query, cart: getCart() }),
      });
      homeSearchProductIds = (result.product_ids && result.product_ids.length) ? result.product_ids : [];
      applyAndRenderGrid();
    } catch (error) {
      grid.innerHTML = '<div class="ek-state">Search failed. <button type="button" id="retrySearch">Try again</button></div>';
      var retry = qs("#retrySearch");
      if (retry) retry.addEventListener("click", function () { runCatalogueSearch(query); });
    }
  }

  function renderBestSellers(products) {
    var grid = qs("#bestSellerGrid");
    if (!grid) return;
    var bestSellers = products.slice().sort(function (a, b) { return b.rating - a.rating; }).slice(0, 8);
    grid.innerHTML = bestSellers.map(function (product) { return productCardHTML(product); }).join("");
  }

  // Chat assistant ------------------------------------------------------------
  var chatTranscript = [];
  var chatBusy = false;
  var CHAT_SUGGESTIONS = [
    "quiet wireless keyboard under 1600 for office",
    "what's a good webcam for calls",
    "headphones for long flights",
  ];

  function renderSuggestions() {
    var container = qs("#chatSuggestions");
    if (!container) return;
    container.innerHTML = CHAT_SUGGESTIONS.map(function (label) {
      return '<button type="button" class="ek-suggestion-chip" data-suggestion="' + escapeHtml(label) + '">&ldquo;' + escapeHtml(label) + '&rdquo;</button>';
    }).join("");
  }

  function clearSuggestions() {
    var container = qs("#chatSuggestions");
    if (container) container.innerHTML = "";
  }

  function renderHintMessage() {
    qs("#chatThread").innerHTML =
      '<div class="ek-msg ek-msg--hint">Try: “quiet wireless keyboard under 1600 for office” or “what’s a good webcam for calls”</div>';
    renderSuggestions();
  }

  function appendMessageEl(html) {
    var thread = qs("#chatThread");
    var wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    var node = wrapper.firstElementChild;
    thread.appendChild(node);
    thread.scrollTop = thread.scrollHeight;
    return node;
  }

  function userMessageHTML(text) {
    return '<div class="ek-msg ek-msg--user">' + escapeHtml(text) + "</div>";
  }

  function assistantProductRowHTML(product) {
    return (
      '<a class="ek-msg__product-row" href="product.html?id=' + encodeURIComponent(product.id) + '">' +
        '<div class="ek-category-image ' + categoryImgClass(product.category) + '"></div>' +
        '<div class="ek-msg__product-row__info">' +
          '<div class="ek-msg__product-row__name">' + escapeHtml(product.name) + "</div>" +
          '<div class="ek-msg__product-row__rating">★ ' + product.rating.toFixed(1) + " (" + product.num_reviews + ")</div>" +
        "</div>" +
        '<div class="ek-msg__product-row__price">' + formatPrice(product.price) + "</div>" +
      "</a>"
    );
  }

  function assistantProductCardsHTML(productIds) {
    var known = (productIds || []).map(function (id) { return productsById[id]; }).filter(Boolean);
    if (!known.length) return "";
    return '<div class="ek-msg__products">' + known.map(assistantProductRowHTML).join("") + "</div>";
  }

  function chipHTML(item, index) {
    var product = productsById[item.product_id];
    if (!product) return "";
    return (
      '<span class="ek-chip" data-chip-index="' + index + '">' +
        "Add " + escapeHtml(product.name) + " — " + formatPrice(product.price) + (item.quantity > 1 ? " ×" + item.quantity : "") +
        '<button type="button" class="ek-chip__confirm" data-confirm-add data-product-id="' + product.id + '" data-quantity="' + item.quantity + '">Confirm</button>' +
        '<button type="button" class="ek-chip__cancel" data-cancel-add>No thanks</button>' +
      "</span>"
    );
  }

  function assistantMessageHTML(turn) {
    var engineLabel = turn.engine === "fallback" ? "via catalogue search (AI assistant unavailable)" : "via AI assistant";
    var productsHTML = assistantProductCardsHTML(turn.product_ids);
    var chipsHTML = (turn.propose_add || []).map(chipHTML).join("");
    return (
      '<div class="ek-msg ek-msg--assistant">' +
        "<div>" + escapeHtml(turn.reply) + "</div>" +
        productsHTML +
        chipsHTML +
        '<span class="ek-msg__engine">' + engineLabel + "</span>" +
      "</div>"
    );
  }

  function typingIndicatorHTML() {
    return '<div class="ek-msg ek-msg--assistant"><span class="ek-typing"><span></span><span></span><span></span></span></div>';
  }

  async function sendChatMessage(text) {
    if (chatBusy) return;
    chatBusy = true;
    var thread = qs("#chatThread");
    if (qs(".ek-msg--hint", thread)) thread.innerHTML = "";
    clearSuggestions();
    appendMessageEl(userMessageHTML(text));
    chatTranscript.push({ role: "user", content: text });
    var typingNode = appendMessageEl(typingIndicatorHTML());

    var input = qs("#chatInput");
    var sendBtn = qs("#chatForm button[type=submit]");
    input.disabled = true;
    sendBtn.disabled = true;

    try {
      var result = await fetchJSON("/api/storefront/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: chatTranscript, cart: getCart() }),
      });
      typingNode.remove();
      // Replay the model's own raw JSON turn (not prose) so follow-ups like
      // "add the second one" resolve against its own prior structured output.
      var turnForHistory = { reply: result.reply, product_ids: result.product_ids, propose_add: result.propose_add };
      chatTranscript.push({ role: "assistant", content: JSON.stringify(turnForHistory) });
      appendMessageEl(assistantMessageHTML(result));
    } catch (error) {
      typingNode.remove();
      chatTranscript.pop();
      appendMessageEl('<div class="ek-msg ek-msg--error">Something went wrong reaching the assistant. Please try again.</div>');
    } finally {
      chatBusy = false;
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function startOverChat() {
    chatTranscript = [];
    renderHintMessage();
  }

  function chatThreadClickHandler(event) {
    var confirmBtn = event.target.closest("[data-confirm-add]");
    if (confirmBtn) {
      var productId = confirmBtn.getAttribute("data-product-id");
      var quantity = Number(confirmBtn.getAttribute("data-quantity")) || 1;
      addToCart(productId, quantity, "chat");
      var chip = confirmBtn.closest(".ek-chip");
      chip.classList.add("ek-chip--done");
      qsa("button", chip).forEach(function (b) { b.disabled = true; });
      confirmBtn.textContent = "Added ✓";
      return;
    }
    var cancelBtn = event.target.closest("[data-cancel-add]");
    if (cancelBtn) {
      var chip2 = cancelBtn.closest(".ek-chip");
      chip2.classList.add("ek-chip--done");
      qsa("button", chip2).forEach(function (b) { b.disabled = true; });
    }
  }

  // Product detail page --------------------------------------------------------
  function reviewCardHTML(review) {
    return (
      '<div class="ek-review-card">' +
        '<div class="ek-review-card__rating">★ ' + review.rating + "/5</div>" +
        (review.use_case ? '<div class="ek-review-card__usecase">' + escapeHtml(review.use_case) + "</div>" : "") +
        "<div>" + escapeHtml(review.text) + "</div>" +
      "</div>"
    );
  }

  function specRowsHTML(specs) {
    return Object.keys(specs || {}).map(function (key) {
      return "<tr><td>" + escapeHtml(key.replace(/_/g, " ")) + "</td><td>" + escapeHtml(specs[key]) + "</td></tr>";
    }).join("");
  }

  function pdpHTML(detail) {
    var product = detail.product;
    var richReviews = (detail.reviews && detail.reviews.reviews) || [];
    var snippets = (detail.reviews && detail.reviews.review_snippets) || [];
    var allReviews = (richReviews.length ? richReviews : snippets).slice(0, 6);
    var related = detail.related || [];

    return (
      '<div class="ek-pdp__layout">' +
        '<div class="ek-pdp__media ek-category-image ' + categoryImgClass(product.category) + '"></div>' +
        '<div class="ek-pdp__info">' +
          '<div class="ek-pdp__category">' + escapeHtml(capitalize(product.category)) + "</div>" +
          "<h1>" + escapeHtml(product.name) + "</h1>" +
          '<div class="ek-pdp__rating">★ ' + product.rating.toFixed(1) + " (" + product.num_reviews + " reviews)</div>" +
          '<div class="ek-pdp__price">' + formatPrice(product.price) + "</div>" +
          '<span class="ek-pdp__stock ek-pdp__stock--' + (product.in_stock ? "in" : "out") + '">' + (product.in_stock ? "In stock" : "Out of stock") + "</span>" +
          '<div class="ek-feature-chips">' + (product.features || []).map(function (f) { return '<span class="ek-feature-chip">' + escapeHtml(f) + "</span>"; }).join("") + "</div>" +
          '<div class="ek-pdp__qty-row">' +
            '<div class="ek-qty">' +
              '<button type="button" id="pdpQtyMinus" aria-label="Decrease quantity">−</button>' +
              '<span id="pdpQtyValue">1</span>' +
              '<button type="button" id="pdpQtyPlus" aria-label="Increase quantity">+</button>' +
            "</div>" +
            '<button type="button" class="ek-pdp__add" id="pdpAddBtn" data-product-id="' + product.id + '"' + (product.in_stock ? "" : " disabled") + ">" +
            (product.in_stock ? "Add to cart" : "Out of stock") + "</button>" +
          "</div>" +
          '<table class="ek-spec-table"><tbody>' + specRowsHTML(product.specs) + "</tbody></table>" +
        "</div>" +
      "</div>" +
      '<section class="ek-pdp__reviews"><h2>Reviews</h2>' +
        (allReviews.length ? allReviews.map(reviewCardHTML).join("") : '<p class="ek-state">No reviews yet.</p>') +
      "</section>" +
      (related.length
        ? '<section class="ek-pdp__related"><h2>You may also like</h2><div class="ek-related-grid">' +
          related.map(function (p) { return productCardHTML(p); }).join("") + "</div></section>"
        : "")
    );
  }

  async function initProduct() {
    var params = new URLSearchParams(window.location.search);
    var productId = params.get("id");
    var content = qs("#pdpContent");
    if (!productId) {
      content.innerHTML = '<div class="ek-state">No product specified. <a href="/">Back to ElecKart</a></div>';
      return;
    }
    try {
      var detail = await fetchJSON("/api/storefront/product/" + encodeURIComponent(productId));
      qs("#breadcrumbCategory").textContent = capitalize(detail.product.category);
      document.title = detail.product.name + " — ElecKart.com";
      content.innerHTML = pdpHTML(detail);

      var qty = 1;
      var qtyValueEl = qs("#pdpQtyValue");
      qs("#pdpQtyMinus").addEventListener("click", function () { qty = Math.max(1, qty - 1); qtyValueEl.textContent = String(qty); });
      qs("#pdpQtyPlus").addEventListener("click", function () { qty += 1; qtyValueEl.textContent = String(qty); });
      var addBtn = qs("#pdpAddBtn");
      if (addBtn) {
        addBtn.addEventListener("click", function () { addToCart(addBtn.getAttribute("data-product-id"), qty, "manual"); });
      }
    } catch (error) {
      content.innerHTML = '<div class="ek-state">Product not found. <a href="/">Back to ElecKart</a></div>';
    }
  }

  // Home page init --------------------------------------------------------------
  async function initHome() {
    renderCategoryFilters();
    try {
      var products = await loadProducts();
      var maxPrice = products.reduce(function (m, p) { return Math.max(m, p.price); }, 0);
      var priceRange = qs("#priceRange");
      priceRange.max = String(Math.ceil(maxPrice / 100) * 100);
      priceRange.value = priceRange.max;
      updatePriceLabel();
      renderFeatureFilters(computeAllFeatures(products));
      renderBestSellers(products);

      var params = new URLSearchParams(window.location.search);
      var categoryParam = params.get("category");
      if (categoryParam && CATEGORIES.indexOf(categoryParam) !== -1) {
        qsa("[data-category-checkbox]").forEach(function (el) { el.checked = el.value === categoryParam; });
      }

      applyAndRenderGrid();
      if (categoryParam) {
        window.requestAnimationFrame(function () {
          var browse = qs("#browse");
          if (browse) browse.scrollIntoView();
        });
      }
    } catch (error) {
      qs("#productGrid").innerHTML = '<div class="ek-state">Could not load products. <button type="button" id="retryProducts">Retry</button></div>';
      var retryBtn = qs("#retryProducts");
      if (retryBtn) retryBtn.addEventListener("click", function () { productsCache = null; initHome(); });
    }

    qsa("[data-category-checkbox], [data-feature-checkbox]").forEach(function (el) { el.addEventListener("change", applyAndRenderGrid); });
    qs("#ratingFilter").addEventListener("change", applyAndRenderGrid);
    qs("#sortSelect").addEventListener("change", applyAndRenderGrid);
    qs("#priceRange").addEventListener("input", function () { updatePriceLabel(); applyAndRenderGrid(); });
    qs("#clearFiltersBtn").addEventListener("click", clearFilters);

    qs("#searchForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var query = qs("#searchInput").value.trim();
      if (!query) { homeSearchProductIds = null; applyAndRenderGrid(); return; }
      runCatalogueSearch(query);
    });

    renderHintMessage();
    qs("#chatForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var input = qs("#chatInput");
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendChatMessage(text);
    });
    qs("#startOverBtn").addEventListener("click", startOverChat);
    qs("#chatThread").addEventListener("click", chatThreadClickHandler);
  }

  // Shared chrome + boot ----------------------------------------------------------
  function wireSharedChrome() {
    var cartButton = qs("#cartButton");
    if (cartButton) cartButton.addEventListener("click", openCart);
    var closeCartBtn = qs("#closeCartBtn");
    if (closeCartBtn) closeCartBtn.addEventListener("click", closeCart);
    var overlay = qs("#cartOverlay");
    if (overlay) overlay.addEventListener("click", closeCart);
    var placeOrderBtn = qs("#placeOrderBtn");
    if (placeOrderBtn) placeOrderBtn.addEventListener("click", placeOrder);
    var closeOrderModalBtn = qs("#closeOrderModalBtn");
    if (closeOrderModalBtn) closeOrderModalBtn.addEventListener("click", closeOrderModal);

    document.addEventListener("click", function (event) {
      var addBtn = event.target.closest("[data-add-to-cart]");
      if (addBtn && !addBtn.disabled) { addToCart(addBtn.getAttribute("data-add-to-cart"), 1, "manual"); return; }

      var qtyMinus = event.target.closest("[data-qty-minus]");
      if (qtyMinus) { changeQuantity(qtyMinus.getAttribute("data-qty-minus"), -1); return; }

      var qtyPlus = event.target.closest("[data-qty-plus]");
      if (qtyPlus) { changeQuantity(qtyPlus.getAttribute("data-qty-plus"), 1); return; }

      var suggestionBtn = event.target.closest("[data-suggestion]");
      if (suggestionBtn) { sendChatMessage(suggestionBtn.getAttribute("data-suggestion")); return; }

      var removeBtn = event.target.closest("[data-remove]");
      if (removeBtn) { removeFromCart(removeBtn.getAttribute("data-remove")); return; }

      var categoryLink = event.target.closest("[data-category-link]");
      if (categoryLink && document.body.dataset.page === "home") {
        event.preventDefault();
        selectSingleCategory(categoryLink.getAttribute("data-category-link"));
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    wireSharedChrome();
    try { await loadProducts(); } catch (error) { /* page-specific init retries as needed */ }
    renderCartBadge();
    renderCartDrawer();

    var page = document.body.dataset.page;
    if (page === "home") initHome();
    else if (page === "product") initProduct();
  });
})();
