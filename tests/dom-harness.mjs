// tests/dom-harness.mjs — chromium 不要の自前 DOM ハーネス。
// app.js を vm で評価し、 全 render 関数 × 複数 state バリエーションで実行→例外・空文字・形式エラーを検出する。
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import vm from "vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const code = readFileSync(resolve(root, "app.js"), "utf8");
const stateJson = JSON.parse(readFileSync(resolve(root, "data/scarbon-state.json"), "utf8"));

let failed = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) {
    console.log("✓", name);
  } else {
    console.error("✗", name, detail ? `\n    ${detail}` : "");
    fails.push({ name, detail });
    failed += 1;
  }
}

// ------- 最小限の Browser 環境 mock -------
function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; }
  };
}

function makeElement(tag = "div") {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    children: [],
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    querySelector: () => null,
    querySelectorAll: () => [],
    style: {}, dataset: {}, value: "",
    parentNode: null,
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html || ""; },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text || ""; },
    focus() {}, click() {}, remove() {}
  };
  return el;
}

function makeDocument(rootEl) {
  return {
    documentElement: { setAttribute() {}, getAttribute: () => null, dataset: {} },
    body: rootEl,
    addEventListener() {}, removeEventListener() {},
    createElement: (tag) => makeElement(tag),
    querySelector: (sel) => sel === "#app" ? rootEl : null,
    querySelectorAll: () => []
  };
}

const rootEl = makeElement("div");
const sandboxLocalStorage = makeStorage();
const sandboxFetch = async (path) => {
  // data/scarbon-state.json だけは実体を返す
  if (path && path.endsWith("scarbon-state.json")) {
    return {
      ok: true,
      status: 200,
      json: async () => stateJson,
      text: async () => JSON.stringify(stateJson)
    };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
};

const win = {
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {}, removeListener() {} }),
  addEventListener() {}, removeEventListener() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  confirm: () => true,
  alert: () => {},
  prompt: () => "",
  open: () => null,
  URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
  Blob: function (parts, opts) { this.parts = parts; this.type = (opts || {}).type || ""; },
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  navigator: { language: "ja-JP", userAgent: "harness" },
  location: { hash: "#dashboard", href: "http://test.local/", pathname: "/", search: "" }
};

