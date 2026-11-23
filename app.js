const CATS = [
  { id: "prima", label: "Prima di partire" },
  { id: "valigia", label: "Valigia" },
  { id: "vedere", label: "Da vedere" },
  { id: "mangiare", label: "Da mangiare" },
  { id: "altro", label: "Altro" },
];
const SUGGESTIONS = [
  ["prima", "Controllare scadenza passaporto"], ["prima", "Compilare la ETA per il Regno Unito"],
  ["prima", "Stampare o salvare le carte d'imbarco"], ["valigia", "Adattatore presa tipo G"],
  ["valigia", "Ombrello pieghevole"], ["valigia", "Caricabatterie e power bank"],
  ["vedere", "Camden Market"], ["vedere", "Tramonto da Primrose Hill"], ["vedere", "Borough Market"],
  ["mangiare", "Fish and chips"], ["mangiare", "Sunday roast in un pub"], ["mangiare", "Afternoon tea"],
];
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
const BUCKET = "biglietti";

const $ = id => document.getElementById(id);
const cfg = window.LONDRA_CONFIG || {};
const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY && !cfg.SUPABASE_URL.includes("XXXX") && !cfg.SUPABASE_KEY.startsWith("INCOLLA"));
const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

let me = null;            // { id, name }
let items = [], tickets = [];
let filter = "tutte", hideDone = false, tab = "lista";
let pendingDelete = null, pendingTicketDelete = null;
let tQuery = "", pendingFile = null, uploading = false;
let channel = null;
const signed = {};        // path -> { url, exp }

try { hideDone = localStorage.getItem("hideDone") === "1"; filter = localStorage.getItem("filter") || "tutte"; } catch (e) {}
$("hideDone").checked = hideDone;

/* Sezioni della lista: la valigia è divisa per persona (nomi presi dal database, non dal codice) */
let people = [];          // [{ id, name }]
function sections() {
  const s = [{ id: "prima", label: "Prima di partire", cat: "prima", owner: null }];
  for (const p of people) s.push({ id: "valigia:" + p.id, label: "Valigia di " + p.name, cat: "valigia", owner: p.id });
  s.push({ id: "valigia", label: people.length ? "Cose in comune" : "Valigia", cat: "valigia", owner: null });
  for (const c of CATS) if (c.id !== "prima" && c.id !== "valigia") s.push({ id: c.id, label: c.label, cat: c.id, owner: null });
  return s;
}
function sectionOf(i) {
  if (i.cat === "valigia") return i.owner && people.some(p => p.id === i.owner) ? "valigia:" + i.owner : "valigia";
  return CATS.some(c => c.id === i.cat) ? i.cat : "altro";
}
function fillAddCat() {
  const sel = $("addCat"), cur = sel.value; sel.textContent = "";
  const all = sections();
  for (const s of all) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.label; sel.appendChild(o); }
  sel.value = all.some(s => s.id === cur) ? cur : "prima";
}
fillAddCat();
async function loadPeople() {
  const { data, error } = await sb.from("trip_info").select("data").eq("key", "persone").maybeSingle();
  if (error) console.error(error);
  people = data && Array.isArray(data.data.list) ? data.data.list : [];
  fillAddCat(); render();
}

function setStatus(msg, err) { const s = $("status"); s.textContent = msg || ""; s.hidden = !msg; s.classList.toggle("err", !!err); }
function show(view) {
  for (const v of ["setupView", "loginView", "nameView", "appView"]) $(v).hidden = v !== view;
  $("addbar").hidden = view !== "appView";
}

/* ---------- Schede ---------- */
function setTab(t, fromHash) {
  tab = ["biglietti", "itinerario"].includes(t) ? t : "lista";
  $("viewList").hidden = tab !== "lista";
  $("viewItin").hidden = tab !== "itinerario";
  $("viewTickets").hidden = tab !== "biglietti";
  $("addForm").hidden = tab !== "lista";
  $("ticketBar").hidden = tab !== "biglietti";
  document.body.style.paddingBottom = tab === "itinerario" ? "40px" : "";
  $("addbar").classList.toggle("off", tab === "itinerario");
  $("tabLista").setAttribute("aria-selected", String(tab === "lista"));
  $("tabItinerario").setAttribute("aria-selected", String(tab === "itinerario"));
  $("tabBiglietti").setAttribute("aria-selected", String(tab === "biglietti"));
  if (!fromHash) { try { history.replaceState(null, "", tab === "lista" ? location.pathname + location.search : "#" + tab); } catch (e) {} }
}
$("tabLista").onclick = () => setTab("lista");
$("tabItinerario").onclick = () => setTab("itinerario");
$("tabBiglietti").onclick = () => setTab("biglietti");
window.addEventListener("hashchange", () => setTab(location.hash.slice(1), true));
setTab(location.hash.slice(1), true);

