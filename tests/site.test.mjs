// Safety tests: pin down how the site works today, so a change that breaks it shows up.
// Run from the project root with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function htmlPages(dir = ROOT) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".") || name === "node_modules") return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlPages(p);
    return name.endsWith(".html") ? [p] : [];
  });
}

// Runs assets/site.js with a fake browser and returns what the page would see.
function loadSite(stored = {}) {
  const storage = new Map(Object.entries(stored));
  const listeners = {};
  const window = {};
  const context = {
    window,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    document: {
      addEventListener: (type, fn) => (listeners[type] = fn),
      querySelectorAll: () => [],
      getElementById: () => null,
    },
    navigator: {},
    setTimeout,
  };
  vm.runInNewContext(readFileSync(join(ROOT, "assets/site.js"), "utf8"), context);
  const clickMark = (mark, v) =>
    listeners.click({ target: { closest: (sel) => (sel === "[data-mark]" ? { dataset: { mark, v } } : null) } });
  return { window, storage, listeners, clickMark };
}

test("there are 41 HTML pages and every one loads the shared /assets/site.js", () => {
  const pages = htmlPages();
  assert.equal(pages.length, 41);
  for (const p of pages) {
    assert.match(readFileSync(p, "utf8"), /<script src="\/assets\/site\.js" defer>/, p);
  }
});

test("data/tools.json loads and lists tools", () => {
  const data = JSON.parse(readFileSync(join(ROOT, "data/tools.json"), "utf8"));
  assert.equal(typeof data.updated, "string");
  assert.ok(Array.isArray(data.tools) && data.tools.length > 0);
  for (const t of data.tools) assert.ok(t.id && t.name, `tool missing id or name: ${JSON.stringify(t).slice(0, 80)}`);
});

test("site.js runs on a page and sets up click and page-load handlers", () => {
  const { window, listeners } = loadSite();
  assert.equal(typeof window.vcMarks, "function");
  assert.equal(typeof window.vcPaint, "function");
  assert.equal(typeof listeners.click, "function");
  assert.equal(typeof listeners.DOMContentLoaded, "function");
});

test("existing marks are read back from the browser", () => {
  const { window } = loadSite({ "vishwaclaudema:marks": '{"kit:website:a":"adopted"}' });
  assert.deepEqual({ ...window.vcMarks() }, { "kit:website:a": "adopted" });
});

test("damaged saved marks are ignored instead of breaking the page", () => {
  const { window } = loadSite({ "vishwaclaudema:marks": "not json" });
  assert.deepEqual({ ...window.vcMarks() }, {});
});

test("clicking a mark saves it in the browser, and clicking it again clears it", async () => {
  const { storage, clickMark } = loadSite();
  await clickMark("kit:website:a", "tried");
  assert.deepEqual(JSON.parse(storage.get("vishwaclaudema:marks")), { "kit:website:a": "tried" });
  await clickMark("kit:website:a", "tried");
  assert.deepEqual(JSON.parse(storage.get("vishwaclaudema:marks")), {});
});
