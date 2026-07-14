# Shopping Assistant — ElecKart

**ElecKart.com** — "Electronics, sorted by AI." A consumer electronics storefront whose
differentiator is a conversational shopping assistant that can search, recommend, and — with
explicit shopper confirmation — add products to cart, alongside a conventional browse/filter
experience.

This document is the product spec (PRD) for the storefront. For the underlying AI-PM interview
exercise this catalogue originates from, see [BENCHMARK_EXERCISE.md](BENCHMARK_EXERCISE.md).

---

## 1. Context

An existing local dataset — 50 electronics SKUs (mouse, keyboard, headphones, webcam, monitor)
with prices, stock, ratings, features, and reviews — had no consumer-facing storefront. It only
powered a single-shot benchmark agent used for a hiring exercise. ElecKart turns that catalogue
into a shoppable product: a normal browse/filter/PDP/cart experience, plus an AI-native
conversion path that can be measured against manual browsing.

## 2. Goals

- Let a shopper go from "I need X" to a cart item with as little friction as typing one sentence.
- Never let the assistant touch the cart without the shopper's explicit confirmation.
- Make the AI path measurable against the manual path (event logging, not vibes).
- Ship a real, usable e-commerce surface: filters, PDP, cart persistence, order confirmation —
  not just a chat demo bolted onto a product list.

### Non-goals

- Real payments (the "Place order" flow is explicitly a no-op — "no real payment taken").
- Server-side cart/session persistence (cart is client-only, `localStorage`).
- A general-purpose recommendation engine beyond this fixed 50-SKU catalogue.
- Editing the underlying catalogue, reviews, or benchmark scoring — this build is 100% additive
  and never touches the exercise's guarded files (see [BENCHMARK_EXERCISE.md](BENCHMARK_EXERCISE.md)).

## 3. Target user

A shopper who knows roughly what they need ("a quiet keyboard for the office, under ₹1600") but
doesn't want to manually cross-reference specs, price, stock, and reviews across 10 similar SKUs.

## 4. Centerpiece feature: the conversational assistant

Not a one-shot search box — a real multi-turn thread that can also convert:

- The assistant **proposes** an add; it never adds silently. Every proposed add renders as a
  confirm/cancel chip ("Add \<exact product name\> — \<price\>?"); nothing touches the cart until
  the shopper taps **Confirm**.
- **Multi-turn reference resolution**: a shopper can ask for something, get a reply plus a couple
  of inline product cards, then say "add the second one" — the assistant resolves that to the
  *exact* product id it showed, never a guessed position. This works because each assistant turn
  is stored and replayed as its own raw structured JSON (`{reply, product_ids, propose_add}`),
  not a paraphrase — so the model always has its own prior structured state to refer back to
  instead of re-deriving it from a sentence.
- The confirm chip is rendered **only** from `propose_add`, never by parsing the reply text, so
  the chip and the assistant's prose can never disagree about what's being added.
- The assistant is told the shopper's current cart on every call (client-owned, resent each
  request) so it can avoid duplicate proposals and answer "what's in my cart".
- **Deterministic fallback**: if OpenRouter is unreachable or the key is missing, both search and
  chat fall back to scoring the local catalogue directly instead of erroring, labeled
  `"engine": "fallback"` vs `"engine": "llm"` so the UI can be honest about which one answered.

## 5. Pages

- **Home** (`/`) — sticky header, split hero with a CTA into the assistant, "Shop by category"
  tiles, "Best sellers this week" (top-rated, real catalogue data), the assistant panel, and a
  "Browse all electronics" section with category/price/rating/feature filters + sort + a plain
  keyword search box (the non-chat fallback path) over a responsive product grid.
- **Product detail** (`/product.html?id=...`) — photo, price, spec table, review cards, Add to
  Cart, related products from the same category.
- **Cart** — slide-over drawer (add/remove/qty, subtotal) + an order-confirmation modal that's
  explicit about not taking real payment.

## 6. Architecture

```
src/storefront_agent.py   search() [one-shot] + chat() [multi-turn], one shared OpenRouter
                           tool-loop, one search_catalogue tool (wraps tools.search_products),
                           deterministic fallback, certifi SSL context, max_tokens cap
src/storefront_web.py     ThreadingHTTPServer (port 8001), serves web/store/ + the API below,
                           appends cart-add events to a flat JSONL log
web/store/                index.html, product.html, styles.css (--ek-* design tokens), app.js,
                           favicon.svg, images/ (one representative photo per category)
```

Second, independent server from the benchmark's `src/web.py` (different port, different static
root, different event log) — reuses the catalogue and review data read-only via `src/tools.py`,
never modifies it.

### API

| Route | Method | Purpose |
|---|---|---|
| `/api/storefront/products` | GET | Full catalogue summary for the browse grid + filters |
| `/api/storefront/product/<id>` | GET | One product + reviews + related products |
| `/api/storefront/search` | POST | One-shot ranked search (`{query, cart}`) |
| `/api/storefront/chat` | POST | Multi-turn assistant (`{transcript, cart}`), stateless server |
| `/api/storefront/event` | POST | Log a cart-add (`{source: "chat"\|"manual", product_id, quantity}`) |
| `/api/storefront/events/summary` | GET | Aggregate cart-add counts by source |

## 7. Design

Visual system follows a design handoff: OKLCH teal/amber palette, Poppins (headings) + Inter
(body), pill buttons and chip-style filters, hero/best-sellers/trust-badge sections. Own
`--ek-*` CSS variable namespace — does not reuse the benchmark dashboard's styles.

## 8. Success metric

Cart-adds by source (`chat` vs `manual`), from `/api/storefront/events/summary` reading
`storefront_events.jsonl` (repo-root, gitignored — local run output, not a fixture). This is
intentionally a minimal counter, not a full analytics dashboard: enough to see whether the
conversational path converts differently than manual browsing.

## 9. Key risks

- **Chat product-reference drift** is the easiest thing to get subtly wrong — mitigated by
  replaying raw JSON turns (not prose) and deriving the confirm chip only from `propose_add`,
  never from the reply text, with a server-side invariant that any `propose_add` id not also in
  that turn's `product_ids` is silently dropped.
- **Strict JSON from an LLM is inherently a little brittle** — defensively strips code fences and
  falls back to the deterministic path on any parse failure rather than surfacing an error.
- **Client-trusted cart** — the server never persists cart state; the client resends it each call.
  Fine for a demo storefront, would need a real session store for production.

## 10. Setup & run

```bash
cp .env.example .env
# set OPENROUTER_API_KEY (reused from the benchmark exercise) and, optionally,
# OPENROUTER_STOREFRONT_MODEL (defaults to google/gemini-3.1-flash-lite)
python -m pip install -r requirements.txt
make store
```

Open `http://127.0.0.1:8001`.

## 11. Repo map (storefront-relevant)

- `src/storefront_agent.py` / `src/storefront_web.py` — the storefront backend
- `web/store/` — the storefront frontend
- `data/products.json`, `data/reviews.json` — shared, read-only catalogue (see
  [BENCHMARK_EXERCISE.md](BENCHMARK_EXERCISE.md) for the exercise these originate from and what
  remains off-limits to edit)
