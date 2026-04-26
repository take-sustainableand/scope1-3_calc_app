// tests/smoke.mjs — 依存ゼロの軽量検査。Playwright 環境がなくても node tests/smoke.mjs で実行できる。
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = readFileSync(resolve(root, "app.js"), "utf8");
const stateJson = JSON.parse(readFileSync(resolve(root, "data/scarbon-state.json"), "utf8"));

let failed = 0;
function check(name, ok) {
  if (ok) {
    console.log("✓", name);
  } else {
    console.error("✗", name);
    failed += 1;
  }
}

// 必要関数
check("escapeHTML が定義されている", /function escapeHTML\(/.test(src));
check("escapeAttr が定義されている", /function escapeAttr\(/.test(src));
check("calcEmission が定義されている", /function calcEmission\(/.test(src));
check("computeAlerts が定義されている", /function computeAlerts\(/.test(src));
check("monthlyTotalsForChart が定義されている", /function monthlyTotalsForChart\(/.test(src));
check("renderOnboarding が定義されている", /function renderOnboarding\(/.test(src));
check("renderActualLineChart が定義されている", /function renderActualLineChart\(/.test(src));
check("renderCategoryBreakdown が定義されている", /function renderCategoryBreakdown\(/.test(src));
check("renderSiteBreakdown が定義されている", /function renderSiteBreakdown\(/.test(src));
check("siteSuggestions が定義されている", /function siteSuggestions\(/.test(src));
check("periodSuggestions が定義されている", /function periodSuggestions\(/.test(src));

// 削除されたモック
check("ハードコード '↓ 8.6%' が残っていない", !/↓ 8\.6%/.test(src));
check("ハードコード '↓ 12.4%' が残っていない", !/↓ 12\.4%/.test(src));
check("ハードコード '42.1%' が残っていない", !/42\.1%/.test(src));
check("ハードコード '想定削減 ${280' が残っていない", !/想定削減 \$\{280/.test(src));
check("AIインサイトの固定文言が残っていない", !/Scope 2の改善が効果的です/.test(src));
check("renderLineChart モック関数が削除されている", !/function renderLineChart\(/.test(src));
check("renderDonut モック関数が削除されている", !/function renderDonut\(/.test(src));
check("renderBarList モック関数が削除されている", !/function renderBarList\(/.test(src));
check("renderAlertRows モック関数が削除されている", !/function renderAlertRows\(/.test(src));
check("analysis-mode クラスが残っていない", !/analysis-mode/.test(src));
check("dark-card クラスが残っていない", !/dark-card/.test(src));

// 拠点が select 固定リストではなく自由 input であること
check("拠点フォームが input になっている", /data-draft="site"\s+list="site-suggestions"/.test(src));

// シードに公開原単位が入っていること
check("seed に電力が入っている", /id: "f-electricity"/.test(src));
check("seed に都市ガスが入っている", /id: "f-citygas"/.test(src));
check("seed にガソリン・軽油が入っている", /id: "f-gasoline"/.test(src) && /id: "f-diesel"/.test(src));
check("seed に通勤(鉄道/路線バス/自家用乗用車)が入っている", /f-commute-rail/.test(src) && /f-commute-bus/.test(src) && /f-commute-car/.test(src));

// data/scarbon-state.json も同等の seed
check("JSON に factors が 7件以上ある", Array.isArray(stateJson.factors) && stateJson.factors.length >= 7);
check("JSON の activities は空", Array.isArray(stateJson.activities) && stateJson.activities.length === 0);
check("JSON に通勤(自家用乗用車)係数 0.000130 が含まれる", stateJson.factors.some((f) => f.id === "f-commute-car" && f.coefficient === 0.000130));

// XSS 対策: HTML 出力行で escape を経由していない factor / activity の生展開を検出
// （文字列代入や Map key 内の `${factor.scope}` などは HTML タグを含まない行なので除外）
const bareFactor = src.split("\n").filter((line) =>
  /\$\{factor[^}]*\.(name|category|region|year|unit|coefficient|scope)\}/.test(line) &&
  !/escapeHTML|escapeAttr|formatNumber|calcEmission/.test(line) &&
  /<[a-z]/i.test(line)
);
check("HTML出力行で factor.* の生展開がゼロ", bareFactor.length === 0);

const bareActivity = src.split("\n").filter((line) =>
  /\$\{activity\.(site|date|memo|factorId|amount)\}/.test(line) &&
  !/escapeHTML|escapeAttr|formatNumber|calcEmission/.test(line) &&
  /<[a-z]/i.test(line)
);
check("HTML出力行で activity.* の生展開がゼロ", bareActivity.length === 0);

// アバター / placeholder / アカウント名
check("アバター文字が 'T'", />T</.test(src));
check("placeholder の例示が 'take'", /placeholder="例：take"/.test(src));

// トークンが localStorage 専用キーで管理される
check("STORAGE_KEYS.token が定義されている", /token: "scarbon:token:v1"/.test(src));
check("getToken / setToken / clearToken が定義されている", /function getToken\(/.test(src) && /function setToken\(/.test(src) && /function clearToken\(/.test(src));
check("buildStateJSON にトークンが含まれない", /function buildStateJSON\(\)\s*\{[^}]*\}/.test(src) && !/token:.*getToken\(\)/.test(src));

// 旧 v1 localStorage の自動 purge
check("STORAGE_KEYS が v2 にバージョンアップ", /factors: "scarbon:factors:v2"/.test(src) && /activities: "scarbon:activities:v2"/.test(src));
check("LEGACY_STORAGE_KEYS に v1 が列挙されている", /scarbon:factors:v1/.test(src) && /scarbon:activities:v1/.test(src) && /scarbon:settings:v1/.test(src) && /scarbon:remote:v1/.test(src));
check("purgeLegacyStorage が起動時に実行される", /\(function purgeLegacyStorage\(\)/.test(src) && /LEGACY_STORAGE_KEYS\.forEach/.test(src));

// GitHub API 関連
check("githubGetContents 定義あり", /async function githubGetContents\(/.test(src));
check("githubPutContents 定義あり", /async function githubPutContents\(/.test(src));
check("競合検知の confirm がある", /リモートのデータが別の更新で進んでいます/.test(src));
check("履歴・復元の関数が定義されている", /function loadHistory\(/.test(src) && /function restoreFromCommit\(/.test(src));

// 理論検証: calcEmission のロジック
function calcEmission(activity, factor) {
  if (!factor) return 0;
  return Number(activity.amount || 0) * Number(factor.coefficient || 0);
}
check("calcEmission(100, 0.000434) === 0.0434", Math.abs(calcEmission({ amount: 100 }, { coefficient: 0.000434 }) - 0.0434) < 1e-9);
check("calcEmission(null factor) === 0", calcEmission({ amount: 100 }, null) === 0);
check("calcEmission(amount=undefined) === 0", calcEmission({}, { coefficient: 0.000434 }) === 0);

// CSV escape の同等実装で動作確認
function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
check('csvEscape("a,b") === "\\"a,b\\""', csvEscape("a,b") === '"a,b"');
check('csvEscape(\'a"b\') === \'"a""b"\'', csvEscape('a"b') === '"a""b"');
check("csvEscape(null) === ''", csvEscape(null) === "");

if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log("\nすべて PASS");