/* ---------- Lista ---------- */
const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "";
const who = (id, name) => id && me && id === me.id ? "te" : (name || "");

function renderChips() {
  const chips = $("chips"); chips.textContent = "";
  for (const c of [{ id: "tutte", label: "Tutte" }, ...sections()]) {
    const n = c.id === "tutte" ? items.length : items.filter(i => sectionOf(i) === c.id).length;
    if (c.id !== "tutte" && n === 0 && filter !== c.id) continue;
    const b = document.createElement("button"); b.className = "chip"; b.type = "button";
    b.setAttribute("aria-pressed", String(filter === c.id)); b.append(c.label);
    const s = document.createElement("span"); s.className = "n"; s.textContent = n; b.append(s);
    b.onclick = () => { filter = c.id; try { localStorage.setItem("filter", filter); } catch (e) {} if (c.id !== "tutte") $("addCat").value = c.id; render(); };
    chips.appendChild(b);
  }
}

function render() {
  const done = items.filter(i => i.done).length;
  $("count").textContent = `${done} / ${items.length} fatte`;
  $("bar").style.width = items.length ? (done / items.length * 100) + "%" : "0";
  $("nLista").textContent = items.length || "";
  renderChips();
  const list = $("list"); list.textContent = "";
  if (filter !== "tutte" && !sections().some(s => s.id === filter)) filter = "tutte";
  let shown = items.filter(i => filter === "tutte" || sectionOf(i) === filter);
  if (hideDone) shown = shown.filter(i => !i.done);

  if (!items.length) {
    const e = document.createElement("div"); e.className = "empty";
    e.innerHTML = "<strong>La lista è vuota</strong><span>Scrivi qualcosa nella barra in basso e premi +. Oppure parti da qualche idea classica per Londra e poi cancella quello che non serve.</span>";
    const b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.textContent = "Aggiungi 12 idee per Londra";
    b.onclick = addSuggestions; e.appendChild(b); list.appendChild(e); return;
  }
  if (!shown.length) {
    const e = document.createElement("div"); e.className = "empty";
    e.innerHTML = hideDone ? "<strong>Tutto fatto qui 🎉</strong><span>Togli “Nascondi le cose fatte” per rivederle.</span>" : "<strong>Niente in questa categoria</strong>";
    list.appendChild(e); return;
  }
  for (const c of sections()) {
    const rows = shown.filter(i => sectionOf(i) === c.id);
    if (!rows.length) continue;
    const sec = document.createElement("section"); sec.className = "group";
    if (filter === "tutte") { const h = document.createElement("h2"); h.textContent = c.label; sec.appendChild(h); }
    const ul = document.createElement("ul"); ul.className = "list";
    rows.sort((a, b) => (a.done - b.done) || a.created_at.localeCompare(b.created_at));
    for (const it of rows) ul.appendChild(rowEl(it));
    sec.appendChild(ul); list.appendChild(sec);
  }
}

function rowEl(it) {
  const li = document.createElement("li"); li.className = "item" + (it.done ? " done" : "");
  const cb = document.createElement("button"); cb.className = "check"; cb.type = "button";
  cb.setAttribute("role", "checkbox"); cb.setAttribute("aria-checked", String(!!it.done));
  cb.setAttribute("aria-label", it.text); cb.innerHTML = CHECK_SVG; cb.onclick = () => toggle(it);
  const body = document.createElement("div"); body.className = "body"; body.onclick = () => toggle(it);
  const t = document.createElement("div"); t.className = "text"; t.textContent = it.text; body.appendChild(t);
  const name = it.done ? who(it.done_by, it.done_by_name) : who(it.added_by, it.added_by_name);
  if (it.done || name) {
    const m = document.createElement("div"); m.className = "meta";
    m.textContent = it.done ? `Fatto${it.done_at ? " il " + fmtDate(it.done_at) : ""}${name ? " da " + name : ""}` : `Aggiunto da ${name}`;
    body.appendChild(m);
  }
  li.append(cb, body, deleteBtn(it.id, it.text, () => removeItem(it), "item"));
  return li;
}