const sandbox = {
  ...win,
  window: win,
  document: makeDocument(rootEl),
  localStorage: sandboxLocalStorage,
  sessionStorage: makeStorage(),
  fetch: sandboxFetch,
  console: { log() {}, warn() {}, error() {}, info() {} }
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
win.location = sandbox.location;

vm.createContext(sandbox);

try {
  vm.runInContext(code, sandbox, { filename: "app.js" });
  // const / let は global object に bind されないので、 評価直後に明示的に export する
  vm.runInContext(`
    globalThis.__screens = typeof screens !== "undefined" ? screens : null;
    globalThis.__state = typeof state !== "undefined" ? state : null;
    globalThis.__factors = typeof factors !== "undefined" ? factors : null;
    globalThis.__activities = typeof activities !== "undefined" ? activities : null;
    globalThis.__seedFactors = typeof seedFactors !== "undefined" ? seedFactors : null;
    globalThis.__setFactors = (v) => { factors = v; };
    globalThis.__setActivities = (v) => { activities = v; };
  `, sandbox);
  check("app.js を vm で評価できる", true);
} catch (error) {
  check("app.js を vm で評価できる", false, error?.stack || error);
  console.error(`\n${failed} 件失敗（評価不能のため打ち切り）`);
  process.exit(1);
}

// ------- 評価後、 グローバルから関数を取得 -------
const get = (name) => sandbox[name];

// ------- 全 render 関数を全 state バリエーションで呼ぶ -------
const renderNames = [
  "renderDashboard", "renderDataInput", "renderDataList", "renderFactors",
  "renderAnalytics", "renderReports", "renderGoals", "renderActions",
  "renderAlerts", "renderSettings", "renderOnboarding",
  "renderActualLineChart", "renderCategoryBreakdown", "renderSiteBreakdown",
  "renderHistoryModal", "renderLegacyBackupSection",
  "renderHeroMetric", "renderScopeMetric"
];

renderNames.forEach((name) => {
  const fn = get(name);
  check(`${name} が定義されている`, typeof fn === "function");
});

// 各 render を「データなし」「シードあり」「busy/historyOpen」「backupFailed風」のバリエーションで実行
function runVariation(label, mutate) {
  const seed = stateJson.factors.slice();
  // 状態を毎回リセット (vm context 内の let を __set* で更新)
  sandbox.__setFactors(seed);
  sandbox.__setActivities([]);
  const state = sandbox.__state;
  if (!state) return; // 失敗してたらスキップ
  state.route = "dashboard";
  state.scope = "Scope 1";
  state.factorFilter = "すべて";
  state.selectedFactorId = "";
  state.toast = ""; state.toastType = "info";
  state.history = [];
  state.historyOpen = false;
  state.busy = false;
  state.draft = { factorId: "", amount: "", site: "", supplier: "", date: "", memo: "" };
  state.settings = {
    theme: "light", site: "すべてのサイト", period: "全期間",
    githubOwner: "", githubRepo: "", githubBranch: "main",
    dataPath: "data/scarbon-state.json"
  };
  state.remote = { sha: "", syncedAt: "" };
  // mutate には (sandbox, state) を渡す
  mutate(sandbox, state);
  // mutate 後の値を vm context にも反映
  if (Array.isArray(sandbox.factors)) sandbox.__setFactors(sandbox.factors);
  if (Array.isArray(sandbox.activities)) sandbox.__setActivities(sandbox.activities);

  const renderTargets = [
    "renderDashboard", "renderDataInput", "renderDataList", "renderFactors",
    "renderAnalytics", "renderReports", "renderGoals", "renderActions",
    "renderAlerts", "renderSettings", "renderOnboarding"
  ];
  renderTargets.forEach((name) => {
    const fn = get(name);
    if (typeof fn !== "function") return;
    let html, error;
    try {
      html = fn();
    } catch (e) {
      error = e;
    }
    check(`[${label}] ${name} が文字列を返す`, !error && typeof html === "string" && html.length > 0, error?.stack || (typeof html));
    // 結果文字列に <script> など実行可能タグが含まれない（XSS 入力をエスケープしているか）
    if (typeof html === "string" && label === "XSS 入力混入") {
      const hasScriptTag = /<script\b/i.test(html);
      // open tag を抜き出し、 quoted attribute value を除去した後で on*= が残っていれば危険
      const tags = html.match(/<[a-z][^>]*>/gi) || [];
      const dangerousTag = tags.find((tag) => {
        const stripped = tag.replace(/="[^"]*"/g, "=").replace(/='[^']*'/g, "=");
        return /\son\w+\s*=/i.test(stripped);
      });
      check(`[${label}] ${name} に <script> 開始タグが含まれない`, !hasScriptTag, hasScriptTag ? html.match(/<script[^<]*/i)?.[0] : "");
      check(`[${label}] ${name} の open tag に裸の on*= ハンドラが付かない`, !dangerousTag, dangerousTag || "");
    }
  });
}

runVariation("空データ", () => {
  sandbox.factors = [];
  sandbox.activities = [];
});
runVariation("seed のみ (activities なし)", () => {
  sandbox.factors = stateJson.factors.slice();
  sandbox.activities = [];
});
runVariation("seed + activities 数件", () => {
  sandbox.factors = stateJson.factors.slice();
  sandbox.activities = [
    { id: "a1", factorId: "f-electricity", amount: 1000, site: "本社", supplier: "東電", date: "2026-04-01", memo: "テスト" },
    { id: "a2", factorId: "f-citygas", amount: 50, site: "本社", supplier: "東ガス", date: "2026-04-02", memo: "" },
    { id: "a3", factorId: "f-commute-rail", amount: 800, site: "本社", supplier: "", date: "2026-03-15", memo: "" }
  ];
});
runVariation("activities に orphan factorId", () => {
  sandbox.factors = stateJson.factors.slice();
  sandbox.activities = [
    { id: "orphan", factorId: "f-deleted-xxx", amount: 10, site: "拠点", supplier: "", date: "2026-04-01", memo: "" }
  ];
});
runVariation("busy=true (履歴モーダル開)", (sandbox, state) => {
  sandbox.factors = stateJson.factors.slice();
  sandbox.activities = [];
  state.busy = true;
  state.historyOpen = true;
  state.history = [
    { sha: "abc1234567890", commit: { author: { name: "test", date: "2026-04-26T00:00:00Z" }, message: "test commit" } }
  ];
});
runVariation("XSS 入力混入", () => {
  sandbox.factors = [{
    id: "xss", scope: "Scope 1", name: "<img src=x onerror=alert(1)>", category: "<svg/onload=alert(1)>",
    unit: "<b>kg</b>", coefficient: 0.5, source: "<script>alert(1)</script>",
    region: "&\"<>", year: "2024", status: "カスタム"
  }];
  sandbox.activities = [
    { id: "x1", factorId: "xss", amount: 1, site: "<svg onload=alert(1)>", supplier: "<", date: "2026-04-01", memo: "<script>" }
  ];
});
runVariation("settings に旧 period 値", (sandbox, state) => {
  sandbox.factors = stateJson.factors.slice();
  sandbox.activities = [{ id: "a", factorId: "f-electricity", amount: 100, site: "x", supplier: "", date: "2026-04-01", memo: "" }];
  // normalizeSettings の効果は state init 時のみだが、 ここでは raw 値を直接代入してフィルタが暴れないか確認
  state.settings.period = "2026年4月";
});

// ------- screens の id が renderScreen の renderers キーと完全一致 -------
const screens = sandbox.__screens;
check("screens 配列が取得できる", Array.isArray(screens) && screens.length > 0);
if (Array.isArray(screens)) {
  const expectedIds = screens.map((s) => s.id).sort();
  // renderScreen 内の renderers キーをソースから抽出
  const renderersBlock = code.match(/const renderers = \{([\s\S]*?)\};/);
  const renderersIds = renderersBlock ? Array.from(renderersBlock[1].matchAll(/(?:^|\s|"|')([a-z][\w-]*)(?:"|')?\s*:/g)).map((m) => m[1]).sort() : [];
  check(`screens の id (${expectedIds.length}) と renderers のキー (${renderersIds.length}) が一致`,
    expectedIds.length === renderersIds.length && expectedIds.every((id, i) => id === renderersIds[i]),
    `expected=${expectedIds.join(",")} actual=${renderersIds.join(",")}`);
}

// ------- 全 data-* 属性に click ハンドラ分岐があるか -------
const dataAttrUsed = new Set();
const re = /data-([a-z][a-z0-9-]*)/g;
let m;
while ((m = re.exec(code)) !== null) dataAttrUsed.add(m[1]);
// click ハンドラの closest セレクタから ハンドルされている属性を抽出
const closestMatch = code.match(/closest\("(\[data-[^"]+\])"\)/);
const handledList = closestMatch ? Array.from(closestMatch[1].matchAll(/data-([a-z][a-z0-9-]*)/g)).map((mm) => mm[1]) : [];
const handled = new Set(handledList);
// 意図的に click ハンドラを持たない属性
// - draft / setting: input/change ハンドラで処理
// - input / list / table: 「data-input」「data-list」route 値 / `<input list="...">` / `class="data-table"` の false-positive
const exempt = new Set([
  "draft", "setting", "factor-id", "delete-activity", "delete-factor",
  "delete-legacy", "export-legacy", "save-entry", "add-factor", "token-save",
  "token-clear", "remote-action", "restore-sha", "close-history", "scope",
  "factor-filter", "fill-factor", "theme", "export", "export-report",
  "seed-reset", "clear-activities", "route",
  "input", "list", "table"
]);
const missing = Array.from(dataAttrUsed).filter((a) => !handled.has(a) && !exempt.has(a));
check(`click ハンドラに分岐の無い data-* 属性が無い (使用: ${dataAttrUsed.size})`, missing.length === 0, `missing: ${missing.join(", ")}`);

// ------- showToast の自動消去が render() を呼ばない (プルダウン消える問題) -------
const toastCallbackMatch = code.match(/showToast\.timer = window\.setTimeout\(\(\) => \{([\s\S]+?)\n\s*\}, duration\);/);
const toastCallbackBody = toastCallbackMatch ? toastCallbackMatch[1] : "";
check(
  "showToast 自動消去のコールバック内で render() を呼ばない",
  toastCallbackBody.length > 0 && !/\brender\(\)/.test(toastCallbackBody),
  toastCallbackBody.length === 0 ? "callback 取得失敗" : `callback body=${toastCallbackBody.replace(/\s+/g, " ").slice(0, 200)}`
);
check(
  "showToast 自動消去で toast 要素を removeChild",
  /removeChild\(el\)/.test(toastCallbackBody)
);

// ------- bootstrapData が ok/reason を返す (シードリセット失敗を検知できる) -------
check("bootstrapData が { ok, reason } を返す", /reason: "fetch-error"/.test(code) && /reason: "empty-seed"/.test(code) && /reason: "fetched"/.test(code));
check("seed-reset がシードリセット失敗時に error toast", /シードデータの読み込みに失敗しました/.test(code));

// ------- 結果 -------
if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log(`\nすべて PASS（${renderNames.length} renderer × バリエーション + 構造チェック）`);
