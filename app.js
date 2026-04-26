"use strict";

const STORAGE_KEYS = {
  factors: "scarbon:factors:v2",
  activities: "scarbon:activities:v2",
  settings: "scarbon:settings:v2",
  token: "scarbon:token:v1",
  remote: "scarbon:remote:v2"
};

const LEGACY_STORAGE_PAIRS = [
  { legacy: "scarbon:factors:v1", current: "scarbon:factors:v2" },
  { legacy: "scarbon:activities:v1", current: "scarbon:activities:v2" },
  { legacy: "scarbon:settings:v1", current: "scarbon:settings:v2" },
  { legacy: "scarbon:remote:v1", current: "scarbon:remote:v2" }
];

const LEGACY_BACKUP_KEY = "scarbon:legacy-backup:v1";
const GITHUB_API = "https://api.github.com";

const legacyMigrationResult = (function migrateLegacyStorage() {
  if (typeof localStorage === "undefined") return { migrated: false, conflicted: [], backupFailed: false };
  const snapshot = {};
  let foundLegacy = false;
  LEGACY_STORAGE_PAIRS.forEach(({ legacy }) => {
    try {
      const value = localStorage.getItem(legacy);
      if (value !== null) {
        snapshot[legacy] = value;
        foundLegacy = true;
      }
    } catch (error) {}
  });
  if (!foundLegacy) return { migrated: false, conflicted: [], backupFailed: false };

  // 1. バックアップを取り、 確実に永続化されたか verify する。
  //    ここで失敗したら v1 は一切触らずに abort（ユーザーデータを失わない）
  const payload = JSON.stringify({
    backupAt: new Date().toISOString(),
    data: snapshot
  });
  try {
    localStorage.setItem(LEGACY_BACKUP_KEY, payload);
    if (localStorage.getItem(LEGACY_BACKUP_KEY) !== payload) {
      return { migrated: false, conflicted: [], backupFailed: true };
    }
  } catch (error) {
    return { migrated: false, conflicted: [], backupFailed: true };
  }

  // 2. バックアップが取れた場合のみ v1 → v2 にコピーし、 コピー成功を verify してから v1 削除
  let migratedCount = 0;
  const conflicted = [];
  LEGACY_STORAGE_PAIRS.forEach(({ legacy, current }) => {
    const value = snapshot[legacy];
    if (value === undefined || value === null) return;
    let canRemoveLegacy = false;
    try {
      const currentValue = localStorage.getItem(current);
      if (currentValue === null) {
        localStorage.setItem(current, value);
        if (localStorage.getItem(current) === value) {
          migratedCount += 1;
          canRemoveLegacy = true;
        }
        // setItem 失敗（quota など）の場合 canRemoveLegacy=false で v1 を残す
      } else {
        // 衝突: v2 が既に存在 → v2 を尊重。 v1 はバックアップに残っているので削除して良い
        conflicted.push(legacy);
        canRemoveLegacy = true;
      }
    } catch (error) {
      canRemoveLegacy = false;
    }
    if (canRemoveLegacy) {
      try { localStorage.removeItem(legacy); } catch (error) {}
    }
  });
  return { migrated: migratedCount > 0, migratedCount, conflicted, backupFailed: false };
})();

const screens = [
  { id: "dashboard", label: "ダッシュボード", mobile: "ホーム", icon: "home" },
  { id: "data-input", label: "データ入力", mobile: "入力", icon: "edit" },
  { id: "data-list", label: "データ一覧", mobile: "データ", icon: "database" },
  { id: "factors", label: "原単位管理", mobile: "原単位", icon: "layers" },
  { id: "analytics", label: "排出量分析", mobile: "分析", icon: "chart" },
  { id: "reports", label: "レポート", mobile: "帳票", icon: "file" },
  { id: "goals", label: "目標・進捗管理", mobile: "目標", icon: "target" },
  { id: "actions", label: "削減施策管理", mobile: "施策", icon: "leaf" },
  { id: "alerts", label: "アラート管理", mobile: "通知", icon: "bell" },
  { id: "settings", label: "設定", mobile: "設定", icon: "gear" }
];

const mobileScreens = ["dashboard", "data-list", "data-input", "analytics", "settings"];

const seedFactors = [
  { id: "f-electricity", scope: "Scope 2", name: "電力（日本・全国平均）", category: "電力", unit: "kWh", coefficient: 0.000434, source: "環境省 算定・報告・公表制度 R03年度実績代替値", region: "日本", year: "2023", status: "公式" },
  { id: "f-citygas", scope: "Scope 1", name: "都市ガス（13A）", category: "燃料", unit: "m3", coefficient: 0.00221, source: "環境省 算定・報告・公表制度", region: "日本", year: "2023", status: "公式" },
  { id: "f-lpg", scope: "Scope 1", name: "LPG（プロパン）", category: "燃料", unit: "kg", coefficient: 0.003, source: "環境省 算定・報告・公表制度", region: "日本", year: "2023", status: "公式" },
  { id: "f-kerosene", scope: "Scope 1", name: "灯油", category: "燃料", unit: "L", coefficient: 0.00249, source: "環境省 算定・報告・公表制度", region: "日本", year: "2023", status: "公式" },
  { id: "f-gasoline", scope: "Scope 1", name: "ガソリン", category: "燃料", unit: "L", coefficient: 0.00232, source: "環境省 算定・報告・公表制度", region: "日本", year: "2023", status: "公式" },
  { id: "f-diesel", scope: "Scope 1", name: "軽油", category: "燃料", unit: "L", coefficient: 0.00258, source: "環境省 算定・報告・公表制度", region: "日本", year: "2023", status: "公式" },
  { id: "f-commute-rail", scope: "Scope 3", name: "通勤（鉄道）", category: "通勤", unit: "人km", coefficient: 0.0000196, source: "国交省 旅客輸送統計（CO2排出原単位）", region: "日本", year: "2022", status: "公式" },
  { id: "f-commute-bus", scope: "Scope 3", name: "通勤（路線バス）", category: "通勤", unit: "人km", coefficient: 0.0000571, source: "国交省 旅客輸送統計（CO2排出原単位）", region: "日本", year: "2022", status: "公式" },
  { id: "f-commute-car", scope: "Scope 3", name: "通勤（自家用乗用車）", category: "通勤", unit: "人km", coefficient: 0.000130, source: "国交省 旅客輸送統計（CO2排出原単位）", region: "日本", year: "2022", status: "公式" }
];

const seedActivities = [];

const scopeMeta = {
  "Scope 1": { color: "primary", icon: "factory", label: "直接排出" },
  "Scope 2": { color: "green", icon: "bolt", label: "間接排出（エネルギー起源）" },
  "Scope 3": { color: "purple", icon: "truck", label: "その他の間接排出" }
};

const defaultSettings = {
  theme: "light",
  site: "すべてのサイト",
  period: "全期間",
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",
  dataPath: "data/scarbon-state.json"
};

const defaultRemote = {
  sha: "",
  syncedAt: ""
};

const state = {
  route: readRoute(),
  scope: "Scope 1",
  factorFilter: "すべて",
  selectedFactorId: "",
  toast: "",
  toastType: "info",
  settings: normalizeSettings(mergeDefaults(defaultSettings, loadJSON(STORAGE_KEYS.settings, defaultSettings))),
  remote: mergeDefaults(defaultRemote, loadJSON(STORAGE_KEYS.remote, defaultRemote)),
  history: [],
  historyOpen: false,
  busy: false,
  draft: {
    factorId: "",
    amount: "",
    site: "",
    supplier: "",
    date: "",
    memo: ""
  }
};

let factors = loadInitialCollection(STORAGE_KEYS.factors, "scarbon:factors:v1", seedFactors);
let activities = loadInitialCollection(STORAGE_KEYS.activities, "scarbon:activities:v1", seedActivities);

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  render();
  bootstrapData();
  if (legacyMigrationResult.backupFailed) {
    showToast("旧 v1 データのバックアップ保存に失敗したため、移行を中断しました。読み取り専用モードで起動しています（編集内容はリロードで失われます）。ブラウザのストレージ容量を空けて再読込してください。", "error");
  } else if (legacyMigrationResult.migrated) {
    showToast(`旧バージョン (v1) のデータ ${legacyMigrationResult.migratedCount} 件を移行しました。バックアップは設定画面から JSON 取得できます。`, "info");
  } else if (legacyMigrationResult.conflicted && legacyMigrationResult.conflicted.length) {
    showToast(`旧 v1 データは新 v2 と衝突したためバックアップにのみ退避しました。設定画面から確認できます。`, "info");
  }
});

