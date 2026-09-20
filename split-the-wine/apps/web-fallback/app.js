const API = "/api";
const state = {
  view: "home",
  receipts: [],
  receipt: null,
  draft: null,
  parseSource: null,
  custom: {
    mode: "tiers", // equal | tiers | blank
    title: "Airbnb weekend",
    totalDollars: "800",
    people: "4",
    tiers: [
      { name: "Master bedroom", qty: 1, amount: "350" },
      { name: "Guest room", qty: 1, amount: "250" },
      { name: "Couch", qty: 2, amount: "100" },
    ],
    cleaningFee: "0",
  },
  selectedItem: null,
  claimQty: 1,
  guestName: localStorage.getItem("stw_name") || "",
  guestContact: localStorage.getItem("stw_contact") || "",
  ownerTokens: JSON.parse(localStorage.getItem("stw_tokens") || "{}"),
  totals: [],
  hostMethod: "Venmo",
  hostHandle: "",
  reconnecting: false,
  toastTimer: null,
  ws: null,
};

const screen = () => document.getElementById("screen");
const livePill = () => document.getElementById("live-pill");

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.querySelector(".phone-shell").appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function saveTokens() {
  localStorage.setItem("stw_tokens", JSON.stringify(state.ownerTokens));
}

function connectLive(receiptId) {
  if (state.ws) {
    try {
      state.ws.close();
    } catch {}
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/live?receiptId=${receiptId}`);
  state.ws = ws;
  livePill().classList.add("hidden");
  ws.onopen = () => {
    state.reconnecting = false;
    livePill().classList.remove("hidden");
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.receipt) {
        state.receipt = msg.receipt;
        if (state.view === "claim" || state.view === "share" || state.view === "totals") {
          render();
        }
      }
    } catch {}
  };
  ws.onclose = () => {
    livePill().classList.add("hidden");
    state.reconnecting = true;
    if (state.receipt?.id === receiptId && (state.view === "claim" || state.view === "share")) {
      setTimeout(() => connectLive(receiptId), 2500);
      pollReceipt(receiptId);
    }
  };
}

async function pollReceipt(id) {
  try {
    const { receipt } = await api(`/receipts/${id}`);
    state.receipt = receipt;
    if (state.view === "claim") render();
  } catch {}
}

function routeFromUrl() {
  const m = location.pathname.match(/^\/r\/([^/]+)/);
  if (m) {
    openClaim(m[1]);
    return true;
  }
  return false;
}

async function loadHome() {
  state.view = "home";
  try {
    const { receipts } = await api("/receipts");
    state.receipts = receipts;
  } catch {
    state.receipts = [];
  }
  render();
}

async function startDemoReceipt() {
  state.view = "parsing";
  render();
  try {
    const created = await api("/receipts", { method: "POST", body: "{}" });
    const parsed = await api(`/receipts/${created.receiptId}/parse`, {
      method: "POST",
      body: JSON.stringify({ useDemo: true }),
    });
    state.receipt = parsed.receipt;
    state.parseSource = parsed.source;
    state.draft = {
      restaurant: parsed.restaurant,
      items: parsed.items.map((it, i) => ({
        tempId: `t${i}`,
        name: it.name,
        qty: it.qty,
        totalCents: Math.round(it.total * 100),
      })),
      fees: parsed.fees.map((f, i) => ({
        tempId: `f${i}`,
        name: f.name,
        amountCents: Math.round(f.amount * 100),
      })),
    };
    state.view = "review";
    render();
  } catch (e) {
    toast(e.message || "Could not start demo");
    loadHome();
  }
}

async function uploadAndParse(file) {
  state.view = "parsing";
  render();
  try {
    const fd = new FormData();
    fd.append("image", file);
    const created = await fetch(`${API}/receipts`, { method: "POST", body: fd }).then((r) =>
      r.json()
    );
    const parsed = await api(`/receipts/${created.receiptId}/parse`, {
      method: "POST",
      body: "{}",
    });
    state.receipt = parsed.receipt;
    state.parseSource = parsed.source;
    state.draft = {
      restaurant: parsed.restaurant || "",
      items: (parsed.items || []).map((it, i) => ({
        tempId: `t${i}`,
        name: it.name,
        qty: it.qty,
        totalCents: Math.round(it.total * 100),
      })),
      fees: (parsed.fees || []).map((f, i) => ({
        tempId: `f${i}`,
        name: f.name,
        amountCents: Math.round(f.amount * 100),
      })),
    };
    if (!state.draft.items.length) {
      state.draft.items = [{ tempId: "t0", name: "", qty: 1, totalCents: 0 }];
    }
    state.view = "review";
    render();
  } catch (e) {
    toast(e.message || "Parse failed — try manual entry");
    // still allow manual
    const created = await api("/receipts", { method: "POST", body: "{}" });
    state.receipt = created.receipt;
    state.draft = {
      restaurant: "",
      items: [{ tempId: "t0", name: "New item", qty: 1, totalCents: 0 }],
      fees: [],
    };
    state.view = "review";
    render();
  }
}

async function publishDraft() {
  const items = state.draft.items.filter((i) => i.name.trim());
  if (!items.length) {
    toast("Add at least one item");
    return;
  }
  const { receipt, claimUrl } = await api(`/receipts/${state.receipt.id}`, {
    method: "PUT",
    body: JSON.stringify({
      restaurant: state.draft.restaurant,
      items,
      fees: state.draft.fees.filter((f) => f.name.trim()),
    }),
  });
  state.receipt = receipt;
  state.view = "share";
  connectLive(receipt.id);
  render();
  if (navigator.share) {
    // don't auto-open; host taps share
  }
  return claimUrl;
}

async function openClaim(id) {
  state.view = "claim";
  render();
  try {
    const { receipt } = await api(`/receipts/${id}`);
    state.receipt = receipt;
    connectLive(id);
    render();
  } catch {
    toast("Receipt not found");
    loadHome();
  }
}

async function submitClaim() {
  if (!state.selectedItem) return;
  const name = state.guestName.trim();
  if (!name) {
    toast("Enter your name");
    return;
  }
  localStorage.setItem("stw_name", name);
  localStorage.setItem("stw_contact", state.guestContact.trim());
  const btn = document.getElementById("claim-submit");
  if (btn) btn.disabled = true;
  try {
    const result = await api(`/receipts/${state.receipt.id}/claims`, {
      method: "POST",
      body: JSON.stringify({
        itemId: state.selectedItem.id,
        personName: name,
        personContact: state.guestContact.trim() || undefined,
        units: state.claimQty,
      }),
    });
    state.ownerTokens[result.claim.id] = result.ownerToken;
    saveTokens();
    state.receipt = result.receipt;
    const claimedName = state.selectedItem.name;
    const claimedQty = state.claimQty;
    closeSheet();
    toast(`Claimed ${claimedQty}× ${claimedName}`);
    render();
  } catch (e) {
    if (e.data?.error === "not_enough_remaining") {
      toast(`Only ${e.data.remaining} left — list refreshed`);
      await pollReceipt(state.receipt.id);
      closeSheet();
      render();
    } else if (!navigator.onLine) {
      toast("Couldn't reach the server, try again");
    } else {
      toast(e.data?.error || e.message);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadTotals() {
  const { totals, receipt } = await api(`/receipts/${state.receipt.id}/totals`);
  state.totals = totals;
  state.receipt = receipt;
  if (receipt.hostInfo) {
    state.hostMethod = receipt.hostInfo.method;
    state.hostHandle = receipt.hostInfo.handle;
  }
  state.view = "totals";
  render();
}

async function saveHostInfo() {
  const { receipt } = await api(`/receipts/${state.receipt.id}/host-info`, {
    method: "PUT",
    body: JSON.stringify({
      method: state.hostMethod,
      handle: state.hostHandle,
    }),
  });
  state.receipt = receipt;
  toast("Payment info saved");
  render();
}

function paymentMessage(person) {
  const handle = state.receipt.hostInfo?.handle || state.hostHandle || "[your handle]";
  const method = state.receipt.hostInfo?.method || state.hostMethod || "Venmo";
  return `Hey ${person.personName}, your share is ${money(person.totalCents)}, send it to ${handle} via ${method}`;
}

function openSheet(item) {
  state.selectedItem = item;
  state.claimQty = 1;
  render();
  requestAnimationFrame(() => {
    document.getElementById("overlay")?.classList.add("open");
    document.getElementById("sheet")?.classList.add("open");
  });
}

function closeSheet() {
  state.selectedItem = null;
  document.getElementById("overlay")?.classList.remove("open");
  document.getElementById("sheet")?.classList.remove("open");
  setTimeout(render, 280);
}

function claimedUnits() {
  if (!state.receipt) return 0;
  return state.receipt.items.reduce((s, i) => s + (i.qty - i.remaining), 0);
}

function totalUnits() {
  if (!state.receipt) return 0;
  return state.receipt.items.reduce((s, i) => s + i.qty, 0);
}

function renderHome() {
  const open = state.receipts.filter((r) => r.status !== "draft");
  return `
    <section class="hero">
      <h1 class="brand">Split<br/>the Wine</h1>
      <p class="lede">Split a restaurant check — or an Airbnb night, hotel room, or anything else — then let everyone claim their share.</p>
    </section>
    <div class="stack">
      <button class="btn btn-primary" id="btn-custom"><span class="tt-check">✓</span> Create a custom split</button>
      <label class="btn btn-secondary" for="file-input">Photograph a receipt</label>
      <input id="file-input" type="file" accept="image/*" capture="environment" hidden />
      <button class="btn btn-ghost" id="btn-demo">Try the demo bar tab</button>
    </div>
    <p class="section-label">Recent</p>
    <div class="stack" style="margin-top:0">
      ${
        open.length
          ? open
              .map(
                (r) => `
        <button class="receipt-row" data-open="${r.id}">
          <div class="item-main">
            <p class="item-name">${r.restaurant || "Untitled split"}</p>
            <p class="item-meta">${r.status} · ${r.items.length} items</p>
          </div>
          <span class="badge">${r.items.reduce((s, i) => s + i.remaining, 0)}</span>
        </button>`
              )
              .join("")
          : `<p class="muted">No open splits yet.</p>`
      }
    </div>
  `;
}

function renderCreate() {
  const c = state.custom;
  const equalPreview = (() => {
    const total = Number(c.totalDollars) || 0;
    const n = Math.max(1, Math.round(Number(c.people) || 1));
    const each = total / n;
    return { n, each, total };
  })();
  const tiersSum = c.tiers.reduce(
    (s, t) => s + (Number(t.amount) || 0) * Math.max(1, Math.round(Number(t.qty) || 1)),
    0
  );
  const cleaning = Number(c.cleaningFee) || 0;

  return `
    <div class="top-nav">
      <button class="btn btn-ghost" id="btn-back-home">← Home</button>
    </div>
    <section class="hero" style="padding-top:4px">
      <h2 class="brand" style="font-size:2rem">Create a custom split</h2>
      <p class="lede">No photo needed — perfect for Airbnb, hotels, cabins, or group trips.</p>
    </section>

    <div class="field">
      <label>What are you splitting?</label>
      <input id="custom-title" value="${escapeAttr(c.title)}" placeholder="Airbnb · Downtown loft" />
    </div>

    <p class="section-label">How should people claim?</p>
    <div class="mode-grid">
      <button type="button" class="mode-card ${c.mode === "equal" ? "active" : ""}" data-mode="equal">
        <strong>Equal shares</strong>
        <span>$800 ÷ 4 people = $200 each</span>
      </button>
      <button type="button" class="mode-card ${c.mode === "tiers" ? "active" : ""}" data-mode="tiers">
        <strong>Different rates</strong>
        <span>Master bed vs couch, etc.</span>
      </button>
      <button type="button" class="mode-card ${c.mode === "blank" ? "active" : ""}" data-mode="blank">
        <strong>Blank list</strong>
        <span>Add your own line items</span>
      </button>
    </div>

    ${
      c.mode === "equal"
        ? `
      <div class="field">
        <label>Total amount</label>
        <input id="custom-total" type="number" inputmode="decimal" step="0.01" min="0" value="${escapeAttr(c.totalDollars)}" />
      </div>
      <div class="field">
        <label>Number of people / shares</label>
        <input id="custom-people" type="number" inputmode="numeric" min="1" step="1" value="${escapeAttr(c.people)}" />
      </div>
      <p class="banner">${equalPreview.n} shares × ${money(Math.round(equalPreview.each * 100))} = ${money(Math.round(equalPreview.total * 100))}</p>
    `
        : ""
    }

    ${
      c.mode === "tiers"
        ? `
      <p class="section-label">Room / rate types</p>
      <p class="tiny" style="margin-top:-6px;margin-bottom:10px">Qty = how many of that spot can be claimed. Amount = price <em>per</em> spot.</p>
      <div id="tier-edits">
        ${c.tiers
          .map(
            (t, idx) => `
          <div class="edit-row" style="grid-template-columns:1fr 56px 88px 40px" data-tier="${idx}">
            <input class="edit-input tname" value="${escapeAttr(t.name)}" placeholder="Master bedroom" />
            <input class="edit-input tqty" type="number" min="1" step="1" value="${t.qty}" title="Quantity" />
            <input class="edit-input tamount" type="number" step="0.01" value="${escapeAttr(t.amount)}" title="Price each" />
            <button class="icon-btn" data-del-tier="${idx}" aria-label="Remove">×</button>
          </div>`
          )
          .join("")}
      </div>
      <button class="btn btn-secondary" id="add-tier">+ Add rate</button>
      <p class="item-meta" style="margin-top:12px">Rooms/rates total <span class="money">${money(Math.round(tiersSum * 100))}</span></p>
    `
        : ""
    }

    ${
      c.mode !== "blank"
        ? `
      <div class="field">
        <label>Extra fee (cleaning, service…) — optional</label>
        <input id="custom-cleaning" type="number" inputmode="decimal" step="0.01" min="0" value="${escapeAttr(c.cleaningFee)}" />
      </div>
      ${cleaning > 0 ? `<p class="tiny">Fee splits proportionally after people claim.</p>` : ""}
    `
        : `<p class="banner">You'll add line items on the next screen.</p>`
    }

    <div class="stack">
      <button class="btn btn-primary" id="btn-custom-continue"><span class="tt-check">✓</span> Continue to review</button>
    </div>
  `;
}

function renderParsing() {
  return `
    <div class="hero" style="text-align:center;padding-top:80px">
      <div class="spinner"></div>
      <h2 style="font-family:var(--font-display);font-weight:800;color:var(--ink)">Reading your receipt…</h2>
      <p class="center-copy">Hang tight — then you'll review everything before anyone claims.</p>
    </div>
  `;
}

function renderReview() {
  const d = state.draft;
  const subtotal = d.items.reduce((s, i) => s + i.totalCents, 0);
  const fees = d.fees.reduce((s, f) => s + f.amountCents, 0);
  const isCustom = state.parseSource === "custom";
  return `
    <div class="top-nav">
      <button class="btn btn-ghost" id="btn-back-home">← Home</button>
    </div>
    <section class="hero" style="padding-top:4px">
      <h2 class="brand" style="font-size:2rem">${isCustom ? "Review your split" : "Let's review your items"}</h2>
      <p class="lede">${
        isCustom
          ? "Edit names, quantities, and prices. Guests will claim units from this list."
          : "Make sure everything looks right before you share the claim link."
      }</p>
      ${
        state.parseSource === "demo"
          ? `<p class="banner">Demo mode is on (no vision API key). Add <strong>ANTHROPIC_API_KEY</strong> or <strong>OPENAI_API_KEY</strong> for live receipt OCR.</p>`
          : state.parseSource === "vision"
            ? `<p class="banner">We read your receipt — please double-check the totals.</p>`
            : isCustom
              ? `<p class="banner">Tip: qty is how many spots can be claimed. Line total is for all units of that row (or set per-spot pricing carefully).</p>`
              : ""
      }
    </section>
    <div class="field">
      <label>${isCustom ? "Title" : "Restaurant"}</label>
      <input id="rest-name" value="${escapeAttr(d.restaurant)}" placeholder="${isCustom ? "Airbnb · Downtown loft" : "Restaurant name"}" />
    </div>
    <p class="section-label">Line items <span class="tiny">(name · qty · line total $)</span></p>
    <div id="item-edits">
      ${d.items
        .map(
          (it, idx) => `
        <div class="edit-row" data-idx="${idx}">
          <input class="edit-input name" value="${escapeAttr(it.name)}" placeholder="Item" />
          <input class="edit-input qty" type="number" inputmode="numeric" min="1" step="1" value="${it.qty}" />
          <input class="edit-input total" type="number" inputmode="decimal" step="0.01" value="${(it.totalCents / 100).toFixed(2)}" />
          <button class="icon-btn" data-del-item="${idx}" aria-label="Remove">×</button>
        </div>`
        )
        .join("")}
    </div>
    <button class="btn btn-secondary" id="add-item">+ Add item</button>
    <p class="section-label">Fees (tax / tip / cleaning)</p>
    <div id="fee-edits">
      ${d.fees
        .map(
          (f, idx) => `
        <div class="edit-row" style="grid-template-columns:1fr 100px 40px" data-fee="${idx}">
          <input class="edit-input fname" value="${escapeAttr(f.name)}" />
          <input class="edit-input famount" type="number" step="0.01" value="${(f.amountCents / 100).toFixed(2)}" />
          <button class="icon-btn" data-del-fee="${idx}">×</button>
        </div>`
        )
        .join("")}
    </div>
    <button class="btn btn-secondary" id="add-fee">+ Add fee</button>
    <p class="section-label">Totals</p>
    <p class="item-meta">Items ${money(subtotal)} · Fees ${money(fees)} · <span class="money">${money(subtotal + fees)}</span></p>
    <div class="stack">
      <button class="btn btn-primary" id="btn-publish"><span class="tt-check">✓</span> Looks good — create claim link</button>
    </div>
  `;
}

function renderShare() {
  const r = state.receipt;
  const pct = totalUnits() ? Math.round((claimedUnits() / totalUnits()) * 100) : 0;
  return `
    <div class="top-nav">
      <button class="btn btn-ghost" id="btn-back-home">← Home</button>
    </div>
    <section class="hero" style="padding-top:4px">
      <h2 class="brand" style="font-size:2.2rem">You're ready to share</h2>
      <p class="lede">Send this link to the table. Guests can claim without installing an app.</p>
    </section>
    <div class="link-box" id="claim-url">${r.claimUrl}</div>
    <div class="stack">
      <button class="btn btn-primary" id="btn-copy">Copy link</button>
      <button class="btn btn-secondary" id="btn-native-share">Share…</button>
      <button class="btn btn-gold" id="btn-open-claim">Watch live claims</button>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <p class="tiny">${claimedUnits()} / ${totalUnits()} units claimed · ${pct}%</p>
  `;
}

function renderClaim() {
  const r = state.receipt;
  if (!r) {
    return `<div class="spinner"></div>`;
  }
  const pct = totalUnits() ? Math.round((claimedUnits() / totalUnits()) * 100) : 0;
  return `
    <div class="top-nav">
      <button class="btn btn-ghost" id="btn-back-home">← Home</button>
      ${r.status === "open" ? `<button class="btn btn-ghost" id="btn-to-totals" style="margin-left:auto">Who owes</button>` : ""}
    </div>
    <section class="hero" style="padding-top:4px">
      <h2 class="brand" style="font-size:2.1rem">${escapeHtml(r.restaurant || "Claim your items")}</h2>
      <p class="lede">Tap what you ordered, pick a whole number, and claim. Everyone sees updates live.</p>
      ${state.reconnecting ? `<p class="banner">Reconnecting… showing latest when available.</p>` : ""}
    </section>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <p class="tiny">${pct}% claimed</p>
    <p class="section-label">Still available</p>
    <div class="stack" style="margin-top:0">
      ${r.items
        .map((item) => {
          const claims = r.claims.filter((c) => c.itemId === item.id);
          return `
          <button class="item-row ${item.remaining ? "available" : "claimed-out"}" ${item.remaining && r.status === "open" ? `data-claim="${item.id}"` : "disabled"}>
            <div class="item-main">
              <p class="item-name">${escapeHtml(item.name)}</p>
              <p class="item-meta">${money(item.totalCents)} · ${item.qty} ordered
                ${claims.map((c) => `<span class="claim-chip">${escapeHtml(c.personName)} ×${c.units}${c.personContact ? " · " + escapeHtml(c.personContact) : ""}</span>`).join("")}
              </p>
            </div>
            <span class="badge ${item.remaining ? "" : "empty"}">${item.remaining}</span>
          </button>`;
        })
        .join("")}
    </div>
    <p class="section-label">Fees (split by share)</p>
    ${r.fees.map((f) => `<p class="item-meta">${escapeHtml(f.name)} · ${money(f.amountCents)}</p>`).join("")}
    ${
      state.selectedItem
        ? `
      <div class="overlay" id="overlay"></div>
      <div class="sheet open" id="sheet">
        <div class="sheet-handle"></div>
        <h3>${escapeHtml(state.selectedItem.name)}</h3>
        <p class="muted">${state.selectedItem.remaining} remaining · ${money(state.selectedItem.totalCents)} line</p>
        <div class="field">
          <label>Your name</label>
          <input id="guest-name" value="${escapeAttr(state.guestName)}" autocomplete="name" />
        </div>
        <div class="field">
          <label>Contact (optional)</label>
          <input id="guest-contact" value="${escapeAttr(state.guestContact)}" placeholder="phone or @handle" />
        </div>
        <p class="section-label" style="margin-top:4px">Quantity</p>
        <div class="stepper">
          <button type="button" id="qty-minus" aria-label="Decrease">−</button>
          <span class="qty" id="qty-val">${state.claimQty}</span>
          <button type="button" id="qty-plus" aria-label="Increase">+</button>
        </div>
        <button class="btn btn-primary" id="claim-submit" style="width:100%">Claim</button>
        <button class="btn btn-ghost" id="sheet-close" style="width:100%">Cancel</button>
      </div>`
        : ""
    }
  `;
}

function renderTotals() {
  const r = state.receipt;
  return `
    <div class="top-nav">
      <button class="btn btn-ghost" id="btn-back-claim">← Claims</button>
    </div>
    <section class="hero" style="padding-top:4px">
      <h2 class="brand" style="font-size:2.1rem">Here's what everyone owes</h2>
      <p class="lede">Fees are split by each person's share of the claimed subtotal — not evenly by headcount.</p>
      ${
        state.receipt.items.some((i) => i.remaining > 0)
          ? `<p class="banner">Based on claims so far. Unclaimed items aren't assigned yet, so early claimants temporarily carry all fees until others claim.</p>`
          : ""
      }
    </section>
    <div class="field">
      <label>Payment method</label>
      <select id="host-method">
        ${["Venmo", "Zelle", "Cash App", "PayPal", "Other"]
          .map(
            (m) =>
              `<option ${state.hostMethod === m ? "selected" : ""}>${m}</option>`
          )
          .join("")}
      </select>
    </div>
    <div class="field">
      <label>Your handle / details</label>
      <input id="host-handle" value="${escapeAttr(state.hostHandle)}" placeholder="@you" />
    </div>
    <button class="btn btn-secondary" id="save-host">Save payment info</button>
    <p class="section-label">Per person</p>
    <div class="stack" style="margin-top:0">
      ${
        state.totals.length
          ? state.totals
              .map(
                (p, i) => `
        <div class="person-row" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;justify-content:space-between;gap:12px">
            <div>
              <p class="item-name">${escapeHtml(p.personName)}</p>
              <p class="item-meta">items ${money(p.itemSubtotalCents)} · fees ${money(p.feeShareCents)}</p>
            </div>
            <span class="money" style="font-size:1.2rem">${money(p.totalCents)}</span>
          </div>
          <button class="btn btn-secondary" style="margin-top:10px;min-height:46px" data-pay="${i}">Request payment message</button>
        </div>`
              )
              .join("")
          : `<p class="muted">No claims yet.</p>`
      }
    </div>
    <button class="btn btn-ghost" id="btn-finalize" style="margin-top:16px;width:100%">Finalize claiming</button>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", "&#39;");
}

function render() {
  const el = screen();
  if (state.view === "home") el.innerHTML = renderHome();
  else if (state.view === "create") el.innerHTML = renderCreate();
  else if (state.view === "parsing") el.innerHTML = renderParsing();
  else if (state.view === "review") el.innerHTML = renderReview();
  else if (state.view === "share") el.innerHTML = renderShare();
  else if (state.view === "claim") el.innerHTML = renderClaim();
  else if (state.view === "totals") el.innerHTML = renderTotals();
  bind();
}

function syncCustomFromDom() {
  const c = state.custom;
  const title = document.getElementById("custom-title");
  if (title) c.title = title.value;
  const total = document.getElementById("custom-total");
  if (total) c.totalDollars = total.value;
  const people = document.getElementById("custom-people");
  if (people) c.people = people.value;
  const cleaning = document.getElementById("custom-cleaning");
  if (cleaning) c.cleaningFee = cleaning.value;
  document.querySelectorAll("#tier-edits .edit-row").forEach((row) => {
    const idx = Number(row.dataset.tier);
    const t = c.tiers[idx];
    if (!t) return;
    t.name = row.querySelector(".tname").value;
    t.qty = Math.max(1, Math.round(Number(row.querySelector(".tqty").value) || 1));
    t.amount = row.querySelector(".tamount").value;
  });
}

function buildDraftFromCustom() {
  const c = state.custom;
  const title = (c.title || "Custom split").trim();
  const fees = [];
  const cleaning = Number(c.cleaningFee) || 0;
  if (cleaning > 0) {
    fees.push({
      tempId: "fee-clean",
      name: "Cleaning / service fee",
      amountCents: Math.round(cleaning * 100),
    });
  }

  if (c.mode === "equal") {
    const totalCents = Math.round((Number(c.totalDollars) || 0) * 100);
    const n = Math.max(1, Math.round(Number(c.people) || 1));
    if (totalCents <= 0) {
      toast("Enter a total amount");
      return false;
    }
    // One claimable pool: N shares of equal value
    state.draft = {
      restaurant: title,
      items: [
        {
          tempId: "share",
          name: `Equal share (1 of ${n})`,
          qty: n,
          totalCents,
        },
      ],
      fees,
    };
  } else if (c.mode === "tiers") {
    const items = c.tiers
      .filter((t) => t.name.trim() && Number(t.amount) > 0)
      .map((t, i) => {
        const qty = Math.max(1, Math.round(Number(t.qty) || 1));
        const eachCents = Math.round(Number(t.amount) * 100);
        return {
          tempId: `tier${i}`,
          name: t.name.trim(),
          qty,
          totalCents: eachCents * qty,
        };
      });
    if (!items.length) {
      toast("Add at least one rate with a price");
      return false;
    }
    state.draft = { restaurant: title, items, fees };
  } else {
    state.draft = {
      restaurant: title,
      items: [{ tempId: "t0", name: "", qty: 1, totalCents: 0 }],
      fees,
    };
  }
  state.parseSource = "custom";
  return true;
}

function syncDraftFromDom() {
  if (!state.draft) return;
  const rest = document.getElementById("rest-name");
  if (rest) state.draft.restaurant = rest.value;
  document.querySelectorAll("#item-edits .edit-row").forEach((row) => {
    const idx = Number(row.dataset.idx);
    const it = state.draft.items[idx];
    if (!it) return;
    it.name = row.querySelector(".name").value;
    it.qty = Math.max(1, Math.round(Number(row.querySelector(".qty").value) || 1));
    it.totalCents = Math.round(Number(row.querySelector(".total").value) * 100) || 0;
  });
  document.querySelectorAll("#fee-edits .edit-row").forEach((row) => {
    const idx = Number(row.dataset.fee);
    const f = state.draft.fees[idx];
    if (!f) return;
    f.name = row.querySelector(".fname").value;
    f.amountCents = Math.round(Number(row.querySelector(".famount").value) * 100) || 0;
  });
}

function bind() {
  document.getElementById("btn-demo")?.addEventListener("click", startDemoReceipt);
  document.getElementById("btn-custom")?.addEventListener("click", () => {
    state.view = "create";
    render();
  });
  document.getElementById("btn-manual")?.addEventListener("click", () => {
    state.custom.mode = "blank";
    state.view = "create";
    render();
  });
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncCustomFromDom();
      state.custom.mode = btn.dataset.mode;
      render();
    });
  });
  document.getElementById("add-tier")?.addEventListener("click", () => {
    syncCustomFromDom();
    state.custom.tiers.push({ name: "", qty: 1, amount: "" });
    render();
  });
  document.querySelectorAll("[data-del-tier]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncCustomFromDom();
      state.custom.tiers.splice(Number(btn.dataset.delTier), 1);
      if (!state.custom.tiers.length) {
        state.custom.tiers.push({ name: "Master bedroom", qty: 1, amount: "300" });
      }
      render();
    });
  });
  document.getElementById("btn-custom-continue")?.addEventListener("click", async () => {
    syncCustomFromDom();
    if (!buildDraftFromCustom()) return;
    try {
      const created = await api("/receipts", { method: "POST", body: "{}" });
      state.receipt = created.receipt;
      state.view = "review";
      render();
    } catch (e) {
      toast(e.message || "Could not create split");
    }
  });
  // live preview updates for equal/tiers without full re-render on every key
  ["custom-title", "custom-total", "custom-people", "custom-cleaning"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      syncCustomFromDom();
      if (state.view === "create") render();
    });
  });
  document.getElementById("file-input")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadAndParse(file);
  });
  document.getElementById("btn-back-home")?.addEventListener("click", loadHome);
  document.getElementById("btn-back-claim")?.addEventListener("click", () => {
    state.view = "claim";
    render();
  });
  document.getElementById("add-item")?.addEventListener("click", () => {
    syncDraftFromDom();
    state.draft.items.push({
      tempId: `t${Date.now()}`,
      name: "",
      qty: 1,
      totalCents: 0,
    });
    render();
  });
  document.getElementById("add-fee")?.addEventListener("click", () => {
    syncDraftFromDom();
    state.draft.fees.push({
      tempId: `f${Date.now()}`,
      name: "",
      amountCents: 0,
    });
    render();
  });
  document.querySelectorAll("[data-del-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncDraftFromDom();
      state.draft.items.splice(Number(btn.dataset.delItem), 1);
      render();
    });
  });
  document.querySelectorAll("[data-del-fee]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncDraftFromDom();
      state.draft.fees.splice(Number(btn.dataset.delFee), 1);
      render();
    });
  });
  document.getElementById("btn-publish")?.addEventListener("click", async () => {
    syncDraftFromDom();
    try {
      await publishDraft();
    } catch (e) {
      toast(e.message);
    }
  });
  document.getElementById("btn-copy")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.receipt.claimUrl);
    toast("Link copied");
  });
  document.getElementById("btn-native-share")?.addEventListener("click", async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Split the Wine",
        text: "Claim what you ordered",
        url: state.receipt.claimUrl,
      });
    } else {
      await navigator.clipboard.writeText(state.receipt.claimUrl);
      toast("Link copied");
    }
  });
  document.getElementById("btn-open-claim")?.addEventListener("click", () => {
    history.pushState({}, "", `/r/${state.receipt.id}`);
    state.view = "claim";
    render();
  });
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      history.pushState({}, "", `/r/${btn.dataset.open}`);
      openClaim(btn.dataset.open);
    });
  });
  document.querySelectorAll("[data-claim]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = state.receipt.items.find((i) => i.id === btn.dataset.claim);
      if (item) openSheet(item);
    });
  });
  document.getElementById("overlay")?.addEventListener("click", closeSheet);
  document.getElementById("sheet-close")?.addEventListener("click", closeSheet);
  document.getElementById("guest-name")?.addEventListener("input", (e) => {
    state.guestName = e.target.value;
  });
  document.getElementById("guest-contact")?.addEventListener("input", (e) => {
    state.guestContact = e.target.value;
  });
  document.getElementById("qty-minus")?.addEventListener("click", () => {
    state.claimQty = Math.max(1, state.claimQty - 1);
    document.getElementById("qty-val").textContent = String(state.claimQty);
  });
  document.getElementById("qty-plus")?.addEventListener("click", () => {
    const max = state.selectedItem?.remaining ?? 1;
    state.claimQty = Math.min(max, state.claimQty + 1);
    document.getElementById("qty-val").textContent = String(state.claimQty);
  });
  document.getElementById("claim-submit")?.addEventListener("click", submitClaim);
  document.getElementById("btn-to-totals")?.addEventListener("click", loadTotals);
  document.getElementById("host-method")?.addEventListener("change", (e) => {
    state.hostMethod = e.target.value;
  });
  document.getElementById("host-handle")?.addEventListener("input", (e) => {
    state.hostHandle = e.target.value;
  });
  document.getElementById("save-host")?.addEventListener("click", saveHostInfo);
  document.querySelectorAll("[data-pay]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const person = state.totals[Number(btn.dataset.pay)];
      const msg = paymentMessage(person);
      try {
        await navigator.clipboard.writeText(msg);
        toast("Payment request copied — paste into Messages / WhatsApp");
      } catch {
        toast(msg);
      }
      // Native SMS draft on phones only; skip desktop sms: blank tabs
      const mobile = /iPhone|Android|Mobile/i.test(navigator.userAgent);
      if (mobile) {
        window.location.href = `sms:?&body=${encodeURIComponent(msg)}`;
      }
    });
  });
  document.getElementById("btn-finalize")?.addEventListener("click", async () => {
    await api(`/receipts/${state.receipt.id}/finalize`, {
      method: "POST",
      body: JSON.stringify({ allowUnclaimed: true }),
    });
    toast("Claiming finalized");
    await loadTotals();
  });

  // Keep draft fields live without full re-render on every keystroke for review
  if (state.view === "review") {
    document.getElementById("rest-name")?.addEventListener("change", syncDraftFromDom);
  }
}

// clock
function tickClock() {
  const d = new Date();
  const el = document.getElementById("clock");
  if (el) {
    el.textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
}
tickClock();
setInterval(tickClock, 30000);

window.addEventListener("popstate", () => {
  if (!routeFromUrl()) loadHome();
});

(async function boot() {
  try {
    const health = await api("/health");
    if (!health.visionConfigured) {
      console.info("Vision DEMO mode — set ANTHROPIC_API_KEY or OPENAI_API_KEY for live OCR");
    }
  } catch {}
  if (!routeFromUrl()) loadHome();
})();
