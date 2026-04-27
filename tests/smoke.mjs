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
check("seed に LPG・灯油が入っている", /id: "f-lpg"/.test(src) && /id: "f-kerosene"/.test(src));
check("seed にガソリン・軽油が入っている", /id: "f-gasoline"/.test(src) && /id: "f-diesel"/.test(src));
check("seed に通勤(鉄道/路線バス/自家用乗用車)が入っている", /f-commute-rail/.test(src) && /f-commute-bus/.test(src) && /f-commute-car/.test(src));

// data/scarbon-state.json も同等の seed
check("JSON に factors が 9件以上ある", Array.isArray(stateJson.factors) && stateJson.factors.length >= 9);
check("JSON の activities が ActivityRecord 形式（factorId が factors を参照）",
  Array.isArray(stateJson.activities) &&
  stateJson.activities.every((a) =>
    typeof a.id === "string" && a.id.length > 0 &&
    typeof a.factorId === "string" && a.factorId.length > 0 &&
    typeof a.amount === "number" && Number.isFinite(a.amount) &&
    typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date)
  ) &&
  stateJson.activities.every((a) => stateJson.factors.some((f) => f.id === a.factorId))
);
check("JSON に通勤(自家用乗用車)係数 0.000130 が含まれる", stateJson.factors.some((f) => f.id === "f-commute-car" && f.coefficient === 0.000130));
check("JSON に LPG (kg) が含まれる", stateJson.factors.some((f) => f.id === "f-lpg" && f.unit === "kg"));
check("JSON に灯油 (L, 0.00249) が含まれる", stateJson.factors.some((f) => f.id === "f-kerosene" && f.unit === "L" && f.coefficient === 0.00249));

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

// 旧 v1 localStorage の自動 migration（消すのではなく v2 へコピー＋バックアップ）
check("STORAGE_KEYS が v2 にバージョンアップ", /factors: "scarbon:factors:v2"/.test(src) && /activities: "scarbon:activities:v2"/.test(src));
check("LEGACY_STORAGE_PAIRS に v1 → v2 が列挙されている", /legacy: "scarbon:factors:v1", current: "scarbon:factors:v2"/.test(src) && /legacy: "scarbon:activities:v1", current: "scarbon:activities:v2"/.test(src));
check("migrateLegacyStorage IIFE が起動時に実行される", /function migrateLegacyStorage\(\)/.test(src));
check("LEGACY_BACKUP_KEY にバックアップを退避する", /LEGACY_BACKUP_KEY = "scarbon:legacy-backup:v1"/.test(src) && /localStorage\.setItem\(LEGACY_BACKUP_KEY/.test(src));
check("v2 既存値を上書きしない（衝突は backup に退避）", /currentValue === null/.test(src));
check("getLegacyBackup でバックアップを参照できる", /function getLegacyBackup\(/.test(src));
check("renderLegacyBackupSection で UI 提供", /function renderLegacyBackupSection\(/.test(src));
check("data-export-legacy / data-delete-legacy ハンドラあり", /data-export-legacy/.test(src) && /data-delete-legacy/.test(src));
check("移行成功時にユーザーに通知する", /旧バージョン \(v1\) のデータ/.test(src));
check("バックアップ書き込みを verify する", /localStorage\.getItem\(LEGACY_BACKUP_KEY\) !== payload/.test(src));
check("バックアップ失敗時は v1 を残し backupFailed フラグを立てる", /backupFailed: true/.test(src));
check("v2 への copy 成功を verify してから v1 を削除する", /localStorage\.getItem\(current\) === value/.test(src) && /canRemoveLegacy/.test(src));
check("バックアップ失敗時にユーザーへエラー通知", /バックアップ保存に失敗したため、移行を中断しました/.test(src));
check("backupFailed のとき bootstrapData が seed を v2 に書き込まない", /async function bootstrapData\(\)[\s\S]{0,200}legacyMigrationResult\.backupFailed[\s\S]{0,40}return/.test(src));
check("backupFailed のとき persist が抑止される", /function persist\(\)\s*\{[\s\S]{0,100}legacyMigrationResult\.backupFailed[\s\S]{0,40}return/.test(src));
check("backupFailed のとき persistSettings が抑止される", /function persistSettings\(\)\s*\{[\s\S]{0,100}legacyMigrationResult\.backupFailed[\s\S]{0,40}return/.test(src));
check("backupFailed のとき loadInitialCollection が v1 を読みに行く", /function loadInitialCollection\([\s\S]{0,300}legacyMigrationResult\.backupFailed[\s\S]{0,200}localStorage\.getItem\(legacyKey\)/.test(src));
check("読み取り専用モードを toast で告知", /読み取り専用モード/.test(src));
check("ensureWritable ガード関数が定義されている", /function ensureWritable\(\)/.test(src));
check("saveActivityFromForm の冒頭で ensureWritable", /function saveActivityFromForm\(\)\s*\{\s*if \(!ensureWritable\(\)\)/.test(src));
check("saveFactorFromForm の冒頭で ensureWritable", /function saveFactorFromForm\(\)\s*\{\s*if \(!ensureWritable\(\)\)/.test(src));
check("pullFromGithub に ensureWritable ガード", /async function pullFromGithub\(\)[\s\S]{0,120}ensureWritable\(\)/.test(src));
check("pushToGithub に ensureWritable ガード", /async function pushToGithub\([^)]*\)[\s\S]{0,120}ensureWritable\(\)/.test(src));
check("restoreFromCommit に ensureWritable ガード", /async function restoreFromCommit\([^)]*\)[\s\S]{0,120}ensureWritable\(\)/.test(src));
check("delete-activity ハンドラに ensureWritable", /target\.dataset\.deleteActivity[\s\S]{0,80}ensureWritable\(\)/.test(src));
check("delete-factor ハンドラに ensureWritable", /target\.dataset\.deleteFactor[\s\S]{0,300}ensureWritable\(\)/.test(src));
check("seed-reset ハンドラに ensureWritable", /target\.dataset\.seedReset[\s\S]{0,80}ensureWritable\(\)/.test(src));
check("filteredActivities ヘルパーが定義されている", /function filteredActivities\(\)/.test(src));
check("getScopeTotals が filteredActivities を使う", /function getScopeTotals\(\)[\s\S]{0,200}filteredActivities\(\)/.test(src));
check("monthlyTotalsForChart が filteredActivities を使う", /function monthlyTotalsForChart\([\s\S]{0,200}filteredActivities\(\)/.test(src));
check("renderCategoryBreakdown が filteredActivities を使う", /function renderCategoryBreakdown\(\)[\s\S]{0,200}filteredActivities\(\)/.test(src));
check("renderSiteBreakdown が filteredActivities を使う", /function renderSiteBreakdown\(\)[\s\S]{0,200}filteredActivities\(\)/.test(src));
check("normalizeSettings が定義されている", /function normalizeSettings\(/.test(src));
check("defaultSettings.period の初期値が「全期間」", /period: "全期間"/.test(src));
check("data-clear-activities ハンドラが定義されている", /target\.dataset\.clearActivities/.test(src));
check("data-seed-reset がシードに戻すボタン (setItem 上書き + verify ベース)", /target\.dataset\.seedReset[\s\S]{0,2000}localStorage\.setItem\(STORAGE_KEYS\.factors,\s*factorsJson\)/.test(src));
check("bootstrapData は factors.length===0 で fetch する", /function bootstrapData\(\)[\s\S]{0,400}factors\.length > 0/.test(src));

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