window.addEventListener("hashchange", () => {
  state.route = readRoute();
  render();
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-route],[data-scope],[data-factor-filter],[data-factor-id],[data-fill-factor],[data-save-entry],[data-add-factor],[data-theme],[data-export],[data-export-report],[data-seed-reset],[data-clear-activities],[data-remote-action],[data-restore-sha],[data-close-history],[data-token-save],[data-token-clear],[data-delete-activity],[data-delete-factor],[data-export-legacy],[data-delete-legacy]");
  if (!target) return;

  if (target.dataset.route) {
    navigate(target.dataset.route);
    return;
  }

  if (target.dataset.scope) {
    state.scope = target.dataset.scope;
    const first = factors.find((factor) => factor.scope === state.scope);
    if (first) state.draft.factorId = first.id;
    render();
    return;
  }

  if (target.dataset.factorFilter) {
    state.factorFilter = target.dataset.factorFilter;
    render();
    return;
  }

  if (target.dataset.factorId) {
    state.selectedFactorId = target.dataset.factorId;
    render();
    return;
  }

  if (target.dataset.fillFactor) {
    state.draft.factorId = target.dataset.fillFactor;
    const factor = getFactor(state.draft.factorId);
    if (factor) state.scope = factor.scope;
    navigate("data-input");
    return;
  }

  if (target.dataset.saveEntry !== undefined) {
    saveActivityFromForm();
    return;
  }

  if (target.dataset.addFactor !== undefined) {
    saveFactorFromForm();
    return;
  }

  if (target.dataset.theme) {
    state.settings.theme = target.dataset.theme;
    persistSettings();
    applyTheme();
    render();
    return;
  }

  if (target.dataset.export !== undefined) {
    exportState();
    return;
  }

  if (target.dataset.exportReport) {
    exportReport(target.dataset.exportReport);
    return;
  }

  if (target.dataset.clearActivities !== undefined) {
    if (!ensureWritable()) return;
    if (!window.confirm("活動データをすべて削除します（原単位は残ります）。よろしいですか？")) return;
    activities = [];
    state.draft = { factorId: state.draft.factorId, amount: "", site: "", supplier: "", date: "", memo: "" };
    persist();
    showToast("活動データを削除しました", "success");
    render();
    return;
  }

  if (target.dataset.seedReset !== undefined) {
    if (!ensureWritable()) return;
    if (!window.confirm("ローカルの factors / activities を削除し、シードデータから再起動します。よろしいですか？")) return;
    try {
      localStorage.removeItem(STORAGE_KEYS.factors);
      localStorage.removeItem(STORAGE_KEYS.activities);
    } catch (error) {}
    factors = [];
    activities = [];
    state.selectedFactorId = "";
    state.draft = { factorId: "", amount: "", site: "", supplier: "", date: "", memo: "" };
    bootstrapData().then((result) => {
      if (result.ok && result.factorCount > 0) {
        showToast(`シードデータから再起動しました（原単位 ${result.factorCount} 件）`, "success");
      } else if (result.reason === "fetch-error") {
        showToast(`シードデータの読み込みに失敗しました：${result.error || "不明なエラー"}`, "error");
      } else if (result.reason === "empty-seed") {
        showToast("シードデータが空です。data/scarbon-state.json を確認してください。", "error");
      } else if (result.reason === "backup-failed") {
        showToast("読み取り専用モードのためリセットできません。", "error");
      } else {
        showToast("シードデータをリセットできませんでした。", "error");
      }
      render();
    });
    return;
  }

  if (target.dataset.remoteAction) {
    const action = target.dataset.remoteAction;
    if (action === "pull") pullFromGithub();
    else if (action === "push") pushToGithub();
    else if (action === "history") loadHistory();
    return;
  }

  if (target.dataset.restoreSha) {
    restoreFromCommit(target.dataset.restoreSha);
    return;
  }

  if (target.dataset.closeHistory !== undefined) {
    closeHistory();
    return;
  }

  if (target.dataset.tokenSave !== undefined) {
    const value = valueOf("#github-token").trim();
    setToken(value);
    showToast(value ? "トークンを保存しました" : "トークンを削除しました", "success");
    render();
    return;
  }

  if (target.dataset.tokenClear !== undefined) {
    if (!window.confirm("保存済みのトークンを削除します。よろしいですか？")) return;
    clearToken();
    showToast("トークンを削除しました", "success");
    render();
    return;
  }

  if (target.dataset.deleteActivity) {
    if (!ensureWritable()) return;
    if (!window.confirm("この活動データを削除します。よろしいですか？")) return;
    activities = activities.filter((activity) => activity.id !== target.dataset.deleteActivity);
    persist();
    showToast("活動データを削除しました", "success");
    render();
    return;
  }

  if (target.dataset.exportLegacy !== undefined) {
    const backup = getLegacyBackup();
    if (!backup) {
      showToast("バックアップはありません", "error");
      return;
    }
    downloadFile("scarbon-legacy-v1-backup.json", JSON.stringify(backup, null, 2), "application/json");
    showToast("v1 バックアップを書き出しました", "success");
    return;
  }

  if (target.dataset.deleteLegacy !== undefined) {
    if (legacyMigrationResult.backupFailed) {
      showToast("読み取り専用モード中はバックアップ操作を実行できません。再読込後にお試しください。", "error");
      return;
    }
    if (!window.confirm("v1 のバックアップを完全に削除します。よろしいですか？")) return;
    try { localStorage.removeItem(LEGACY_BACKUP_KEY); } catch (error) {}
    showToast("v1 バックアップを削除しました", "success");
    render();
    return;
  }

  if (target.dataset.deleteFactor) {
    const id = target.dataset.deleteFactor;
    const used = activities.some((activity) => activity.factorId === id);
    if (used) {
      showToast("この原単位は活動データで使用中のため削除できません", "error");
      return;
    }
    if (!ensureWritable()) return;
    if (!window.confirm("この原単位を削除します。よろしいですか？")) return;
    factors = factors.filter((factor) => factor.id !== id);
    if (state.selectedFactorId === id) state.selectedFactorId = factors[0]?.id || "";
    persist();
    showToast("原単位を削除しました", "success");
    render();
    return;
  }
});

document.addEventListener("input", (event) => {
  const field = event.target.closest("[data-draft],[data-setting]");
  if (!field) return;
  if (field.dataset.draft) {
    state.draft[field.dataset.draft] = field.value;
    updateCalcPreview();
  }
  if (field.dataset.setting) {
    state.settings[field.dataset.setting] = field.value;
    persistSettings();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  const target = event.target;
  if (!target || !target.tagName) return;
  if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON" || target.tagName === "A") return;
  if (target.dataset && target.dataset.draft) {
    event.preventDefault();
    saveActivityFromForm();
    return;
  }
  if (target.id && target.id.startsWith("factor-")) {
    event.preventDefault();
    saveFactorFromForm();
    return;
  }
  if (target.id === "github-token") {
    event.preventDefault();
    const value = target.value.trim();
    setToken(value);
    showToast(value ? "トークンを保存しました" : "トークンを削除しました", "success");
    render();
  }
});

document.addEventListener("change", (event) => {
  const field = event.target.closest("[data-draft],[data-setting]");
  if (!field) return;
  if (field.dataset.draft) {
    state.draft[field.dataset.draft] = field.value;
    const factor = getFactor(state.draft.factorId);
    if (factor) state.scope = factor.scope;
    render();
  }
  if (field.dataset.setting) {
    state.settings[field.dataset.setting] = field.value;
    persistSettings();
    render();
  }
});

async function bootstrapData() {
  // 戻り値: { ok: boolean, reason?: string, factorCount: number } — 呼び出し元（特に seed-reset）が成否を判定できるようにする。
  if (legacyMigrationResult.backupFailed) {
    return { ok: false, reason: "backup-failed", factorCount: factors.length };
  }
  // 「factors が 0 件」なら（過去のリセット操作で空配列が永続化されているケースも含めて） seed を取り直す。
  // activities はユーザーが意図的に空にした可能性が高いため、現状を尊重。
  if (factors.length > 0) {
    return { ok: true, reason: "already-loaded", factorCount: factors.length };
  }
  try {
    const response = await fetch(state.settings.dataPath, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data.factors) && data.factors.length) factors = data.factors;
    if (activities.length === 0 && Array.isArray(data.activities) && data.activities.length) {
      activities = data.activities;
    }
    persist();
    render();
    if (factors.length === 0) {
      return { ok: false, reason: "empty-seed", factorCount: 0 };
    }
    return { ok: true, reason: "fetched", factorCount: factors.length };
  } catch (error) {
    return { ok: false, reason: "fetch-error", factorCount: 0, error: error?.message || String(error) };
  }
}