function deleteBtn(id, label, onConfirm, kind) {
  const isPending = () => (kind === "item" ? pendingDelete : pendingTicketDelete) === id;
  const setPending = v => { if (kind === "item") pendingDelete = v; else pendingTicketDelete = v; };
  const rerender = () => (kind === "item" ? render() : renderTickets());
  const del = document.createElement("button"); del.className = "del"; del.type = "button";
  const confirming = isPending();
  del.textContent = confirming ? "Elimina" : "×"; del.classList.toggle("confirm", confirming);
  del.setAttribute("aria-label", confirming ? "Conferma eliminazione" : "Elimina " + label);
  del.onclick = () => {
    if (isPending()) { setPending(null); onConfirm(); }
    else { setPending(id); rerender(); setTimeout(() => { if (isPending()) { setPending(null); rerender(); } }, 3000); }
  };
  return del;
}

function failed(error) {
  console.error(error);
  const msg = (error && (error.message || error.error)) || "";
  if (/row-level security|permission|not authorized|unauthorized/i.test(msg)) setStatus("Questo account non ha accesso alla lista. Controlla l'email in supabase.sql.", true);
  else setStatus("Modifica non salvata. Controlla la connessione e riprova.", true);
}

async function loadItems() {
  const { data, error } = await sb.from("items").select("*").order("created_at");
  if (error) return failed(error);
  items = data; render();
}
async function toggle(it) {
  const now = !it.done;
  const patch = now ? { done: true, done_at: new Date().toISOString(), done_by: me.id, done_by_name: me.name }
                    : { done: false, done_at: null, done_by: null, done_by_name: null };
  Object.assign(it, patch); render();
  const { error } = await sb.from("items").update(patch).eq("id", it.id);
  if (error) { failed(error); loadItems(); }
}
async function removeItem(it) {
  items = items.filter(x => x.id !== it.id); render();
  const { error } = await sb.from("items").delete().eq("id", it.id);
  if (error) { failed(error); loadItems(); }
}
let addingSuggestions = false;
async function addSuggestions() {
  if (addingSuggestions) return; addingSuggestions = true;
  const { error } = await sb.from("items").insert(SUGGESTIONS.map(([cat, text]) => ({ cat, text, added_by_name: me.name })));
  addingSuggestions = false;
  if (error) failed(error); else loadItems();
}
$("addForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const input = $("addText"); const text = input.value.trim().slice(0, 200);
  if (!text) return;
  input.value = ""; input.focus();
  const sec = sections().find(s => s.id === $("addCat").value) || sections()[0];
  const { error } = await sb.from("items").insert({ text, cat: sec.cat, owner: sec.owner, added_by_name: me.name });
  if (error) { input.value = text; failed(error); } else { setStatus(""); loadItems(); }
});
$("hideDone").addEventListener("change", e => { hideDone = e.target.checked; try { localStorage.setItem("hideDone", hideDone ? "1" : "0"); } catch (x) {} render(); });

/* ---------- Biglietti ---------- */
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function dayStr(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fmtTicketDate(t) {
  const [y, m, d] = t.date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) + (t.time ? " · " + t.time : "");
}

async function ensureSigned(paths) {
  const now = Date.now();
  const missing = paths.filter(p => !signed[p] || signed[p].exp < now + 60000);
  if (!missing.length) return false;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(missing, 3600);
  if (error) { console.error(error); return false; }
  for (const r of data) if (r.signedUrl) signed[r.path] = { url: r.signedUrl, exp: now + 3600 * 1000 };
  return true;
}

