const state = { models: [], cases: [], benchmarks: [], benchmarkModel: "", selectedModel: "google/gemini-3.1-flash-lite", answer: "", activeRun: null };

const $ = (selector) => document.querySelector(selector);
const modelPicker = $("#model-picker");
const modelSearch = $("#model-search");
const modelList = $("#model-list");
const toolFilter = $("#tool-filter");
const query = $("#query");

function safeText(value) { return value == null ? "" : String(value); }
function selectedModel() { return state.models.find((model) => model.id === state.selectedModel); }
function formatMoney(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 5 }).format(value || 0); }
function formatLatency(value) { return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value || 0}ms`; }

function setCatalogStatus(text, ready = false) {
  $("#catalog-status").textContent = text;
  $(".status-dot").style.background = ready ? "#0a8754" : "#e4a000";
}

function renderModelDetail() {
  const model = selectedModel();
  if (!model) {
    $("#model-detail").textContent = "Choose a model from the live catalog.";
    return;
  }
  const capability = model.supportsTools ? "Tools enabled" : "No tool support";
  const context = model.contextLength ? `${new Intl.NumberFormat().format(model.contextLength)} context` : "Context not listed";
  $("#model-detail").textContent = `${model.id} · ${capability} · ${context}`;
  modelSearch.value = model.name;
}

function modelMatches(model, needle) {
  return [model.id, model.name, model.provider, model.description].join(" ").toLowerCase().includes(needle);
}

function renderModelList() {
  const needle = modelSearch.value.trim().toLowerCase();
  const filtered = state.models.filter((model) => (!toolFilter.checked || model.supportsTools) && modelMatches(model, needle)).slice(0, 140);
  modelList.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "model-option";
    empty.textContent = "No matching live models.";
    modelList.append(empty);
    return;
  }
  for (const model of filtered) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `model-option${model.id === state.selectedModel ? " active" : ""}`;
    option.role = "option";
    option.setAttribute("aria-selected", String(model.id === state.selectedModel));
    const name = document.createElement("strong");
    name.textContent = model.name;
    const id = document.createElement("small");
    id.textContent = model.id;
    option.append(name, id);
    if (model.supportsTools) {
      const tag = document.createElement("span");
      tag.className = "tool-tag";
      tag.textContent = "TOOLS";
      option.append(tag);
    }
    option.addEventListener("click", () => {
      state.selectedModel = model.id;
      renderModelDetail();
      renderModelList();
      closeModelPicker();
    });
    modelList.append(option);
  }
}

function openModelPicker() { modelPicker.classList.add("open"); modelSearch.setAttribute("aria-expanded", "true"); renderModelList(); }
function closeModelPicker() { modelPicker.classList.remove("open"); modelSearch.setAttribute("aria-expanded", "false"); }

function setMetrics(metrics = {}) {
  $("#metric-model-calls").textContent = metrics.modelCalls ?? "—";
  $("#metric-tool-calls").textContent = metrics.toolCalls ?? "—";
  $("#metric-latency").textContent = metrics.latencyMs == null ? "—" : formatLatency(metrics.latencyMs);
  $("#metric-cost").textContent = metrics.cost == null ? "—" : formatMoney(metrics.cost);
}

function renderBenchmark() {
  const fullRun = state.benchmarks.find((run) => run.complete && run.models.includes(state.benchmarkModel));
  const latestRun = fullRun || state.benchmarks[0];
  const score = $("#benchmark-score");
  const message = $("#benchmark-message");
  const failures = $("#benchmark-failures");
  failures.replaceChildren();
  failures.hidden = true;

  if (!latestRun) {
    score.textContent = "—";
    message.textContent = `No comparable benchmark yet. Run all 18 cases with ${state.benchmarkModel}, then refresh.`;
    return;
  }
  if (!fullRun && latestRun.complete) {
    score.textContent = "—";
    message.textContent = `Latest full run used ${latestRun.models.join(", ") || "an unknown model"}, not the pinned benchmark model ${state.benchmarkModel}. Rerun it.`;
    return;
  }
  if (!latestRun.complete) {
    score.textContent = `${latestRun.passed} / ${latestRun.casesRun}`;
    message.textContent = `Latest run (${latestRun.directory}) is partial, so it is not a valid candidate score. Run all ${latestRun.expectedCases} cases.`;
    return;
  }
  score.textContent = `${latestRun.passed} / ${latestRun.expectedCases}`;
  const model = latestRun.models.length ? latestRun.models.join(", ") : "model not recorded";
  message.textContent = `${latestRun.scorePercent}% · ${latestRun.directory} · ${model}`;
  state.activeRun = latestRun;
  for (const item of latestRun.cases) {
    const row = document.createElement("li");
    row.className = `benchmark-case ${item.passed ? "ok" : "bad"}`;
    const id = document.createElement("strong");
    id.textContent = item.id;
    const dot = document.createElement("span");
    dot.className = "case-verdict";
    dot.textContent = item.passed ? "PASS" : "FAIL";
    const issue = document.createElement("span");
    issue.className = "case-issue";
    issue.textContent = item.issue;
    const inspect = document.createElement("button");
    inspect.type = "button";
    inspect.textContent = "Inspect";
    inspect.addEventListener("click", () => inspectCase(latestRun.directory, item.id));
    row.append(id, dot, issue, inspect);
    failures.append(row);
  }
  failures.hidden = false;
}

async function loadBenchmarks() {
  try {
    const response = await fetch("/api/benchmarks");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not read benchmark traces.");
    state.benchmarks = payload.runs || [];
    state.benchmarkModel = payload.benchmarkModel || state.benchmarkModel;
    renderBenchmark();
  } catch (error) {
    $("#benchmark-message").textContent = error.message;
  }
}

function loadFixture(id) {
  const fixture = state.cases.find((item) => item.id === id);
  if (!fixture) return;
  $("#case-select").value = fixture.id;
  query.value = fixture.query;
  query.focus();
  $("#run-status").textContent = `Loaded ${fixture.id}. Run it in the playground and inspect the trajectory.`;
}

async function inspectCase(directory, caseId) {
  const dialog = $("#inspector");
  const body = $("#inspector-body");
  $("#inspector-title").textContent = `${caseId}`;
  body.innerHTML = "<p class='inspector-loading'>Loading trace…</p>";
  dialog.hidden = false;
  dialog.classList.add("open");
  document.body.classList.add("inspector-locked");
  try {
    const response = await fetch(`/api/trace?dir=${encodeURIComponent(directory)}&case=${encodeURIComponent(caseId)}`);
    const trace = await response.json();
    if (!response.ok) throw new Error(trace.error || "Could not load this trace.");
    renderInspector(trace);
  } catch (error) {
    body.innerHTML = "";
    const message = document.createElement("p");
    message.className = "inspector-loading";
    message.textContent = error.message;
    body.append(message);
  }
}

function renderInspector(trace) {
  const body = $("#inspector-body");
  body.replaceChildren();
  $("#inspector-title").textContent = `${trace.caseId} · ${trace.passed ? "PASS" : "FAIL"}`;

  const query = document.createElement("p");
  query.className = "inspector-query";
  query.textContent = `"${trace.query}"`;
  body.append(query);

  if (trace.error) {
    const err = document.createElement("div");
    err.className = "cart-outcome warning";
    err.textContent = `Run errored: ${trace.error}`;
    body.append(err);
  }

  // Constraint diagnosis — the "why".
  const constraintSection = inspectorSection("Hard constraints (what the score checks)");
  const list = document.createElement("ul");
  list.className = "constraint-list";
  if (!trace.diagnosis.length) {
    const row = document.createElement("li");
    row.className = "constraint-row bad";
    row.innerHTML = "<span class='constraint-mark'>✗</span><span class='constraint-label'>No product added</span><span class='constraint-detail'>The agent never added a valid product to the cart, so the case is incomplete.</span>";
    list.append(row);
  } else {
    for (const check of trace.diagnosis) {
      const row = document.createElement("li");
      row.className = `constraint-row ${check.ok ? "ok" : "bad"}`;
      const mark = document.createElement("span");
      mark.className = "constraint-mark";
      mark.textContent = check.ok ? "✓" : "✗";
      const label = document.createElement("span");
      label.className = "constraint-label";
      label.textContent = check.label;
      const detail = document.createElement("span");
      detail.className = "constraint-detail";
      detail.textContent = check.ok ? `${check.actual}` : `need ${check.expected} · got ${check.actual}`;
      row.append(mark, label, detail);
      list.append(row);
    }
  }
  constraintSection.append(list);
  body.append(constraintSection);

  // Chosen product.
  const cartSection = inspectorSection("Cart outcome");
  const product = trace.recommendedProduct;
  const outcome = document.createElement("div");
  outcome.className = `cart-outcome ${trace.passed ? "success" : "warning"}`;
  outcome.textContent = product
    ? `Added ${product.id} — ${product.name} · ₹${product.price} · ${product.rating}★ · ${product.in_stock ? "in stock" : "out of stock"} · [${product.features.join(", ")}]`
    : "No product was added to the cart. The evaluator marks this case incomplete.";
  cartSection.append(outcome);
  body.append(cartSection);

  // Trajectory — what the agent actually did.
  const tools = trace.trajectory.filter((event) => event.type === "tool_call").map((event) => event.name);
  const traceSection = inspectorSection(`What the agent did · ${trace.trajectory.length} events · tools: ${tools.length ? [...new Set(tools)].join(", ") : "none"}`);
  const traceList = document.createElement("ol");
  traceList.className = "trace-list";
  appendTraceEvents(traceList, trace.trajectory, { openLast: false });
  traceSection.append(traceList);
  body.append(traceSection);

  // Final message.
  const finalSection = inspectorSection("Final message to the shopper");
  const finalText = document.createElement("div");
  finalText.className = "inspector-final";
  finalText.textContent = trace.finalText || "(the agent returned no final text)";
  finalSection.append(finalText);
  body.append(finalSection);
}

function inspectorSection(title) {
  const section = document.createElement("section");
  section.className = "inspector-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function closeInspector() {
  const dialog = $("#inspector");
  dialog.classList.remove("open");
  dialog.hidden = true;
  document.body.classList.remove("inspector-locked");
}

function eventLabel(event) {
  if (event.type === "model_call") return `Model turn ${event.step}`;
  return event.name.replaceAll("_", " ");
}

function appendTraceEvents(listEl, events, { openLast = true } = {}) {
  listEl.replaceChildren();
  events.forEach((event, index) => {
    const item = document.createElement("li");
    item.className = `trace-event ${event.type === "tool_call" ? "tool" : "model"}`;
    item.dataset.index = index + 1;
    const details = document.createElement("details");
    details.open = openLast && index === events.length - 1;
    const summary = document.createElement("summary");
    const kind = document.createElement("span");
    kind.className = "trace-kind";
    kind.textContent = event.type === "tool_call" ? "↳" : "✦";
    const label = document.createElement("span");
    label.className = "trace-label";
    label.textContent = eventLabel(event);
    const meta = document.createElement("span");
    meta.className = "trace-meta";
    meta.textContent = event.type === "model_call" ? formatLatency(event.latency_ms) : `step ${event.step}`;
    summary.append(kind, label, meta);
    const payload = document.createElement("pre");
    payload.className = "trace-payload";
    payload.textContent = JSON.stringify(event.type === "tool_call" ? { input: event.input, result: event.result } : { model: event.resolved_model, generation_id: event.generation_id, usage: event.usage }, null, 2);
    details.append(summary, payload);
    item.append(details);
    listEl.append(item);
  });
}

function renderTrace(events) {
  const traceList = $("#trace-list");
  const traceEmpty = $("#trace-empty");
  $("#trace-count").textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
  if (!events.length) {
    traceList.hidden = true;
    traceEmpty.hidden = false;
    return;
  }
  traceList.hidden = false;
  traceEmpty.hidden = true;
  appendTraceEvents(traceList, events);
}

function renderRun(result) {
  state.answer = result.finalText || "";
  $("#answer-empty").hidden = true;
  const answer = $("#answer-content");
  answer.hidden = false;
  answer.textContent = state.answer || "The model returned no final text.";
  $("#copy-answer").disabled = !state.answer;
  const outcome = $("#cart-outcome");
  outcome.hidden = false;
  outcome.className = `cart-outcome ${result.cartProductId ? "success" : "warning"}`;
  outcome.textContent = result.cartProductId ? `Cart recommendation: ${result.cartProductId}` : "No product was added to the cart. The evaluator would mark this run incomplete.";
  setMetrics(result.metrics);
  renderTrace(result.trajectory || []);
}

async function runAgent() {
  const button = $("#run-button");
  const status = $("#run-status");
  if (!state.selectedModel) { status.textContent = "Choose a tool-capable model first."; return; }
  button.disabled = true;
  status.textContent = "Running model and local tools…";
  try {
    const response = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.value, model: state.selectedModel }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The agent run failed.");
    renderRun(result);
    status.textContent = `Completed with ${result.metrics.resolvedModel}.`;
  } catch (error) {
    status.textContent = error.message;
  } finally { button.disabled = false; }
}

async function initialise() {
  try {
    const [modelsResponse, casesResponse] = await Promise.all([fetch("/api/models"), fetch("/api/cases")]);
    const modelsPayload = await modelsResponse.json();
    const casesPayload = await casesResponse.json();
    if (!modelsResponse.ok) throw new Error(modelsPayload.error || "Could not load live models.");
    state.models = modelsPayload.models;
    state.cases = casesPayload.cases || [];
    if (!state.models.some((model) => model.id === state.selectedModel)) {
      state.selectedModel = state.models.find((model) => model.supportsTools)?.id || state.models[0]?.id || "";
    }
    for (const fixture of state.cases) {
      const option = document.createElement("option");
      option.value = fixture.id;
      option.textContent = `${fixture.id} — ${fixture.query}`;
      $("#case-select").append(option);
    }
    renderModelDetail();
    setCatalogStatus(`${state.models.length} live models loaded`, true);
    await loadBenchmarks();
  } catch (error) {
    setCatalogStatus(error.message, false);
    $("#run-status").textContent = "Model catalog unavailable. Check the API key and network.";
  }
}

modelSearch.addEventListener("focus", openModelPicker);
modelSearch.addEventListener("input", () => { openModelPicker(); renderModelList(); });
toolFilter.addEventListener("change", renderModelList);
$("#model-clear").addEventListener("click", () => { modelSearch.value = ""; openModelPicker(); });
document.addEventListener("click", (event) => { if (!modelPicker.contains(event.target)) closeModelPicker(); });
$("#run-button").addEventListener("click", runAgent);
$("#refresh-benchmark").addEventListener("click", loadBenchmarks);
query.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runAgent(); });
$("#case-select").addEventListener("change", (event) => {
  if (event.target.value) loadFixture(event.target.value);
});
$("#copy-answer").addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.answer);
  $("#run-status").textContent = "Answer copied.";
});
$("#inspector").addEventListener("click", (event) => { if (event.target.closest("[data-close]")) closeInspector(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && $("#inspector").classList.contains("open")) closeInspector(); });

initialise();