function render() {
  const app = document.querySelector("#app");
  const route = validRoute(state.route);
  const screen = screens.find((item) => item.id === route);
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar(route)}
      <main class="workspace">
        ${renderTopbar(screen)}
        ${renderMobileHeader(screen)}
        <section class="content">${renderScreen(route)}</section>
        ${renderMobileTabbar(route)}
      </main>
    </div>
    ${state.busy ? `<div class="busy-overlay" role="status" aria-live="polite"><div class="busy-spinner"></div><span>処理中...</span></div>` : ""}
    ${state.toast ? `<div class="toast toast-${escapeAttr(state.toastType || "info")}" role="status" aria-live="polite">${escapeHTML(state.toast)}</div>` : ""}
  `;
}

function renderSidebar(route) {
  return `
    <aside class="sidebar" aria-label="メインナビゲーション">
      <a class="brand" href="#dashboard" aria-label="S&amp;Carbon home"><span class="logo-mark"></span><span>S&amp;Carbon</span></a>
      <nav class="nav">
        ${screens.map((screen) => `
          <button class="nav-button ${route === screen.id ? "is-active" : ""}" data-route="${escapeAttr(screen.id)}">
            ${icon(screen.icon)}<span>${escapeHTML(screen.label)}</span>
          </button>
        `).join("")}
      </nav>
      <div class="side-note">
        <strong>S&amp;Carbonで脱炭素経営を加速</strong>
        <span>原単位を手動登録し、Scope 1・2・3 の活動量から排出量を算定します。</span>
      </div>
    </aside>
  `;
}

function renderTopbar(screen) {
  const sites = ["すべてのサイト", ...siteSuggestions()];
  if (!sites.includes(state.settings.site)) sites.push(state.settings.site);
  const periods = ["全期間", ...periodSuggestions()];
  if (!periods.includes(state.settings.period)) periods.push(state.settings.period);
  return `
    <header class="topbar">
      <h1>${escapeHTML(screen.label)}</h1>
      <div class="top-controls">
        <div class="control">
          <label for="site-select">サイト・拠点</label>
          <select id="site-select" data-setting="site">
            ${optionList(sites, state.settings.site)}
          </select>
        </div>
        <div class="control">
          <label for="period-select">集計期間</label>
          <select id="period-select" data-setting="period">
            ${optionList(periods, state.settings.period)}
          </select>
        </div>
        <div class="avatar" aria-label="アカウント">T</div>
      </div>
    </header>
  `;
}

function siteSuggestions() {
  return Array.from(new Set(activities.map((activity) => activity.site).filter(Boolean))).sort();
}

function periodSuggestions() {
  return Array.from(new Set(activities.map((activity) => (activity.date || "").slice(0, 7)).filter(Boolean))).sort().reverse();
}

function renderMobileHeader(screen) {
  return `
    <header class="mobile-header">
      <a class="brand" href="#dashboard"><span class="logo-mark"></span><span>S&amp;Carbon</span></a>
      <div style="display:flex; gap:8px;">
        <div class="avatar" aria-label="アカウント">T</div>
      </div>
    </header>
    <div class="mobile-title">
      <h1>${escapeHTML(screen.id === "dashboard" ? "ホーム" : screen.label)}</h1>
      <p>${escapeHTML(mobileLead(screen.id))}</p>
    </div>
  `;
}

function renderMobileTabbar(route) {
  return `
    <nav class="mobile-tabbar" aria-label="モバイルナビゲーション">
      ${mobileScreens.map((id) => {
        const screen = screens.find((item) => item.id === id);
        const active = id === route || (route === "factors" && id === "data-list");
        return `
          <button class="mobile-tab ${active ? "is-active" : ""}" data-route="${escapeAttr(id)}">
            ${icon(screen.icon)}<span>${escapeHTML(screen.mobile)}</span>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

function renderScreen(route) {
  const renderers = {
    dashboard: renderDashboard,
    "data-input": renderDataInput,
    "data-list": renderDataList,
    factors: renderFactors,
    analytics: renderAnalytics,
    reports: renderReports,
    goals: renderGoals,
    actions: renderActions,
    alerts: renderAlerts,
    settings: renderSettings
  };
  return (renderers[route] || renderDashboard)();
}

function renderDashboard() {
  if (activities.length === 0) return renderOnboarding();
  const totals = getScopeTotals();
  const total = totals.total;
  const recent = filteredActivities().slice(-4).reverse();
  const monthly = monthlyTotalsForChart(6);
  return `
    <div class="grid kpi">
      ${renderHeroMetric(total)}
      ${renderScopeMetric("Scope 1", totals["Scope 1"])}
      ${renderScopeMetric("Scope 2", totals["Scope 2"])}
      ${renderScopeMetric("Scope 3", totals["Scope 3"])}
    </div>
    <div class="mobile-scope-strip" aria-label="Scope別内訳">
      ${["Scope 1", "Scope 2", "Scope 3"].map((scope) => `
        <div>
          <strong>${escapeHTML(scope)}</strong>
          <div>${formatNumber(totals[scope])}</div>
          <small class="muted">${percent(totals[scope], total)}%</small>
        </div>
      `).join("")}
    </div>
    <div style="height:16px"></div>
    <div class="grid dashboard-mid">
      <article class="card card-pad">
        <div class="section-title"><h2>排出量の月次推移（直近6ヶ月）</h2></div>
        ${renderActualLineChart(monthly)}
      </article>
      <article class="card card-pad">
        <div class="section-title"><h2>カテゴリ別構成比</h2><button class="ghost-button" data-route="analytics">詳細を見る</button></div>
        ${renderCategoryBreakdown()}
      </article>
      <article class="card card-pad">
        <div class="section-title"><h2>最近のアクティビティ</h2><button class="ghost-button" data-route="data-list">すべて見る</button></div>
        <div class="activity-list">
          ${recent.length ? recent.map((activity) => {
            const factor = getFactor(activity.factorId);
            return `<div class="activity-row"><span><strong>${escapeHTML(factor?.name || "未設定データ")}</strong><small>${escapeHTML(activity.site || "拠点未設定")} / ${escapeHTML(activity.date)}</small></span><span class="badge green">${formatNumber(calcEmission(activity, factor))}</span></div>`;
          }).join("") : `<p class="muted">フィルタ条件に一致する活動データはありません。</p>`}
        </div>
      </article>
    </div>
    <div style="height:16px"></div>
    <article class="card card-pad">
      <div class="section-title"><h2>クイックアクション</h2></div>
      <div class="quick-actions">
        <button class="secondary-button quick-action" data-route="data-input">${icon("edit")} データ入力</button>
        <button class="secondary-button quick-action" data-route="factors">${icon("layers")} 原単位登録</button>
        <button class="secondary-button quick-action" data-route="reports">${icon("file")} レポート出力</button>
      </div>
    </article>
  `;
}

function renderOnboarding() {
  return `
    <article class="card card-pad onboarding">
      <h2>S&Carbon へようこそ</h2>
      <p>Scope 1・2・3 の活動量データと原単位から CO2 排出量を算定するライトな個人ツールです。最初の3ステップで使い始められます。</p>
      <ol class="onboarding-steps">
        <li>
          <strong>1. 原単位を確認・追加</strong>
          <p class="muted">電気・ガス・燃料・通勤などの初期原単位を ${factors.length} 件登録済みです。必要に応じて追加・編集できます。</p>
          <button class="secondary-button" data-route="factors">${icon("layers")} 原単位を開く</button>
        </li>
        <li>
          <strong>2. 活動データを入力</strong>
          <p class="muted">原単位を選び、kWh / m³ / L / 人km などの活動量を入力すると、排出量が自動計算されます。</p>
          <button class="primary-button" data-route="data-input">${icon("edit")} データを入力</button>
        </li>
        <li>
          <strong>3. GitHub に保存（任意）</strong>
          <p class="muted">設定画面で GitHub owner / repo / トークンを入力すると、リポジトリ内 JSON にバックアップできます。</p>
          <button class="secondary-button" data-route="settings">${icon("gear")} 設定を開く</button>
        </li>
      </ol>
    </article>
  `;
}

function monthlyTotalsForChart(months) {
  const buckets = new Map();
  filteredActivities().forEach((activity) => {
    const factor = getFactor(activity.factorId);
    if (!factor) return;
    const month = (activity.date || "").slice(0, 7);
    if (!month) return;
    buckets.set(month, (buckets.get(month) || 0) + calcEmission(activity, factor));
  });
  const sorted = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.slice(-months);
}

function renderActualLineChart(points) {
  if (!points.length) {
    return `<div class="empty-state"><p class="muted">日付付きの活動データを入力すると、月次推移が表示されます。</p></div>`;
  }
  const max = Math.max(...points.map(([, value]) => value), 1);
  const width = 680;
  const height = 200;
  const padX = 36;
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const path = points.map(([, value], index) => {
    const x = padX + stepX * index;
    const y = height - 20 - (value / max) * (height - 60);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return `
    <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="月次排出量推移">
      <line class="grid-line" x1="${padX}" y1="${height - 20}" x2="${width - padX}" y2="${height - 20}"></line>
      <path class="series-a" d="${path}"></path>
      ${points.map(([month, value], index) => {
        const x = padX + stepX * index;
        const y = height - 20 - (value / max) * (height - 60);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--primary)"></circle><text x="${x.toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="11">${escapeHTML(month)}</text>`;
      }).join("")}
    </svg>
  `;
}

function renderCategoryBreakdown() {
  const buckets = new Map();
  filteredActivities().forEach((activity) => {
    const factor = getFactor(activity.factorId);
    if (!factor) return;
    const key = factor.category || "未分類";
    buckets.set(key, (buckets.get(key) || 0) + calcEmission(activity, factor));
  });
  if (!buckets.size) return `<div class="empty-state"><p class="muted">カテゴリ別の集計はまだありません。</p></div>`;
  const total = Array.from(buckets.values()).reduce((sum, value) => sum + value, 0);
  const rows = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
  return `
    <div class="bar-list">
      ${rows.map(([category, value]) => `
        <div class="bar-row">
          <strong>${escapeHTML(category)}</strong>
          <div class="bar" style="width:${Math.max(8, value / total * 100).toFixed(1)}%"></div>
          <span>${formatNumber(value)} t-CO2e</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderHeroMetric(total, nested = false) {
  const tag = nested ? "div" : "article";
  const className = nested ? "metric-card hero-card" : "card metric-card hero-card";
  return `
    <${tag} class="${className}">
      <div>
        <div class="metric-label">総排出量（CO2e）</div>
        <div class="metric-value">${formatNumber(total)}<small>t-CO2e</small></div>
      </div>
      <div class="metric-foot">
        <span>登録活動データ：${activities.length}件</span>
        <span>登録原単位：${factors.length}件</span>
        <span>集計期間：${escapeHTML(state.settings.period)}</span>
      </div>
    </${tag}>
  `;
}

function renderScopeMetric(scope, value) {
  const meta = scopeMeta[scope];
  const total = getScopeTotals().total;
  return `
    <article class="card metric-card">
      <div>
        <div class="legend-row">
          <div>
            <div class="metric-label">${escapeHTML(scope)}</div>
            <p style="margin:4px 0 0">${escapeHTML(meta.label)}</p>
          </div>
          <span class="scope-icon ${meta.color === "green" ? "green" : meta.color === "purple" ? "purple" : ""}">${icon(meta.icon)}</span>
        </div>
        <div class="metric-value">${formatNumber(value)}<small>t-CO2e</small></div>
      </div>
      <div class="metric-foot">
        <span>構成比 ${percent(value, total)}%</span>
      </div>
    </article>
  `;
}

function renderDataInput() {
  const scopeFactors = factors.filter((factor) => factor.scope === state.scope);
  const selected = getFactor(state.draft.factorId) || scopeFactors[0] || factors[0];
  if (selected && selected.scope !== state.scope) state.scope = selected.scope;
  const noFactors = factors.length === 0;
  const noScopeFactors = scopeFactors.length === 0;
  return `
    <div class="form-layout">
      <section class="card card-pad">
        <div class="section-title">
          <div>
            <h2>活動量を入力</h2>
            <p>活動データと手動登録した原単位から排出量を算定します。</p>
          </div>
          <button class="secondary-button" data-route="data-list">${icon("database")} 一覧へ</button>
        </div>
        <div class="tabs" style="margin-bottom:16px">
          ${["Scope 1", "Scope 2", "Scope 3"].map((scope) => `
            <button class="tab-button ${state.scope === scope ? "is-active" : ""}" data-scope="${escapeAttr(scope)}">
              ${icon(scopeMeta[scope].icon)} ${escapeHTML(scope)}
            </button>
          `).join("")}
        </div>
        ${noFactors ? `
          <div class="empty-state">
            ${icon("layers")}
            <h3>原単位がまだありません</h3>
            <p class="muted">「原単位管理」から計算に使う原単位を登録してください。</p>
            <button class="primary-button" data-route="factors">${icon("plus")} 原単位を登録</button>
          </div>
        ` : noScopeFactors ? `
          <div class="empty-state">
            ${icon("alert")}
            <h3>${escapeHTML(state.scope)} の原単位がありません</h3>
            <p class="muted">他のScopeを選ぶか、このScope向けの原単位を登録してください。</p>
            <button class="primary-button" data-route="factors">${icon("plus")} 原単位を登録</button>
          </div>
        ` : `
        <div class="form-grid">
          <label class="field">
            <span>排出源・カテゴリ</span>
            <select data-draft="factorId">${scopeFactors.map((factor) => `<option value="${escapeAttr(factor.id)}" ${factor.id === state.draft.factorId ? "selected" : ""}>${escapeHTML(factor.name)}</option>`).join("")}</select>
          </label>
          <label class="field">
            <span>活動量</span>
            <input data-draft="amount" type="number" min="0" step="0.01" value="${escapeAttr(state.draft.amount)}" placeholder="例：1250">
          </label>
          <label class="field">
            <span>単位</span>
            <input value="${escapeAttr(selected?.unit || "")}" readonly>
          </label>
          <label class="field">
            <span>原単位</span>
            <input value="${escapeAttr(selected?.coefficient ?? "")}" readonly>
          </label>
          <label class="field">
            <span>拠点</span>
            <input data-draft="site" list="site-suggestions" value="${escapeAttr(state.draft.site)}" placeholder="例：本社・通勤・自宅">
            <datalist id="site-suggestions">${siteSuggestions().map((site) => `<option value="${escapeAttr(site)}"></option>`).join("")}</datalist>
          </label>
          <label class="field">
            <span>サプライヤー・設備</span>
            <input data-draft="supplier" value="${escapeAttr(state.draft.supplier)}" placeholder="例：東京ガス株式会社">
          </label>
          <label class="field">
            <span>日付</span>
            <input data-draft="date" type="date" value="${escapeAttr(state.draft.date)}">
          </label>
          <label class="field">
            <span>証憑メモ</span>
            <input data-draft="memo" value="${escapeAttr(state.draft.memo)}" placeholder="例：請求書 202604.pdf">
          </label>
        </div>
        <div style="height:16px"></div>
        <div class="calc-total">
          <div class="card-pad" style="border:1px solid var(--line); border-radius:var(--radius);">
            <p>CO2e 排出量（推定）</p>
            <div id="calc-preview" class="calc-number">${formatNumber(calcDraft())}<small>t-CO2e</small></div>
          </div>
          <div class="card-pad" style="border:1px solid var(--line); border-radius:var(--radius);">
            <p>算定式</p>
            <strong id="calc-formula">${formatFormula(selected)}</strong>
          </div>
        </div>
        <div class="form-actions" style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px">
          <button class="secondary-button" data-route="factors">原単位を追加</button>
          <button class="primary-button" data-save-entry>保存</button>
        </div>
        `}
      </section>
      <aside class="card card-pad preview-panel">
        <div class="section-title"><h2>入力内容のプレビュー</h2><button class="icon-button" aria-label="更新">${icon("refresh")}</button></div>
        ${renderHeroMetric(getScopeTotals().total, true)}
        <div style="height:14px"></div>
        <h3>最近の入力から選択</h3>
        <div class="activity-list" style="margin-top:10px">
          ${activities.slice(-3).reverse().map((activity) => {
            const factor = getFactor(activity.factorId);
            return `
              <div class="activity-row">
                <span><strong>${escapeHTML(factor?.name || "未設定")}</strong><small>${escapeHTML(activity.site)} / ${formatNumber(activity.amount)} ${escapeHTML(factor?.unit || "")}</small></span>
                <button class="small-button" data-fill-factor="${escapeAttr(activity.factorId)}">使用</button>
              </div>
            `;
          }).join("")}
        </div>
      </aside>
    </div>
  `;
}

function renderDataList() {
  if (!activities.length) {
    return `
      <section class="card card-pad">
        <div class="section-title">
          <div><h2>活動データ一覧</h2><p>まだ活動データが登録されていません。</p></div>
          <div class="tabs">
            <button class="primary-button" data-route="data-input">${icon("plus")} データを入力する</button>
          </div>
        </div>
        <div class="empty-state">
          ${icon("database")}
          <h3>データがありません</h3>
          <p class="muted">「データ入力」から活動量を登録すると、ここに一覧が表示されます。</p>
        </div>
      </section>
    `;
  }
  return `
    <section class="card card-pad">
      <div class="section-title">
        <div>
          <h2>活動データ一覧</h2>
          <p>登録済みの活動量データを確認・削除できます。${state.remote.syncedAt ? "GitHub保存と同期されています。" : "GitHub保存は設定画面から実行できます。"}</p>
        </div>
        <div class="tabs">
          <button class="secondary-button" data-route="data-input">${icon("plus")} 追加</button>
          <button class="secondary-button" data-export>${icon("download")} JSON出力</button>
          <button class="secondary-button" data-export-report="scope">${icon("download")} CSV出力</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>日付</th><th>Scope</th><th>排出源</th><th>拠点</th><th>活動量</th><th>排出量</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${activities.slice().reverse().map((activity) => {
              const factor = getFactor(activity.factorId);
              const emission = calcEmission(activity, factor);
              return `
                <tr>
                  <td>${escapeHTML(activity.date)}</td>
                  <td><span class="badge ${badgeColor(factor?.scope)}">${escapeHTML(factor?.scope || "-")}</span></td>
                  <td><strong>${escapeHTML(factor?.name || "未設定（原単位削除済み）")}</strong><br><small class="muted">${escapeHTML(activity.memo || "")}</small></td>
                  <td>${escapeHTML(activity.site)}</td>
                  <td>${formatNumber(activity.amount)} ${escapeHTML(factor?.unit || "")}</td>
                  <td><strong>${formatNumber(emission)}</strong> t-CO2e</td>
                  <td><button class="small-button" data-delete-activity="${escapeAttr(activity.id)}" aria-label="削除">削除</button></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFactors() {
  const categories = ["すべて", ...Array.from(new Set(factors.map((factor) => factor.category)))];
  const filtered = state.factorFilter === "すべて" ? factors : factors.filter((factor) => factor.category === state.factorFilter);
  const selected = getFactor(state.selectedFactorId) || filtered[0] || factors[0];
  return `
    <div class="factor-layout">
      <section class="card card-pad">
        <div class="section-title">
          <div>
            <h2>原単位登録</h2>
            <p>必要な原単位を手動で登録・検索・管理します。</p>
          </div>
          <button class="secondary-button" data-route="data-input">${icon("edit")} 入力で使う</button>
        </div>
        <div class="filters">
          <div class="search-row">
            <input class="search-input" placeholder="原単位名・カテゴリで検索" aria-label="原単位検索">
            <button class="icon-button" aria-label="フィルター">${icon("filter")}</button>
          </div>
          <div class="chips">
            ${categories.map((category) => `<button class="chip ${state.factorFilter === category ? "is-active" : ""}" data-factor-filter="${escapeAttr(category)}">${escapeHTML(category)}</button>`).join("")}
          </div>
        </div>
        <div class="factor-list">
          ${filtered.map((factor) => `
            <button class="factor-item ${selected?.id === factor.id ? "is-selected" : ""}" data-factor-id="${escapeAttr(factor.id)}">
              <span class="scope-icon ${factor.scope === "Scope 2" ? "green" : factor.scope === "Scope 3" ? "purple" : ""}">${icon(scopeMeta[factor.scope]?.icon || "layers")}</span>
              <span>
                <strong>${escapeHTML(factor.name)}</strong>
                <small>${escapeHTML(factor.category)} / ${escapeHTML(factor.region)} / ${escapeHTML(factor.year)}年度</small>
              </span>
              <span class="factor-value">${escapeHTML(factor.coefficient)}<small>t-CO2e / ${escapeHTML(factor.unit)}</small></span>
            </button>
          `).join("")}
        </div>
      </section>
      <aside class="card card-pad preview-panel">
        <div class="section-title"><h2>原単位を登録</h2></div>
        ${renderFactorForm(selected)}
      </aside>
    </div>
  `;
}

function renderFactorForm(selected) {
  return `
    <div class="form-grid" style="grid-template-columns:1fr">
      <label class="field"><span>原単位名</span><input id="factor-name" placeholder="例：冷媒（R32）"></label>
      <label class="field"><span>対象Scope</span><select id="factor-scope">${optionList(["Scope 1", "Scope 2", "Scope 3"], selected?.scope || "Scope 1")}</select></label>
      <label class="field"><span>カテゴリ</span><input id="factor-category" placeholder="例：冷媒"></label>
      <label class="field"><span>単位</span><input id="factor-unit" placeholder="例：kg"></label>
      <label class="field"><span>係数（t-CO2e）</span><input id="factor-coefficient" type="number" step="0.000001" min="0" placeholder="例：0.000445"></label>
      <label class="field"><span>適用地域</span><input id="factor-region" placeholder="例：日本"></label>
      <label class="field"><span>参照年度</span><input id="factor-year" placeholder="例：2026"></label>
      <button class="primary-button" data-add-factor>${icon("plus")} 登録する</button>
    </div>
    ${selected ? `
      <div style="height:18px"></div>
      <div class="card-pad" style="border:1px solid var(--line); border-radius:var(--radius);">
        <h3>${escapeHTML(selected.name)}</h3>
        <p>${escapeHTML(selected.category)} / ${escapeHTML(selected.region)} / ${escapeHTML(selected.source)}</p>
        <div class="metric-value">${selected.coefficient}<small>t-CO2e/${escapeHTML(selected.unit)}</small></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px">
          <button class="secondary-button" data-fill-factor="${escapeAttr(selected.id)}">${icon("edit")} 入力に使う</button>
          <button class="small-button" data-delete-factor="${escapeAttr(selected.id)}">削除</button>
        </div>
      </div>
    ` : ""}
  `;
}

function renderAnalytics() {
  const totals = getScopeTotals();
  if (!activities.length) {
    return `
      <div class="empty-state">
        ${icon("chart")}
        <h3>分析するデータがありません</h3>
        <p class="muted">活動データを入力すると、Scope別・カテゴリ別・拠点別の集計と月次推移を表示します。</p>
        <button class="primary-button" data-route="data-input">${icon("edit")} データを入力</button>
      </div>
    `;
  }
  const monthly = monthlyTotalsForChart(12);
  return `
    <div class="grid analytics">
      <article class="card card-pad span-3">
        <div class="metric-label">総排出量（CO2e）</div>
        <div class="metric-value">${formatNumber(totals.total)}<small>t-CO2e</small></div>
        <span class="muted">登録活動データ ${activities.length} 件</span>
      </article>
      ${["Scope 1", "Scope 2", "Scope 3"].map((scope) => `
        <article class="card card-pad span-3">
          <div class="metric-label">${escapeHTML(scope)}</div>
          <div class="metric-value">${formatNumber(totals[scope])}<small>t-CO2e</small></div>
          <span class="muted">構成比 ${percent(totals[scope], totals.total)}%</span>
        </article>
      `).join("")}
      <article class="card card-pad span-8">
        <div class="section-title"><h2>月次排出量の推移</h2></div>
        ${renderActualLineChart(monthly)}
      </article>
      <article class="card card-pad span-4">
        <div class="section-title"><h2>拠点別排出量</h2></div>
        ${renderSiteBreakdown()}
      </article>
      <article class="card card-pad span-12">
        <div class="section-title"><h2>カテゴリ別排出量</h2></div>
        ${renderCategoryBreakdown()}
      </article>
    </div>
  `;
}

function renderSiteBreakdown() {
  const buckets = new Map();
  filteredActivities().forEach((activity) => {
    const factor = getFactor(activity.factorId);
    if (!factor) return;
    const site = activity.site || "未設定";
    buckets.set(site, (buckets.get(site) || 0) + calcEmission(activity, factor));
  });
  if (!buckets.size) return `<div class="empty-state"><p class="muted">拠点別の集計はまだありません。</p></div>`;
  const max = Math.max(...buckets.values(), 1);
  const rows = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
  return `
    <div class="bar-list">
      ${rows.map(([site, value]) => `
        <div class="bar-row">
          <strong>${escapeHTML(site)}</strong>
          <div class="bar" style="width:${Math.max(8, value / max * 100).toFixed(1)}%"></div>
          <span>${formatNumber(value)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderReports() {
  const totals = getScopeTotals();
  const reportItems = [
    { type: "monthly", name: "月次排出量サマリー", desc: "月 × Scope の活動量と排出量（CSV）" },
    { type: "scope", name: "Scope別明細", desc: "活動データ全件の明細（CSV）" },
    { type: "factors", name: "原単位マスタ", desc: "登録済み原単位の一覧（CSV）" },
    { type: "json", name: "状態スナップショット", desc: "factors / activities の完全バックアップ（JSON）" },
    { type: "remote-preview", name: "GitHub保存内容プレビュー", desc: "PUT予定のJSONをダウンロードして確認（JSON）" }
  ];
  return `
    <div class="grid two">
      <section class="card card-pad">
        <div class="section-title">
          <div><h2>レポート出力</h2><p>登録済みデータを CSV / JSON で書き出します。BOM付きでExcelでも開けるようにしています。</p></div>
          <button class="secondary-button" data-export>${icon("download")} 全体JSON</button>
        </div>
        <div class="report-list">
          ${reportItems.map((item) => `
            <div class="report-item">
              <div class="legend-row">
                <span>${icon("file")}<span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.desc)}</small></span></span>
                <button class="small-button" data-export-report="${escapeAttr(item.type)}">${icon("download")} 出力</button>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
      <aside class="card card-pad">
        <div class="section-title"><h2>Scope別 出力プレビュー</h2></div>
        <div class="table-wrap">
          <table class="data-table" style="min-width:520px">
            <thead><tr><th>Scope</th><th>排出量(t-CO2e)</th><th>構成比</th></tr></thead>
            <tbody>
              ${["Scope 1", "Scope 2", "Scope 3"].map((scope) => `<tr><td>${escapeHTML(scope)}</td><td>${formatNumber(totals[scope])}</td><td>${percent(totals[scope], totals.total)}%</td></tr>`).join("")}
              <tr><td><strong>合計</strong></td><td><strong>${formatNumber(totals.total)}</strong></td><td>100.0%</td></tr>
            </tbody>
          </table>
        </div>
        <div style="height:14px"></div>
        <h3>原単位マスタ（先頭5件）</h3>
        <div class="table-wrap">
          <table class="data-table" style="min-width:520px">
            <thead><tr><th>Scope</th><th>名称</th><th>係数</th><th>単位</th></tr></thead>
            <tbody>
              ${factors.slice(0, 5).map((factor) => `<tr><td>${escapeHTML(factor.scope)}</td><td>${escapeHTML(factor.name)}</td><td>${escapeHTML(factor.coefficient)}</td><td>${escapeHTML(factor.unit)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  `;
}

function renderGoals() {
  const total = getScopeTotals().total;
  return `
    <section class="card card-pad">
      <div class="section-title"><h2>削減目標</h2></div>
      <p class="muted">削減目標と進捗管理は今後のアップデートで実装予定です。現状の総排出量は <strong>${formatNumber(total)} t-CO2e</strong> です。</p>
      <div class="empty-state">
        ${icon("target")}
        <h3>目標は未設定です</h3>
        <p class="muted">将来的に基準年・目標値・年次マイルストーンを登録できるようにします。</p>
      </div>
    </section>
  `;
}

function renderActions() {
  return `
    <section class="card card-pad">
      <div class="section-title"><h2>削減施策管理</h2></div>
      <p class="muted">削減施策のカンバン管理は今後のアップデートで実装予定です。</p>
      <div class="empty-state">
        ${icon("leaf")}
        <h3>施策は未登録です</h3>
        <p class="muted">検討中・実行中・完了の3カラムで施策を整理できるようにします。</p>
      </div>
    </section>
  `;
}

function renderAlerts() {
  const alerts = computeAlerts();
  return `
    <section class="card card-pad">
      <div class="section-title">
        <div><h2>アラート</h2><p>登録データから自動検出した注意事項です。</p></div>
        <span class="badge ${alerts.length ? "amber" : "green"}">${alerts.length}件</span>
      </div>
      ${alerts.length ? `
        <div class="alert-list">
          ${alerts.map((alert) => `
            <div class="alert-row">
              <span>${icon("alert")}<span><strong>${escapeHTML(alert.title)}</strong><small>${escapeHTML(alert.detail)}</small></span></span>
              <span class="badge ${alert.severity}">${escapeHTML(alert.label)}</span>
            </div>
          `).join("")}
        </div>
      ` : `
        <div class="empty-state">
          ${icon("bell")}
          <h3>対応すべきアラートはありません</h3>
          <p class="muted">原単位の status が「要確認」の項目や、未紐付けの活動データがあればここに表示します。</p>
        </div>
      `}
    </section>
  `;
}

function computeAlerts() {
  const alerts = [];
  factors.forEach((factor) => {
    if (factor.status && factor.status !== "公式" && factor.status !== "カスタム") {
      alerts.push({
        title: `原単位「${factor.name}」の確認が必要`,
        detail: `status: ${factor.status} / ${factor.region || "地域未設定"} / ${factor.year || "年度未設定"}`,
        severity: "amber",
        label: factor.status
      });
    }
  });
  activities.forEach((activity) => {
    if (!getFactor(activity.factorId)) {
      alerts.push({
        title: "原単位が未設定の活動データ",
        detail: `${activity.date || "日付未設定"} / ${activity.site || "拠点未設定"} / ID: ${activity.id}`,
        severity: "red",
        label: "要修正"
      });
    }
  });
  return alerts;
}

function renderSettings() {
  const tokenSet = Boolean(getToken());
  const remoteReady = state.settings.githubOwner && state.settings.githubRepo && tokenSet;
  const lastSync = state.remote.syncedAt ? new Date(state.remote.syncedAt).toLocaleString("ja-JP") : "未同期";
  return `
    <div class="settings-grid">
      <section class="card card-pad">
        <div class="section-title"><h2>テーマ</h2></div>
        <div class="theme-choice">
          ${["light", "dark", "system"].map((theme) => `
            <button class="theme-button ${state.settings.theme === theme ? "is-active" : ""}" data-theme="${escapeAttr(theme)}">
              <div class="theme-preview ${theme === "dark" ? "dark" : ""}"></div>
              <strong>${theme === "light" ? "ライト" : theme === "dark" ? "ダーク" : "システム設定"}</strong>
            </button>
          `).join("")}
        </div>
      </section>
      <section class="card card-pad">
        <div class="section-title"><h2>GitHub 保存先</h2><span class="badge ${remoteReady ? "green" : "amber"}">${remoteReady ? "設定済み" : "未設定"}</span></div>
        <div class="settings-list">
          <label class="field"><span>GitHub owner</span><input data-setting="githubOwner" value="${escapeAttr(state.settings.githubOwner)}" placeholder="例：take"></label>
          <label class="field"><span>GitHub repo</span><input data-setting="githubRepo" value="${escapeAttr(state.settings.githubRepo)}" placeholder="例：scope1-3_calc_app"></label>
          <label class="field"><span>ブランチ</span><input data-setting="githubBranch" value="${escapeAttr(state.settings.githubBranch || "main")}" placeholder="main"></label>
          <label class="field"><span>データ保存パス</span><input data-setting="dataPath" value="${escapeAttr(state.settings.dataPath)}"></label>
        </div>
        <p class="muted">最終同期: ${escapeHTML(lastSync)}${state.remote.sha ? ` / sha: ${escapeHTML(state.remote.sha.slice(0, 7))}` : ""}</p>
        <div class="form-actions" style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px">
          <button class="secondary-button" data-remote-action="pull" ${state.busy ? "disabled" : ""}>${icon("download")} GitHubから取得</button>
          <button class="primary-button" data-remote-action="push" ${state.busy ? "disabled" : ""}>${icon("file")} GitHubに保存</button>
          <button class="secondary-button" data-remote-action="history" ${state.busy ? "disabled" : ""}>${icon("refresh")} 履歴を表示</button>
        </div>
      </section>
      <section class="card card-pad">
        <div class="section-title"><h2>個人アクセストークン</h2><span class="badge ${tokenSet ? "green" : "amber"}">${tokenSet ? "保存済み" : "未設定"}</span></div>
        <p class="muted">Fine-grained token を推奨。対象リポジトリ・Contents read/write のみに限定してください。トークンはこのブラウザの localStorage にのみ保持され、リポジトリには絶対にコミットされません。</p>
        <label class="field"><span>GitHub Personal Access Token</span><input id="github-token" type="password" autocomplete="off" placeholder="${tokenSet ? "（保存済み・上書きする場合のみ入力）" : "ghp_xxx... または github_pat_xxx..."}"></label>
        <div class="form-actions" style="display:flex; gap:10px; margin-top:12px">
          <button class="primary-button" data-token-save>保存</button>
          <button class="secondary-button" data-token-clear ${tokenSet ? "" : "disabled"}>削除</button>
        </div>
      </section>
      <section class="card card-pad">
        <div class="section-title"><h2>セキュリティ</h2></div>
        <div class="settings-list">
          <div class="setting-row"><span>個人アクセストークン</span><span class="badge amber">localStorageのみ</span></div>
          <div class="setting-row"><span>公開リポジトリ保存</span><span class="badge red">機微情報禁止</span></div>
          <div class="setting-row"><span>外部APIアクセス先</span><span class="badge green">api.github.com のみ</span></div>
          <div class="setting-row"><span>バックアップ</span><span class="badge green">JSON / CSV 出力</span></div>
        </div>
      </section>
      <section class="card card-pad">
        <div class="section-title"><h2>単位設定</h2></div>
        <div class="settings-list">
          <div class="setting-row"><span>排出量単位</span><strong>t-CO2e</strong></div>
          <div class="setting-row"><span>通貨単位</span><strong>JPY（円）</strong></div>
          <div class="setting-row"><span>小数処理</span><strong>小数点第2位まで</strong></div>
        </div>
      </section>
      <section class="card card-pad">
        <div class="section-title"><h2>開発用</h2></div>
        <p class="muted">ローカル状態の操作です。</p>
        <div class="tabs">
          <button class="secondary-button" data-export>${icon("download")} JSON出力</button>
          <button class="secondary-button" data-clear-activities>${icon("refresh")} 活動データのみ削除</button>
          <button class="secondary-button" data-seed-reset>${icon("refresh")} シードに戻す（factors / activities をリセット）</button>
        </div>
      </section>
      ${renderLegacyBackupSection()}
    </div>
    ${state.historyOpen ? renderHistoryModal() : ""}
  `;
}

function renderLegacyBackupSection() {
  const backup = getLegacyBackup();
  if (!backup) return "";
  const backupAt = backup.backupAt ? new Date(backup.backupAt).toLocaleString("ja-JP") : "不明";
  const keys = Object.keys(backup.data || {});
  return `
    <section class="card card-pad">
      <div class="section-title"><h2>v1 バックアップ</h2><span class="badge amber">保護中</span></div>
      <p class="muted">前バージョン (v1) で保存されていた以下のキーを退避しました。バックアップ時刻: ${escapeHTML(backupAt)}</p>
      <ul style="margin:8px 0 14px; padding-left:20px;">
        ${keys.map((key) => `<li><code>${escapeHTML(key)}</code></li>`).join("")}
      </ul>
      <div class="form-actions" style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="secondary-button" data-export-legacy>${icon("download")} JSON でダウンロード</button>
        <button class="secondary-button" data-delete-legacy>${icon("refresh")} バックアップを削除</button>
      </div>
    </section>
  `;
}

function renderHistoryModal() {
  return `
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="GitHub保存履歴">
      <div class="modal">
        <header class="modal-header">
          <h2>GitHub 保存履歴</h2>
          <button class="icon-button" data-close-history aria-label="閉じる">×</button>
        </header>
        <div class="modal-body">
          ${state.busy && !state.history.length ? `<p class="muted">読み込み中...</p>` : ""}
          ${!state.busy && !state.history.length ? `<p class="muted">履歴がまだありません。GitHubに保存すると履歴が表示されます。</p>` : ""}
          ${state.history.length ? `
            <ul class="history-list">
              ${state.history.map((commit) => {
                const sha = commit.sha || "";
                const author = commit.commit?.author?.name || commit.author?.login || "unknown";
                const date = commit.commit?.author?.date ? new Date(commit.commit.author.date).toLocaleString("ja-JP") : "";
                const message = commit.commit?.message || "";
                return `
                  <li class="history-item">
                    <div>
                      <strong>${escapeHTML(message.split("\n")[0])}</strong>
                      <small>${escapeHTML(author)} / ${escapeHTML(date)} / ${escapeHTML(sha.slice(0, 7))}</small>
                    </div>
                    <button class="small-button" data-restore-sha="${escapeAttr(sha)}" ${state.busy ? "disabled" : ""}>${icon("refresh")} この時点へ復元</button>
                  </li>
                `;
              }).join("")}
            </ul>
          ` : ""}
        </div>
        <footer class="modal-footer">
          <button class="secondary-button" data-close-history>閉じる</button>
        </footer>
      </div>
    </div>
  `;
}


function filteredActivities() {
  let result = activities;
  const site = state.settings.site;
  if (site && site !== "すべてのサイト") {
    result = result.filter((a) => a.site === site);
  }
  const period = state.settings.period;
  if (period && period !== "全期間" && /^\d{4}-\d{2}$/.test(period)) {
    result = result.filter((a) => (a.date || "").startsWith(period));
  }
  return result;
}

function getScopeTotals() {
  const totals = { "Scope 1": 0, "Scope 2": 0, "Scope 3": 0 };
  filteredActivities().forEach((activity) => {
    const factor = getFactor(activity.factorId);
    if (!factor) return;
    totals[factor.scope] += calcEmission(activity, factor);
  });
  totals.total = totals["Scope 1"] + totals["Scope 2"] + totals["Scope 3"];
  return totals;
}

function calcEmission(activity, factor) {
  if (!factor) return 0;
  return Number(activity.amount || 0) * Number(factor.coefficient || 0);
}

function calcDraft() {
  const factor = getFactor(state.draft.factorId);
  return calcEmission({ amount: state.draft.amount }, factor);
}

function updateCalcPreview() {
  const preview = document.querySelector("#calc-preview");
  const formula = document.querySelector("#calc-formula");
  if (preview) preview.innerHTML = `${formatNumber(calcDraft())}<small>t-CO2e</small>`;
  if (formula) formula.textContent = formatFormula(getFactor(state.draft.factorId));
}

function formatFormula(factor) {
  if (!factor) return "活動量 x 原単位";
  return `${formatNumber(Number(state.draft.amount || 0))} ${factor.unit} x ${factor.coefficient} t-CO2e/${factor.unit}`;
}

function saveActivityFromForm() {
  if (!ensureWritable()) return;
  const factorId = valueOf("[data-draft='factorId']");
  const amount = Number(valueOf("[data-draft='amount']"));
  if (!factorId) {
    showToast("排出源を選択してください", "error");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("活動量は0より大きい数値を入力してください", "error");
    return;
  }
  if (!getFactor(factorId)) {
    showToast("選択した原単位が見つかりません", "error");
    return;
  }
  activities.push({
    id: `a-${Date.now()}`,
    factorId,
    amount,
    site: valueOf("[data-draft='site']") || "未設定",
    supplier: valueOf("[data-draft='supplier']") || "",
    date: valueOf("[data-draft='date']") || new Date().toISOString().slice(0, 10),
    memo: valueOf("[data-draft='memo']") || ""
  });
  state.draft.amount = amount;
  persist();
  showToast("活動データを保存しました", "success");
  navigate("data-list");
}

function saveFactorFromForm() {
  if (!ensureWritable()) return;
  const name = valueOf("#factor-name").trim();
  const scope = valueOf("#factor-scope") || "Scope 1";
  const category = valueOf("#factor-category").trim() || "未分類";
  const unit = valueOf("#factor-unit").trim();
  const coefficient = Number(valueOf("#factor-coefficient"));
  if (!name) {
    showToast("原単位名を入力してください", "error");
    return;
  }
  if (!unit) {
    showToast("単位を入力してください", "error");
    return;
  }
  if (!Number.isFinite(coefficient) || coefficient <= 0) {
    showToast("係数は0より大きい数値を入力してください", "error");
    return;
  }
  const factor = {
    id: `f-${Date.now()}`,
    scope,
    name,
    category,
    unit,
    coefficient,
    source: "手動登録",
    region: valueOf("#factor-region").trim() || "未設定",
    year: valueOf("#factor-year").trim() || String(new Date().getFullYear()),
    status: "カスタム"
  };
  factors.unshift(factor);
  state.selectedFactorId = factor.id;
  state.factorFilter = "すべて";
  persist();
  showToast("原単位を登録しました", "success");
  render();
}

function exportState() {
  downloadFile("scarbon-state.json", buildStateJSON(), "application/json");
  showToast("JSONを書き出しました", "success");
  render();
}

function exportReport(type) {
  const today = new Date().toISOString().slice(0, 10);
  if (type === "monthly") {
    downloadFile(`scarbon-monthly-${today}.csv`, buildMonthlyCsv(), "text/csv");
    showToast("月次サマリーCSVを書き出しました", "success");
  } else if (type === "scope") {
    downloadFile(`scarbon-scope-detail-${today}.csv`, buildScopeDetailCsv(), "text/csv");
    showToast("Scope別明細CSVを書き出しました", "success");
  } else if (type === "factors") {
    downloadFile(`scarbon-factors-${today}.csv`, buildFactorsCsv(), "text/csv");
    showToast("原単位マスタCSVを書き出しました", "success");
  } else if (type === "actions") {
    downloadFile(`scarbon-actions-${today}.json`, JSON.stringify({ actions: [] }, null, 2), "application/json");
    showToast("施策テンプレートを書き出しました", "success");
  } else if (type === "remote-preview") {
    downloadFile(`scarbon-state-preview-${today}.json`, buildStateJSON(), "application/json");
    showToast("GitHub保存内容のプレビューを書き出しました", "success");
  } else {
    exportState();
  }
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function csvRow(values) {
  return values.map(csvEscape).join(",");
}

function csvWithBOM(rows) {
  return "﻿" + rows.join("\r\n") + "\r\n";
}

function buildMonthlyCsv() {
  const buckets = new Map();
  activities.forEach((activity) => {
    const factor = getFactor(activity.factorId);
    if (!factor) return;
    const month = (activity.date || "").slice(0, 7) || "未設定";
    const key = `${month}__${factor.scope}`;
    const current = buckets.get(key) || { month, scope: factor.scope, amount: 0, emission: 0, count: 0 };
    current.amount += Number(activity.amount || 0);
    current.emission += calcEmission(activity, factor);
    current.count += 1;
    buckets.set(key, current);
  });
  const rows = [csvRow(["月", "Scope", "件数", "合計活動量", "排出量(t-CO2e)"])]
    .concat(
      Array.from(buckets.values())
        .sort((a, b) => (a.month + a.scope).localeCompare(b.month + b.scope))
        .map((row) => csvRow([row.month, row.scope, row.count, round(row.amount), round(row.emission)]))
    );
  return csvWithBOM(rows);
}

function buildScopeDetailCsv() {
  const rows = [csvRow(["日付", "Scope", "排出源", "カテゴリ", "拠点", "サプライヤー", "活動量", "単位", "原単位係数", "排出量(t-CO2e)", "メモ"])]
    .concat(activities.map((activity) => {
      const factor = getFactor(activity.factorId);
      return csvRow([
        activity.date,
        factor?.scope || "",
        factor?.name || "",
        factor?.category || "",
        activity.site,
        activity.supplier,
        activity.amount,
        factor?.unit || "",
        factor?.coefficient ?? "",
        round(calcEmission(activity, factor)),
        activity.memo
      ]);
    }));
  return csvWithBOM(rows);
}

function buildFactorsCsv() {
  const rows = [csvRow(["ID", "Scope", "名称", "カテゴリ", "単位", "係数(t-CO2e/単位)", "出典", "地域", "年度", "ステータス"])]
    .concat(factors.map((factor) => csvRow([
      factor.id,
      factor.scope,
      factor.name,
      factor.category,
      factor.unit,
      factor.coefficient,
      factor.source,
      factor.region,
      factor.year,
      factor.status
    ])));
  return csvWithBOM(rows);
}

function round(value) {
  const number = Number(value || 0);
  return Math.round(number * 1000) / 1000;
}

function persist() {
  if (legacyMigrationResult.backupFailed) return;
  localStorage.setItem(STORAGE_KEYS.factors, JSON.stringify(factors));
  localStorage.setItem(STORAGE_KEYS.activities, JSON.stringify(activities));
}

function persistSettings() {
  if (legacyMigrationResult.backupFailed) return;
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function persistRemote() {
  if (legacyMigrationResult.backupFailed) return;
  localStorage.setItem(STORAGE_KEYS.remote, JSON.stringify(state.remote));
}

function loadInitialCollection(currentKey, legacyKey, fallback) {
  if (legacyMigrationResult.backupFailed) {
    try {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) return JSON.parse(legacyRaw);
    } catch (error) {}
  }
  return loadJSON(currentKey, fallback);
}

function ensureWritable() {
  if (legacyMigrationResult.backupFailed) {
    showToast("読み取り専用モードのため変更を保存できません。ブラウザのストレージ容量を空けて再読込してください。", "error");
    return false;
  }
  return true;
}

function getLegacyBackup() {
  try {
    const raw = localStorage.getItem(LEGACY_BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : clone(fallback);
  } catch (error) {
    return clone(fallback);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSettings(settings) {
  // 旧バージョン (defaultSettings.period = "2026年4月") の永続化値を「全期間」に巻き戻す。
  // periodSuggestions は YYYY-MM 形式しか返さないため、表示と集計の不一致を防ぐ。
  if (settings.period && settings.period !== "全期間" && !/^\d{4}-\d{2}$/.test(settings.period)) {
    settings.period = "全期間";
  }
  return settings;
}

function mergeDefaults(defaults, value) {
  return Object.assign({}, defaults, value || {});
}

function getToken() {
  try {
    return localStorage.getItem(STORAGE_KEYS.token) || "";
  } catch (error) {
    return "";
  }
}

function setToken(token) {
  if (token) localStorage.setItem(STORAGE_KEYS.token, token);
  else localStorage.removeItem(STORAGE_KEYS.token);
}

function clearToken() {
  setToken("");
}

function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeUtf8Base64(text) {
  const cleaned = String(text).replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function ensureGithubConfig() {
  const owner = state.settings.githubOwner.trim();
  const repo = state.settings.githubRepo.trim();
  const branch = (state.settings.githubBranch || "main").trim();
  const path = (state.settings.dataPath || "data/scarbon-state.json").trim();
  const token = getToken();
  if (!owner || !repo) throw new Error("owner / repo を設定してください");
  if (!path) throw new Error("データ保存パスを設定してください");
  if (!token) throw new Error("個人アクセストークンを設定してください");
  return { owner, repo, branch, path, token };
}

async function githubFetch(url, options = {}) {
  const { token, ...rest } = options;
  const headers = Object.assign({
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  }, options.headers || {});
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, Object.assign({}, rest, { headers }));
  if (!response.ok && response.status !== 404) {
    let message = `GitHub API エラー: HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody && errorBody.message) message += ` (${errorBody.message})`;
    } catch (error) {
      // JSON でなければ無視
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response;
}

async function githubGetContents(config, ref) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(config.path)}?ref=${encodeURIComponent(ref || config.branch)}`;
  const response = await githubFetch(url, { token: config.token });
  if (response.status === 404) return null;
  return response.json();
}

async function githubPutContents(config, body) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(config.path)}`;
  const response = await githubFetch(url, {
    method: "PUT",
    token: config.token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

async function githubListCommits(config, limit = 10) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/commits?path=${encodePath(config.path)}&sha=${encodeURIComponent(config.branch)}&per_page=${limit}`;
  const response = await githubFetch(url, { token: config.token });
  if (response.status === 404) return [];
  return response.json();
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function buildStateJSON() {
  return JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    factors,
    activities
  }, null, 2);
}

function applyRemoteContent(payload, sha) {
  if (!payload) return false;
  if (Array.isArray(payload.factors)) factors = payload.factors;
  if (Array.isArray(payload.activities)) activities = payload.activities;
  state.remote.sha = sha || "";
  state.remote.syncedAt = new Date().toISOString();
  persist();
  persistRemote();
  return true;
}

async function pullFromGithub() {
  if (state.busy) return;
  if (!ensureWritable()) return;
  let config;
  try {
    config = ensureGithubConfig();
  } catch (error) {
    showToast(error.message, "error");
    return;
  }
  state.busy = true;
  render();
  try {
    const data = await githubGetContents(config);
    if (!data) {
      showToast("GitHub上にデータファイルがありません。先に保存してください", "error");
      return;
    }
    const text = decodeUtf8Base64(data.content || "");
    const payload = JSON.parse(text);
    applyRemoteContent(payload, data.sha);
    showToast("GitHubからデータを取得しました", "success");
  } catch (error) {
    showToast(error.message || "GitHub取得に失敗しました", "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function pushToGithub(options = {}) {
  if (state.busy) return;
  if (!ensureWritable()) return;
  let config;
  try {
    config = ensureGithubConfig();
  } catch (error) {
    showToast(error.message, "error");
    return;
  }
  state.busy = true;
  render();
  try {
    const remote = await githubGetContents(config);
    const remoteSha = remote ? remote.sha : "";
    if (remote && state.remote.sha && state.remote.sha !== remoteSha && !options.force) {
      const overwrite = window.confirm("リモートのデータが別の更新で進んでいます。上書きしますか？\n（キャンセル時は何もせず終了します）");
      if (!overwrite) {
        showToast("保存をキャンセルしました", "info");
        return;
      }
    }
    const body = {
      message: options.message || `S&Carbon update ${new Date().toISOString()}`,
      content: encodeUtf8Base64(buildStateJSON()),
      branch: config.branch
    };
    if (remoteSha) body.sha = remoteSha;
    const result = await githubPutContents(config, body);
    state.remote.sha = result?.content?.sha || "";
    state.remote.syncedAt = new Date().toISOString();
    persistRemote();
    showToast("GitHubに保存しました", "success");
  } catch (error) {
    showToast(error.message || "GitHub保存に失敗しました", "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function loadHistory() {
  if (state.busy) return;
  let config;
  try {
    config = ensureGithubConfig();
  } catch (error) {
    showToast(error.message, "error");
    return;
  }
  state.busy = true;
  state.historyOpen = true;
  render();
  try {
    const commits = await githubListCommits(config, 20);
    state.history = Array.isArray(commits) ? commits : [];
    if (!state.history.length) showToast("履歴がまだありません", "info");
  } catch (error) {
    showToast(error.message || "履歴取得に失敗しました", "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function restoreFromCommit(sha) {
  if (state.busy || !sha) return;
  if (!ensureWritable()) return;
  let config;
  try {
    config = ensureGithubConfig();
  } catch (error) {
    showToast(error.message, "error");
    return;
  }
  if (!window.confirm("この時点のデータで現在の状態を上書きします。よろしいですか？")) return;
  state.busy = true;
  render();
  try {
    const data = await githubGetContents(config, sha);
    if (!data) {
      showToast("対象リビジョンに該当ファイルがありません", "error");
      return;
    }
    const payload = JSON.parse(decodeUtf8Base64(data.content || ""));
    applyRemoteContent(payload, data.sha);
    showToast("選択したリビジョンへ復元しました", "success");
  } catch (error) {
    showToast(error.message || "復元に失敗しました", "error");
  } finally {
    state.busy = false;
    render();
  }
}

function closeHistory() {
  state.historyOpen = false;
  state.history = [];
  render();
}

function getFactor(id) {
  return factors.find((factor) => factor.id === id);
}

function navigate(route) {
  window.location.hash = `#${validRoute(route)}`;
}

function readRoute() {
  return validRoute(window.location.hash.replace("#", "") || "dashboard");
}

function validRoute(route) {
  return screens.some((screen) => screen.id === route) ? route : "dashboard";
}

function applyTheme() {
  const theme = state.settings.theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : state.settings.theme;
  document.documentElement.dataset.theme = theme;
}

function showToast(message, type = "info") {
  state.toast = message;
  state.toastType = type;
  window.clearTimeout(showToast.timer);
  const duration = type === "error" ? 4200 : 2400;
  // 表示は render() で行うが、自動消去はトースト要素だけ削除する（select の dropdown が
  // 開いているときに DOM 全体を再構築すると閉じてしまうため）。
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    state.toastType = "info";
    const el = document.querySelector(".toast");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }, duration);
  render();
}

function optionList(options, selected) {
  return options.map((option) => `<option value="${escapeAttr(option)}" ${option === selected ? "selected" : ""}>${escapeHTML(option)}</option>`).join("");
}

function valueOf(selector) {
  const element = document.querySelector(selector);
  return element ? element.value : "";
}

function formatNumber(value) {
  const number = Number(value || 0);
  const maximumFractionDigits = Math.abs(number) >= 100 ? 0 : 2;
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(number);
}

function percent(value, total) {
  if (!total) return "0.0";
  return (value / total * 100).toFixed(1);
}

function badgeColor(scope) {
  if (scope === "Scope 2") return "green";
  if (scope === "Scope 3") return "purple";
  return "";
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function mobileLead(route) {
  const leads = {
    dashboard: "Scope 1・2・3 の排出量をひと目で確認します",
    "data-input": "活動データを入力してCO2排出量を算定します",
    "data-list": "登録済みデータを確認します",
    factors: "排出量計算に使う原単位を管理します",
    analytics: "排出量の傾向と削減ポイントを分析します",
    reports: "必要なデータを出力します",
    goals: "削減目標と進捗を管理します",
    actions: "削減施策を管理します",
    alerts: "対応が必要な項目を確認します",
    settings: "アプリの表示と保存先を設定します"
  };
  return leads[route] || "";
}

function icon(name) {
  const paths = {
    home: '<path d="M3 11 12 3l9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path>',
    edit: '<path d="M4 20h4l11-11-4-4L4 16v4z"></path><path d="m13 6 4 4"></path>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"></path>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 17 9 5 9-5"></path>',
    chart: '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 16V9"></path><path d="M12 16V6"></path><path d="M16 16v-4"></path>',
    file: '<path d="M6 2h8l4 4v16H6z"></path><path d="M14 2v5h5"></path><path d="M8 13h8"></path><path d="M8 17h8"></path>',
    target: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>',
    leaf: '<path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16z"></path><path d="M4 20c4-6 8-9 16-16"></path>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
    gear: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9.1 1.7 1.7 0 0 0-.8 1.6V22h-4v-.2a1.7 1.7 0 0 0-.8-1.6 1.7 1.7 0 0 0-1.9-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9-.1A1.7 1.7 0 0 0 9.1 2V2h4v.2a1.7 1.7 0 0 0 .8 1.6 1.7 1.7 0 0 0 1.9.1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21v4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>',
    factory: '<path d="M3 21V9l6 4V9l6 4V5h6v16H3z"></path><path d="M7 18h2M12 18h2M17 18h2"></path>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"></path>',
    truck: '<path d="M3 7h11v10H3z"></path><path d="M14 11h4l3 3v3h-7z"></path><circle cx="7" cy="19" r="2"></circle><circle cx="18" cy="19" r="2"></circle>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    filter: '<path d="M4 5h16l-6 7v5l-4 2v-7L4 5z"></path>',
    download: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
    help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8"></path><path d="M12 17h.01"></path>',
    alert: '<path d="M12 3 2 21h20L12 3z"></path><path d="M12 9v5"></path><path d="M12 18h.01"></path>',
    refresh: '<path d="M20 6v5h-5"></path><path d="M4 18v-5h5"></path><path d="M19 11a7 7 0 0 0-12-4"></path><path d="M5 13a7 7 0 0 0 12 4"></path>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.help}</svg>`;
}