function renderTickets() {
  $("nBiglietti").textContent = tickets.length || "";
  const box = $("tickets"); box.textContent = "";
  const q = norm(tQuery.trim());
  const shown = tickets
    .filter(t => !q || norm([t.name, t.note, t.file_name].join(" ")).includes(q))
    .sort((a, b) => {
      const ka = a.date ? a.date + (a.time || "") : "9999", kb = b.date ? b.date + (b.time || "") : "9999";
      return ka < kb ? -1 : ka > kb ? 1 : a.created_at.localeCompare(b.created_at);
    });
  if (!tickets.length) {
    const e = document.createElement("div"); e.className = "empty";
    e.innerHTML = "<strong>Ancora nessun biglietto</strong><span>Premi “Carica un biglietto” in basso e scegli la foto, lo screenshot o il PDF del biglietto. Così li ritrovate tutti qui, anche a Londra.</span>";
    box.appendChild(e); return;
  }
  if (!shown.length) {
    const e = document.createElement("div"); e.className = "empty";
    const s = document.createElement("strong"); s.textContent = `Nessun biglietto per “${tQuery.trim()}”`;
    e.appendChild(s); box.appendChild(e); return;
  }
  const today = dayStr(0), tomorrow = dayStr(1);
  for (const t of shown) {
    const url = signed[t.path] ? signed[t.path].url : "#";
    const card = document.createElement("article"); card.className = "tcard";
    const thumb = document.createElement("a"); thumb.className = "thumb"; thumb.href = url; thumb.target = "_blank"; thumb.rel = "noopener";
    thumb.setAttribute("aria-label", "Apri " + t.name);
    if ((t.content_type || "").startsWith("image/") && url !== "#") {
      const img = document.createElement("img"); img.src = url; img.alt = ""; img.loading = "lazy";
      img.onerror = () => { img.remove(); thumb.textContent = "FOTO"; };
      thumb.appendChild(img);
    } else if ((t.content_type || "") === "application/pdf") { thumb.classList.add("pdf"); thumb.textContent = "PDF"; }
    else thumb.textContent = "FOTO";

    const info = document.createElement("div"); info.className = "tinfo";
    const n = document.createElement("div"); n.className = "tname"; n.textContent = t.name; info.appendChild(n);
    if (t.date) {
      const w = document.createElement("div"); w.className = "twhen"; w.append(fmtTicketDate(t));
      const label = t.date === today ? "Oggi" : t.date === tomorrow ? "Domani" : t.date < today ? "Passato" : "";
      if (label) { const b = document.createElement("span"); b.className = "badge" + (label === "Passato" ? " soft" : ""); b.textContent = label; w.appendChild(b); }
      info.appendChild(w);
    }
    if (t.note) { const no = document.createElement("div"); no.className = "tnote"; no.textContent = t.note; info.appendChild(no); }
    const by = who(t.added_by, t.added_by_name);
    if (by) { const m = document.createElement("div"); m.className = "meta"; m.textContent = "Caricato da " + by; info.appendChild(m); }
    const act = document.createElement("div"); act.className = "tactions";
    const open = document.createElement("a"); open.className = "btn"; open.href = url; open.target = "_blank"; open.rel = "noopener"; open.textContent = "Apri biglietto";
    act.append(open, deleteBtn(t.id, t.name, () => removeTicket(t), "ticket"));
    info.appendChild(act);
    card.append(thumb, info); box.appendChild(card);
  }
}

async function loadTickets() {
  const { data, error } = await sb.from("tickets").select("*").order("created_at");
  if (error) return failed(error);
  tickets = data; renderTickets();
  if (await ensureSigned(tickets.map(t => t.path))) renderTickets();
  if (itin) renderItin();
}

