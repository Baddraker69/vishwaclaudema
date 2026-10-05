// Find tools: search the whole index in the browser. Same matching as tools/discover find:
// every word must appear (or name the tool's task), exact matches count for more.
const TASK_WORDS = {
  web: "website site landing webapp", design: "design ui ux look style",
  mobile: "mobile iphone ios android app-store", testing: "test tests testing qa bugs",
  security: "security safe secure secrets", data: "data database spreadsheet excel sheets",
  docs: "docs documents slides slide presentation powerpoint pdf word writing",
  deploy: "deploy hosting publish launch", automation: "automate automation workflow schedule",
  marketing: "seo marketing social growth", productivity: "email calendar meetings notes",
};
const WORD_TASK = {};
for (const [task, words] of Object.entries(TASK_WORDS)) for (const w of words.split(" ")) WORD_TASK[w] = task;

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const state = { q: params.get("q") || "", kind: params.get("kind") || "", task: params.get("task") || "", shown: 30 };
let tools = [];

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "k" : String(n));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeUrl = (u) => (/^https:\/\//.test(u || "") ? u : null);
const DOTS = {
  tried: '<circle cx="5.5" cy="5.5" r="4.7" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="5.5" cy="5.5" r="1.7" fill="currentColor"/>',
  adopted: '<circle cx="5.5" cy="5.5" r="4.7" fill="var(--sig)" stroke="currentColor" stroke-width="1.1"/>',
  no: '<circle cx="5.5" cy="5.5" r="4.7" fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 1.6"/>',
};
const verdict = (id) => '<div class="verdict" role="group" aria-label="Your verdict">'
  + [["tried", "Tried"], ["adopted", "Adopted"], ["no", "Not for me"]].map(([k, l]) =>
    `<button type="button" aria-pressed="false" data-mark="${esc(id)}" data-v="${k}"><span class="sd"><svg viewBox="0 0 11 11" width="11" height="11" aria-hidden="true">${DOTS[k]}</svg></span>${l}</button>`).join("")
  + "</div>";

function signals(t) {
  const out = [];
  if (t.installs) out.push(fmt(t.installs) + " installs");
  if (t.stars) out.push(fmt(t.stars) + " stars");
  if (t.growth) out.push("rising ×" + t.growth);
  if (t.official === "anthropic") out.push("by Anthropic");
  else if (t.official === "marketplace") out.push("official marketplace");
  else if (t.vendor) out.push("by the vendor");
  return out.join(" · ");
}

// ---- Installing: one prompt to paste into Claude Code, for one tool or a whole list ----
const LIST_KEY = "vishwaclaudema:install-list";
let installList = [];
try { installList = JSON.parse(localStorage.getItem(LIST_KEY) || "[]"); } catch { installList = []; }
const saveList = () => { try { localStorage.setItem(LIST_KEY, JSON.stringify(installList)); } catch {} };
const byId = (id) => tools.find((t) => t.id === id);
const VERDICT = { safe: "safe", "safe with caveats": "safe with caveats", reject: "not for beginners", no: "not for beginners" };

function toolBlock(t) {
  const v = t.vetted;
  if (v) {
    return `- **${t.name}** (${t.kind}). Safety-checked by Vishwaclaudema on ${v.scanned} at commit ${v.sha}: ${VERDICT[v.start] || v.start || "reviewed"}.`
      + (v.note ? ` ${v.note}` : "") + `\n  Install it with exactly this command:\n  \`${v.cmd}\``;
  }
  return `- **${t.name}** (${t.kind})${t.repo ? ` from https://github.com/${t.repo}` : t.link ? ` from ${t.link}` : ""}. Not reviewed by Vishwaclaudema. `
    + "Before installing it, download it without running anything, read every file, and tell me in plain words what it does and anything risky: scripts it runs, network calls, reading keys or files outside this project, or instructions to skip permission prompts. Install it only if I say yes.";
}

function installPrompt(list) {
  return `Install ${list.length === 1 ? "this tool" : "these tools"} into this project only, one at a time, explaining each step in plain English.\n\n`
    + list.map(toolBlock).join("\n\n")
    + "\n\nRules: install at project scope only (skills go in this project's `.claude/skills/`), never for my whole computer, and never run a tool's own install scripts without asking me. "
    + "If Claude Code refuses a command, show it to me so I can run it myself. Commit what you installed with a clear message. "
    + "If a plugin was installed, tell me to restart Claude Code so this conversation resumes, then type \"continue\". "
    + "Finish by listing what was installed and how to remove each one.";
}

async function copyText(text, btn) {
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
  catch { btn.textContent = "Select and copy"; }
  setTimeout(() => (btn.textContent = label), 1500);
}

function renderList() {
  const bar = $("#install-bar");
  if (!bar) return;
  const items = installList.map(byId).filter(Boolean);
  bar.hidden = items.length === 0;
  $("#install-count").textContent = `Install list · ${items.length} ${items.length === 1 ? "tool" : "tools"}`;
  $("#install-names").textContent = items.map((t) => t.name).join(", ");
  for (const b of document.querySelectorAll("[data-add]")) {
    const on = installList.includes(b.dataset.add);
    b.textContent = on ? "In install list ✓" : "Add to install list";
    b.setAttribute("aria-pressed", String(on));
  }
}

function search() {
  const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const mine = state.kind === "mine" ? (window.vcMarks?.() || {}) : null;
  const hits = [];
  for (const t of tools) {
    if (mine) { if (!mine["tool:" + t.id]) continue; }
    else if (state.kind === "vetted") { if (!t.vetted) continue; }
    else if (state.kind && t.kind !== state.kind) continue;
    if (state.task && !(t.tasks || []).includes(state.task)) continue;
    const hay = [t.name, t.repo, t.desc, (t.tasks || []).join(" ")].join(" ").toLowerCase();
    let exact = 0, ok = true;
    for (const w of words) {
      if (hay.includes(w)) exact++;
      else if (!(WORD_TASK[w] && (t.tasks || []).includes(WORD_TASK[w]))) { ok = false; break; }
    }
    if (ok) hits.push([t.score + 10 * exact + (t.vetted ? 15 : 0), t]);
  }
  return hits.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

function render() {
  const hits = search();
  $("#count").textContent = `${hits.length.toLocaleString("en-GB")} ${hits.length === 1 ? "tool" : "tools"}`
    + (state.kind === "mine" ? " you have marked" : "");
  $("#results").innerHTML = hits.slice(0, state.shown).map((t) => {
    const url = safeUrl(t.link);
    const name = url ? `<a href="${esc(url)}" rel="noopener">${esc(t.name)} ↗</a>` : esc(t.name);
    const flags = [t.suspect ? "suspect install counts: " + t.suspect : "", t.stale ? "no updates in 6 months" : ""].filter(Boolean);
    return `<li class="entry"><span class="no">${esc(t.kind)}</span><div>`
      + `<span class="label">${t.repo ? esc(t.repo) : ""}${signals(t) ? " · " + esc(signals(t)) : ""}</span>`
      + `<h3 class="h3">${name}</h3>`
      + (t.desc ? `<p class="small-read">${esc(t.desc)}</p>` : "")
      + (flags.length ? `<span class="flag">${esc(flags.join(" · "))}</span>` : "")
      + (t.vetted ? `<span class="label vetted">Vetted ${esc(t.vetted.scanned)} at ${esc(t.vetted.sha)} · ${esc(VERDICT[t.vetted.start] || t.vetted.start || "reviewed")}</span>`
                  : '<span class="label">Not reviewed yet: the install prompt has Claude check it first</span>')
      + `<div class="row install-row"><button type="button" class="link" data-install="${esc(t.id)}">Copy install prompt</button>`
      + `<button type="button" class="link" data-add="${esc(t.id)}" aria-pressed="false">Add to install list</button></div>`
      + verdict("tool:" + t.id) + "</div></li>";
  }).join("") + (hits.length > state.shown ? '<li><button type="button" class="more" id="more">Show more</button></li>' : "");
  for (const b of document.querySelectorAll("[data-kind]")) b.classList.toggle("on", b.dataset.kind === state.kind);
  for (const b of document.querySelectorAll("[data-task]")) b.classList.toggle("on", b.dataset.task === state.task);
  window.vcPaint?.();
  renderList();
  const p = new URLSearchParams();
  for (const k of ["q", "kind", "task"]) if (state[k]) p.set(k, state[k]);
  history.replaceState(null, "", p.toString() ? "?" + p : location.pathname);
}

document.addEventListener("click", (e) => {
  const kind = e.target.closest("[data-kind]");
  const task = e.target.closest("[data-task]");
  if (kind) { state.kind = kind.dataset.kind; state.shown = 30; render(); }
  if (task) { state.task = state.task === task.dataset.task ? "" : task.dataset.task; state.shown = 30; render(); }
  if (e.target.id === "more") { state.shown += 30; render(); }
  const one = e.target.closest("[data-install]");
  if (one) { const t = byId(one.dataset.install); if (t) copyText(installPrompt([t]), one); }
  const add = e.target.closest("[data-add]");
  if (add) {
    const id = add.dataset.add;
    installList = installList.includes(id) ? installList.filter((x) => x !== id) : [...installList, id];
    saveList(); renderList();
  }
  if (e.target.id === "install-copy") copyText(installPrompt(installList.map(byId).filter(Boolean)), e.target);
  if (e.target.id === "install-clear") { installList = []; saveList(); renderList(); }
});

let timer;
$("#q").value = state.q;
$("#q").addEventListener("input", (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.q = e.target.value.trim(); state.shown = 30; render(); }, 120);
});

fetch("/data/tools.json").then((r) => r.json()).then((d) => { tools = d.tools; render(); })
  .catch(() => { $("#count").textContent = "Could not load the index. Try reloading."; });
