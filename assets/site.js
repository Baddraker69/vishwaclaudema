// The public site's only state: a visitor's own Tried / Adopted / Not for me marks, kept in this
// browser (localStorage), never sent anywhere. They fill the kolam dots, as on the dashboard.
const KEY = "vishwaclaudema:marks";
const SITE = window.SITE || { today: { prefix: "", total: 0 }, kits: {} };

function loadMarks() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function saveMarks(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private window: marks last this visit */ }
}
let marks = loadMarks();
window.vcMarks = () => marks;

// How many dots each kolam fills, from the marks.
function progress() {
  const ids = Object.keys(marks);
  const adopted = (pre) => ids.filter((k) => k.startsWith(pre) && marks[k] === "adopted").length;
  const out = { counts: {}, fill: {} };
  const t = SITE.today;
  const looked = t.prefix ? ids.filter((k) => k.startsWith(t.prefix)).length : 0;
  out.fill.today = t.total ? Math.round((looked / t.total) * 4) : 0;
  let kitSteps = 0;
  for (const [id, total] of Object.entries(SITE.kits)) {
    const n = adopted(`kit:${id}:`);
    kitSteps += n;
    out.counts[`kit:${id}`] = n;
    out.fill[`kit:${id}`] = total ? Math.round((n / total) * 10) : 0;
  }
  out.counts.start = kitSteps;
  // Start's kolam has one dot per kit: a kit you have adopted anything in fills its dot
  out.fill.start = Object.keys(SITE.kits).filter((id) => adopted(`kit:${id}:`) > 0).length;
  // Learn: each playbook's triangle fills with its adopted steps; the tab shows your furthest one
  let furthest = 0, learnSteps = 0;
  for (const [slug, total] of Object.entries(SITE.learn || {})) {
    const n = adopted(`learn:${slug}:`);
    learnSteps += n;
    out.counts[`learn:${slug}`] = n;
    out.fill[`learn:${slug}`] = total ? Math.round((n / total) * 10) : 0;
    furthest = Math.max(furthest, out.fill[`learn:${slug}`]);
  }
  out.counts.learn = learnSteps;
  out.fill.learn = furthest;
  // Improve: each recipe you mark adopted, or a tool from it, fills one of the 8 dots
  const recipes = new Set(ids.filter((k) => k.startsWith("improve:") && marks[k] === "adopted").map((k) => k.split(":")[1]));
  out.counts.improve = recipes.size;
  out.fill.improve = Math.min(recipes.size, 8);
  const tools = new Set(ids.filter((k) => marks[k] === "adopted" && (k.startsWith("tool:") || k.includes(":tool:")))
    .map((k) => k.split("tool:").pop()));
  out.counts.library = tools.size;
  out.fill.library = Math.min(tools.size, 6);
  return out;
}

function paint() {
  const p = progress();
  for (const svg of document.querySelectorAll("svg[data-progress]")) {
    const k = p.fill[svg.dataset.progress] || 0;
    svg.querySelectorAll("circle.kd").forEach((c, i) => c.setAttribute("fill", i < k ? "var(--sig)" : "var(--paper)"));
  }
  for (const el of document.querySelectorAll("[data-count]")) el.textContent = p.counts[el.dataset.count] ?? 0;
  for (const b of document.querySelectorAll("[data-mark]")) b.setAttribute("aria-pressed", String(marks[b.dataset.mark] === b.dataset.v));
}
window.vcPaint = paint;

document.addEventListener("click", async (e) => {
  // Tried / Adopted / Not for me: pressing the current choice again clears it
  const m = e.target.closest("[data-mark]");
  if (m) {
    const id = m.dataset.mark;
    if (marks[id] === m.dataset.v) delete marks[id]; else marks[id] = m.dataset.v;
    saveMarks(marks);
    paint();
    return;
  }
  // Copy: a command (data-copy-text) or a whole block (data-copy="element id")
  const c = e.target.closest("[data-copy], [data-copy-text]");
  if (!c) return;
  const text = c.dataset.copyText ?? document.getElementById(c.dataset.copy)?.innerText;
  if (text == null) return;
  const label = c.textContent;
  try { await navigator.clipboard.writeText(text); c.textContent = "Copied"; }
  catch { c.textContent = "Select and copy"; }
  setTimeout(() => (c.textContent = label), 1500);
});

document.addEventListener("DOMContentLoaded", paint);