$("tSearch").addEventListener("input", e => { tQuery = e.target.value; renderTickets(); });
let prefill = null;   // dati della tappa quando si carica dall'itinerario
function startUpload(p) { prefill = p || null; setTab("biglietti"); $("tFileInput").click(); }
$("tPick").onclick = () => startUpload(null);
$("tFileInput").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0]; e.target.value = "";
  if (!f) { prefill = null; return; }
  if (!OK_TYPES.includes(f.type)) { setStatus("Formato non supportato. Usa una foto JPG/PNG, uno screenshot o un PDF.", true); return; }
  if (f.size > 20 * 1024 * 1024) { setStatus("Il file è troppo grande (massimo 20 MB).", true); return; }
  pendingFile = f; setStatus("");
  $("tFile").textContent = "File: " + f.name;
  $("tName").value = prefill ? prefill.name : f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 120);
  $("tDate").value = prefill ? prefill.date : ""; $("tTime").value = prefill ? prefill.time : ""; $("tNote").value = "";
  prefill = null;
  $("ticketForm").hidden = false; $("tName").focus(); $("tName").select();
});
$("tCancel").onclick = () => { pendingFile = null; $("ticketForm").hidden = true; };
$("ticketForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  if (!pendingFile || uploading) return;
  const name = $("tName").value.trim().slice(0, 120);
  if (!name) return;
  uploading = true; $("tSave").disabled = true; $("tSave").textContent = "Caricamento…";
  const ext = pendingFile.type === "application/pdf" ? "pdf" : pendingFile.type.split("/")[1].replace("jpeg", "jpg");
  const path = crypto.randomUUID() + "." + ext;
  const up = await sb.storage.from(BUCKET).upload(path, pendingFile, { contentType: pendingFile.type, upsert: false });
  if (up.error) { failed(up.error); }
  else {
    const { error } = await sb.from("tickets").insert({
      name, date: $("tDate").value || null, time: $("tTime").value || null, note: $("tNote").value.trim().slice(0, 200) || null,
      path, content_type: pendingFile.type, file_name: pendingFile.name.slice(0, 200), added_by_name: me.name,
    });
    if (error) { await sb.storage.from(BUCKET).remove([path]); failed(error); }
    else { pendingFile = null; $("ticketForm").hidden = true; setStatus(""); loadTickets(); }
  }
  uploading = false; $("tSave").disabled = false; $("tSave").textContent = "Salva biglietto";
});
async function removeTicket(t) {
  // Prima il file, poi la riga: così non restano mai file orfani nello spazio dei biglietti.
  tickets = tickets.filter(x => x.id !== t.id); renderTickets();
  const rm = await sb.storage.from(BUCKET).remove([t.path]);
  if (rm.error) { failed(rm.error); return loadTickets(); }
  const { error } = await sb.from("tickets").delete().eq("id", t.id);
  if (error) { failed(error); return loadTickets(); }
}

/* ---------- Itinerario (i dati stanno su Supabase, non nel codice) ---------- */
let itin = null, itinLoaded = false, itinDay = null;
try { itinDay = localStorage.getItem("itinDay"); } catch (e) {}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function extLink(url, text) { const a = el("a", "", text || url); a.href = "https://" + url.replace(/^https?:\/\//, ""); a.target = "_blank"; a.rel = "noopener"; return a; }
const TAGS = { "gratis": "free", "ingresso libero": "free", "prenotato": "booked", "da prenotare": "todo", "mercatino": "xmas", "Natale": "xmas" };

// Trova il biglietto caricato per una tappa: nome che contiene una delle parole chiave,
// preferendo quello con la stessa data del giorno.
function ticketFor(keys, date) {
  const ks = (Array.isArray(keys) ? keys : [keys]).map(norm);
  const hits = tickets.filter(t => ks.some(k => norm(t.name + " " + (t.file_name || "")).includes(k)));
  return hits.find(t => t.date === date) || hits.find(t => !t.date) || hits[0] || null;
}

function ticketButton(r, d) {
  const t = ticketFor(r.ticket, d.date);
  if (t) {
    const a = el("a", "tixbtn", "🎟 Biglietto");
    a.href = signed[t.path] ? signed[t.path].url : "#"; a.target = "_blank"; a.rel = "noopener";
    a.setAttribute("aria-label", "Apri il biglietto: " + t.name);
    return a;
  }
  const b = el("button", "tixbtn add", "+ Carica biglietto"); b.type = "button";
  b.onclick = () => startUpload({ name: r.ticketName || r.title, date: d.date, time: r.time });
  return b;
}

async function loadItin() {
  const { data, error } = await sb.from("trip_info").select("data").eq("key", "itinerario").maybeSingle();
  itinLoaded = true;
  if (error) console.error(error);
  itin = data ? data.data : null;
  renderItin();
}

function renderItin() {
  const box = $("viewItin"); box.textContent = "";
  if (!itin) {
    const e = el("div", "empty");
    e.append(el("strong", "", itinLoaded ? "L'itinerario non è ancora stato caricato" : "Caricamento dell'itinerario…"));
    box.appendChild(e); return;
  }
  const today = dayStr(0);
  const days = itin.days || [];
  const keys = [...days.map(d => d.date), "info"];
  if (!keys.includes(itinDay)) itinDay = days.some(d => d.date === today) ? today : (days[0] ? days[0].date : "info");

  const chips = el("nav", "chips"); chips.setAttribute("aria-label", "Giorni");
  for (const k of keys) {
    const d = days.find(x => x.date === k);
    const b = el("button", "chip", d ? d.short : "Info utili"); b.type = "button";
    b.setAttribute("aria-pressed", String(itinDay === k));
    if (d && d.date === today) { const s = el("span", "n", "oggi"); b.append(s); }
    b.onclick = () => { itinDay = k; try { localStorage.setItem("itinDay", k); } catch (e) {} renderItin(); };
    chips.appendChild(b);
  }
  box.appendChild(chips);
  if (itinDay === "info") renderInfo(box); else renderDay(box, days.find(d => d.date === itinDay));
}

function renderDay(box, d) {
  const head = el("div", "dayhead");
  head.append(el("div", "daylabel", d.label), el("h2", "", d.title));
  box.appendChild(head);
  if (d.pills && d.pills.length) {
    const p = el("div", "pills");
    for (const x of d.pills) p.appendChild(el("span", "pill" + (x.k ? " " + x.k : ""), x.t));
    box.appendChild(p);
  }
  const dayTickets = tickets.filter(t => t.date === d.date);
  if (dayTickets.length) {
    const w = el("div", "daytix"); w.append("Biglietti caricati:");
    for (const t of dayTickets) {
      const a = el("a", "", "🎟 " + t.name + (t.time ? " · " + t.time : ""));
      a.href = signed[t.path] ? signed[t.path].url : "#"; a.target = "_blank"; a.rel = "noopener";
      w.appendChild(a);
    }
    box.appendChild(w);
  }
  const ul = el("ul", "tl");
  for (const r of d.rows || []) {
    const li = el("li", "tl-row" + (r.kind ? " " + r.kind : ""));
    const main = el("div");
    const title = el("div", "tl-title", r.title);
    for (const t of r.tags || []) title.appendChild(el("span", "tag " + (TAGS[t] || "free"), t));
    main.appendChild(title);
    if (r.desc) main.appendChild(el("div", "tl-desc", r.desc));
    if (r.ticket) main.appendChild(ticketButton(r, d));
    if (r.guard && itin.guard) main.appendChild(guardDetails(itin.guard));
    li.append(el("div", "tl-time", r.time), main, el("div", "tl-cost", r.cost && r.cost !== "—" ? r.cost : ""));
    ul.appendChild(li);
  }
  box.appendChild(ul);
  if (d.note) box.appendChild(el("div", "callout", d.note));
}

function guardDetails(g) {
  const det = el("details", "guard");
  det.appendChild(el("summary", "", "Come vederlo dall'inizio"));
  const t = el("div", "gtable");
  for (const r of g.rows) {
    const row = el("div", "grow");
    row.append(el("span", "gt", r.time), el("span", "", r.what), el("span", "gw", "📍 " + r.where));
    t.appendChild(row);
  }
  det.appendChild(t);
  if (g.note) { const n = el("p", "small", g.note); n.style.marginTop = "8px"; det.appendChild(n); }
  return det;
}

function section(box, title) { const s = el("section"); s.appendChild(el("h3", "", title)); box.appendChild(s); return s; }

function renderInfo(box) {
  const wrap = el("div", "info"); box.appendChild(wrap);
  const head = el("div", "dayhead");
  head.append(el("div", "daylabel", itin.dates || ""), el("h2", "", itin.title || "Info utili"));
  wrap.appendChild(head);

  if (itin.overview) {
    const g = el("div", "kvgrid");
    for (const o of itin.overview) {
      const kv = el("div", "kv"); kv.append(el("div", "k", o.label));
      const v = el("div", "v", o.value); kv.appendChild(v);
      if (o.map) { const a = el("a", "small", "Apri in Google Maps"); a.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.map); a.target = "_blank"; a.rel = "noopener"; kv.appendChild(a); }
      g.appendChild(kv);
    }
    wrap.appendChild(g);
  }
  if (itin.book) {
    const s = section(wrap, "Da prenotare prima di partire");
    const ul = el("ul", "rowlist");
    for (const b of itin.book) {
      const li = el("li", "stack");
      const top = el("div"); top.append(el("strong", "", b.name + ": "), b.text);
      li.appendChild(top);
      if (b.url) li.appendChild(extLink(b.url));
      ul.appendChild(li);
    }
    s.appendChild(ul);
    if (itin.apps) s.appendChild(el("p", "small", "App utili: " + itin.apps)).style.marginTop = "8px";
  }
  if (itin.rules) {
    const s = section(wrap, "Regole d'oro per spendere poco");
    const ul = el("ul", "rules");
    for (const r of itin.rules) { const li = el("li"); li.append(el("strong", "", r.b + " "), r.t); ul.appendChild(li); }
    s.appendChild(ul);
  }
  if (itin.budget) {
    const s = section(wrap, "Budget a persona");
    const ul = el("ul", "rowlist");
    for (const b of itin.budget) { const li = el("li"); li.append(el("span", "", b.label), el("span", "r", b.value)); ul.appendChild(li); }
    if (itin.budgetTotal) { const li = el("li", "total"); li.append(el("span", "", itin.budgetTotal.label), el("span", "r", itin.budgetTotal.value)); ul.appendChild(li); }
    s.appendChild(ul);
  }
  if (itin.numbers) {
    const s = section(wrap, "Numeri utili");
    const ul = el("ul", "rowlist");
    for (const n of itin.numbers) {
      const li = el("li"); li.appendChild(el("span", "", n.label));
      const r = el("span", "r");
      if (n.tel) { const a = el("a", "", n.value); a.href = "tel:" + n.tel; r.appendChild(a); } else r.textContent = n.value;
      li.appendChild(r); ul.appendChild(li);
    }
    s.appendChild(ul);
    if (itin.numbersNote) s.appendChild(el("p", "small", itin.numbersNote)).style.marginTop = "8px";
  }
  if (itin.links) {
    const s = section(wrap, "Link");
    const ul = el("ul", "rowlist");
    for (const l of itin.links) { const li = el("li", "stack"); li.append(el("span", "", l.label), extLink(l.url)); ul.appendChild(li); }
    s.appendChild(ul);
  }
  if (itin.footnote) wrap.appendChild(el("p", "small", itin.footnote));
}

/* ---------- Accesso ---------- */
$("loginView").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("lBtn").disabled = true; setStatus("");
  const { error } = await sb.auth.signInWithPassword({ email: $("lEmail").value.trim(), password: $("lPass").value });
  $("lBtn").disabled = false;
  if (error) setStatus("Email o password non corrette.", true);
});
$("nameView").addEventListener("submit", async ev => {
  ev.preventDefault();
  const nome = $("nName").value.trim().slice(0, 30);
  if (!nome) return;
  const { data, error } = await sb.auth.updateUser({ data: { nome } });
  if (error) return failed(error);
  enter(data.user);
});
$("logout").onclick = () => sb.auth.signOut({ scope: "local" });   // esce solo da questo telefono

const timers = {};
function refresh(which) {
  clearTimeout(timers[which]);
  timers[which] = setTimeout(() => (which === "items" ? loadItems() : loadTickets()), 250);
}

function enter(user) {
  const nome = user.user_metadata && user.user_metadata.nome;
  if (!nome) { show("nameView"); $("nName").focus(); return; }
  me = { id: user.id, name: nome };
  show("appView"); setStatus("");
  loadPeople(); loadItems(); loadTickets(); loadItin();
  if (!channel) {
    channel = sb.channel("londra")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => refresh("items"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => refresh("tickets"))
      .subscribe();
  }
}

function leave() {
  me = null; items = []; tickets = []; itin = null; itinLoaded = false; people = []; fillAddCat();
  if (channel) { sb.removeChannel(channel); channel = null; }
  render(); renderTickets(); show("loginView");
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && me) { refresh("items"); refresh("tickets"); }
});

render(); renderTickets();
if (!sb) { show("setupView"); }
else {
  sb.auth.onAuthStateChange((event, session) => {
    if (session && session.user) { if (!me || me.id !== session.user.id) setTimeout(() => enter(session.user), 0); }
    else if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") leave();
  });
}
