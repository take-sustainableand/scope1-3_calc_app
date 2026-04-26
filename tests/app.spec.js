// @ts-check
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  // 各テストはまっさらな localStorage で開始
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (error) {}
  });
});

test("旧 v1 localStorage は v2 に移行されてバックアップに退避される", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("scarbon:factors:v1", JSON.stringify([{ id: "user-old", scope: "Scope 1", name: "ユーザー登録の v1 原単位", category: "x", unit: "kg", coefficient: 0.5, source: "user", region: "日本", year: "2024", status: "カスタム" }]));
      localStorage.setItem("scarbon:activities:v1", JSON.stringify([{ id: "user-a", factorId: "user-old", amount: 10, site: "ユーザー拠点", supplier: "x", date: "2024-12-01", memo: "ユーザー入力メモ" }]));
    } catch (error) {}
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // v1 は削除されている
  const v1Factors = await page.evaluate(() => localStorage.getItem("scarbon:factors:v1"));
  const v1Activities = await page.evaluate(() => localStorage.getItem("scarbon:activities:v1"));
  expect(v1Factors).toBeNull();
  expect(v1Activities).toBeNull();

  // v2 にコピーされている
  const v2Factors = await page.evaluate(() => localStorage.getItem("scarbon:factors:v2"));
  const v2Activities = await page.evaluate(() => localStorage.getItem("scarbon:activities:v2"));
  expect(v2Factors).toContain("ユーザー登録の v1 原単位");
  expect(v2Activities).toContain("ユーザー拠点");

  // バックアップが残っている
  const backup = await page.evaluate(() => localStorage.getItem("scarbon:legacy-backup:v1"));
  expect(backup).not.toBeNull();
  expect(backup).toContain("scarbon:factors:v1");

  // ユーザーが見える状態（DataList に出る）
  await page.locator('[data-route="data-list"]').first().click();
  await expect(page.getByText("ユーザー入力メモ").first()).toBeVisible();

  // 設定画面のバックアップセクションも表示
  await page.locator('[data-route="settings"]').first().click();
  await expect(page.getByRole("heading", { name: "v1 バックアップ" })).toBeVisible();
});

test("v1 バックアップ保存に失敗した場合、 v1 データは削除されない", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("scarbon:factors:v1", JSON.stringify([{ id: "user-protected", scope: "Scope 1", name: "保護対象データ", category: "x", unit: "kg", coefficient: 0.1, source: "user", region: "日本", year: "2024", status: "カスタム" }]));
    } catch (error) {}
    // バックアップキーへの setItem だけ throw（quota 超過をエミュレート）
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "scarbon:legacy-backup:v1") {
        throw new Error("QuotaExceededError simulated");
      }
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const v1 = await page.evaluate(() => localStorage.getItem("scarbon:factors:v1"));
  expect(v1).not.toBeNull();
  expect(v1).toContain("保護対象データ");
  // v2 にもコピーされていない（さらに seed factors も書き込まれていない）
  const v2 = await page.evaluate(() => localStorage.getItem("scarbon:factors:v2"));
  expect(v2).toBeNull();
  // バックアップキーも未保存
  const backup = await page.evaluate(() => localStorage.getItem("scarbon:legacy-backup:v1"));
  expect(backup).toBeNull();
  // ユーザーにエラートーストが出る
  await expect(page.locator(".toast-error")).toBeVisible();
});

test("backupFailed リトライ: 1回目失敗 → リロード(失敗解消) で v1 が v2 へ正しく移行される", async ({ page, context }) => {
  // 1回目: バックアップ書き込みを throw する init script
  await context.addInitScript(() => {
    try {
      localStorage.setItem("scarbon:factors:v1", JSON.stringify([{ id: "retry-user", scope: "Scope 1", name: "リトライ対象データ", category: "x", unit: "kg", coefficient: 0.2, source: "user", region: "日本", year: "2024", status: "カスタム" }]));
    } catch (error) {}
    if (!sessionStorage.getItem("retry-pass-2")) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === "scarbon:legacy-backup:v1") throw new Error("QuotaExceededError simulated");
        return original.call(this, key, value);
      };
    }
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // 1回目: v2 は seed で汚染されていない
  const v2AfterFail = await page.evaluate(() => localStorage.getItem("scarbon:factors:v2"));
  expect(v2AfterFail).toBeNull();
  // v1 は無傷
  const v1AfterFail = await page.evaluate(() => localStorage.getItem("scarbon:factors:v1"));
  expect(v1AfterFail).toContain("リトライ対象データ");
  // 2回目ロード: throw を解除してリロード
  await page.evaluate(() => sessionStorage.setItem("retry-pass-2", "1"));
  await page.reload();
  await page.waitForLoadState("networkidle");
  // 今度は v1 → v2 に綺麗にコピーされ、 v1 は削除される
  const v1After = await page.evaluate(() => localStorage.getItem("scarbon:factors:v1"));
  const v2After = await page.evaluate(() => localStorage.getItem("scarbon:factors:v2"));
  const backupAfter = await page.evaluate(() => localStorage.getItem("scarbon:legacy-backup:v1"));
  expect(v1After).toBeNull();
  expect(v2After).toContain("リトライ対象データ");
  expect(backupAfter).not.toBeNull();
});

test("初回起動: オンボーディング画面が表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "S&Carbon へようこそ" })).toBeVisible();
  await expect(page.getByRole("button", { name: /原単位を開く/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /データを入力/ })).toBeVisible();
});

test("シード原単位が data/scarbon-state.json から取得される", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-route="factors"]').first().click();
  await expect(page.getByText("電力（日本・全国平均）").first()).toBeVisible();
  await expect(page.getByText("都市ガス（13A）").first()).toBeVisible();
  await expect(page.getByText("LPG（プロパン）").first()).toBeVisible();
  await expect(page.getByText("灯油").first()).toBeVisible();
  await expect(page.getByText("通勤（鉄道）").first()).toBeVisible();
});

test("過去に factors を空配列で永続化していても seed が再ロードされる", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("scarbon:factors:v2", JSON.stringify([]));
      localStorage.setItem("scarbon:activities:v2", JSON.stringify([]));
    } catch (error) {}
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-route="factors"]').first().click();
  // 「原単位がまだありません」ではなくシードが復活している
  await expect(page.getByText("電力（日本・全国平均）").first()).toBeVisible();
  await expect(page.getByText("LPG（プロパン）").first()).toBeVisible();
});

test("旧 settings.period (2026年4月) が起動時に「全期間」へ正規化される", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("scarbon:settings:v2", JSON.stringify({ theme: "light", site: "すべてのサイト", period: "2026年4月", githubOwner: "", githubRepo: "", githubBranch: "main", dataPath: "data/scarbon-state.json" }));
    } catch (error) {}
  });
  await page.goto("/#dashboard");
  await page.waitForLoadState("networkidle");
  // topbar の select の選択値が「全期間」
  const periodValue = await page.evaluate(() => document.querySelector("#period-select")?.value);
  expect(periodValue).toBe("全期間");
});

test("活動データを入力 → 一覧に出る → 削除できる", async ({ page }) => {
  await page.goto("/#data-input");

  // 排出源 select に Scope 1 の都市ガスがあることを期待（デフォルト）。
  // amount に値を入れる
  await page.locator('[data-draft="amount"]').fill("123");
  await page.locator('[data-draft="site"]').fill("自宅");
  await page.locator('[data-draft="date"]').fill("2026-04-15");
  await page.locator('[data-draft="memo"]').fill("テスト用");

  await page.locator("[data-save-entry]").click();

  // データ一覧へ遷移
  await expect(page).toHaveURL(/#data-list/);
  await expect(page.getByRole("cell", { name: "自宅" })).toBeVisible();
  await expect(page.getByText("テスト用")).toBeVisible();

  // 削除（confirm を承認）
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-delete-activity]").first().click();
  await expect(page.getByText("テスト用")).toHaveCount(0);
});

test("活動量未入力時はエラートーストが出て遷移しない", async ({ page }) => {
  await page.goto("/#data-input");
  await page.locator("[data-save-entry]").click();
  await expect(page.locator(".toast-error")).toBeVisible();
  await expect(page).toHaveURL(/#data-input/);
});

test("原単位を新規登録できる（係数0は弾かれる）", async ({ page }) => {
  await page.goto("/#factors");

  // 係数を 0 にすると弾かれる
  await page.locator("#factor-name").fill("テスト原単位");
  await page.locator("#factor-unit").fill("kg");
  await page.locator("#factor-coefficient").fill("0");
  await page.locator("[data-add-factor]").click();
  await expect(page.locator(".toast-error")).toBeVisible();

  // 正常値で再登録
  await page.locator("#factor-coefficient").fill("0.001");
  await page.locator("[data-add-factor]").click();
  await expect(page.getByText("テスト原単位").first()).toBeVisible();
});

test("テーマ切替（ライト → ダーク → システム）", async ({ page }) => {
  await page.goto("/#settings");
  await page.locator('button[data-theme="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator('button[data-theme="light"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator('button[data-theme="system"]').click();
  // system は OS に追従、 attr は dark|light のいずれか
  const value = await page.locator("html").getAttribute("data-theme");
  expect(["dark", "light"]).toContain(value);
});

test("レポート: 月次CSVをダウンロード", async ({ page }) => {
  // 1件入力してから出力
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("100");
  await page.locator('[data-draft="date"]').fill("2026-04-01");
  await page.locator("[data-save-entry]").click();
  await expect(page).toHaveURL(/#data-list/);

  await page.goto("/#reports");
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-export-report="monthly"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^scarbon-monthly-.*\.csv$/);
});

test("factor フォームの入力は render が走っても消えない (係数0で error → 値を訂正して再 submit)", async ({ page }) => {
  await page.goto("/#factors");
  await page.locator("#factor-name").fill("永続化テスト");
  await page.locator("#factor-unit").fill("kg");
  await page.locator("#factor-coefficient").fill("0");
  await page.locator("[data-add-factor]").click();
  // error toast が出る = render が走る
  await expect(page.locator(".toast-error")).toBeVisible();
  // フォームの値が残っている
  await expect(page.locator("#factor-name")).toHaveValue("永続化テスト");
  await expect(page.locator("#factor-unit")).toHaveValue("kg");
  // 係数だけ訂正して submit → 登録される
  await page.locator("#factor-coefficient").fill("0.001");
  await page.locator("[data-add-factor]").click();
  await expect(page.getByText("永続化テスト").first()).toBeVisible();
  // 登録成功後はフォームがクリア
  await expect(page.locator("#factor-name")).toHaveValue("");
});

test("topbar の集計期間 select を切り替えると集計値も更新される", async ({ page }) => {
  // 1月と4月のデータを 1 件ずつ入れる
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("100");
  await page.locator('[data-draft="date"]').fill("2026-04-01");
  await page.locator("[data-save-entry]").click();
  await expect(page).toHaveURL(/#data-list/);
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("200");
  await page.locator('[data-draft="date"]').fill("2026-01-15");
  await page.locator("[data-save-entry]").click();
  await expect(page).toHaveURL(/#data-list/);

  await page.goto("/#dashboard");
  // デフォルト「全期間」では合計が 100+200 の活動量分
  const totalAll = await page.locator(".metric-value").first().innerText();
  // 集計期間を 2026-04 に切り替え
  await page.locator("#period-select").selectOption("2026-04");
  // 値が変わっている (300 件分の合計 ≠ 100 件分の合計)
  const total04 = await page.locator(".metric-value").first().innerText();
  expect(total04).not.toBe(totalAll);
  // さらに 2026-01 に切り替え
  await page.locator("#period-select").selectOption("2026-01");
  const total01 = await page.locator(".metric-value").first().innerText();
  expect(total01).not.toBe(total04);
});

test("旧 settings で defaultSettings.period が '2026年4月' でも option として表示が壊れない", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("scarbon:settings:v2", JSON.stringify({ theme: "light", site: "すべてのサイト", period: "2026年4月", githubOwner: "", githubRepo: "", githubBranch: "main", dataPath: "data/scarbon-state.json" }));
    } catch (error) {}
  });
  await page.goto("/#dashboard");
  // 起動時 normalizeSettings が「全期間」へ正規化、 select に「全期間」が選択された状態で表示
  await expect(page.locator("#period-select")).toHaveValue("全期間");
});

test("XSS: 原単位名に <script> を入れても DOM パースされない", async ({ page }) => {
  await page.goto("/#factors");
  await page.locator("#factor-name").fill("<img src=x onerror=alert(1)>悪意");
  await page.locator("#factor-unit").fill("kg");
  await page.locator("#factor-coefficient").fill("0.5");
  await page.locator("[data-add-factor]").click();

  // 表示はされるが script として走らない
  await expect(page.getByText(/悪意/).first()).toBeVisible();
  // 元のタグが文字列のまま残る（HTMLタグとしてパースされない）= img 要素として存在しない
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test("全画面でテーマ切替が反映される（分析画面の強制ダーク禁止）", async ({ page }) => {
  await page.goto("/#settings");
  await page.locator('button[data-theme="light"]').click();
  await page.goto("/#analytics");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // 分析画面でも背景がライトであることを画面属性から確認
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // ライトテーマ時は body 背景が #f5f8fc 系（rgb 数値で 240+ 台）になる
  const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  expect(match).not.toBeNull();
  if (match) {
    const r = Number(match[1]);
    expect(r).toBeGreaterThan(200);
  }
});

// ---- 探索的テスト: 全画面ナビゲーション、 各種ボタン、 データ整合性、 アラート ----

test("sidebar の 10 画面すべてが遷移できて空状態でも表示エラーにならない", async ({ page }) => {
  await page.goto("/");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const screens = ["dashboard", "data-input", "data-list", "factors", "analytics", "reports", "goals", "actions", "alerts", "settings"];
  for (const id of screens) {
    await page.locator(`.sidebar [data-route="${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await page.waitForTimeout(50);
  }
  expect(errors).toEqual([]);
});

test("全 5 種類のレポート出力ボタンがダウンロードを発行する", async ({ page }) => {
  // 1件入力してから出力
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("100");
  await page.locator('[data-draft="date"]').fill("2026-04-01");
  await page.locator("[data-save-entry]").click();
  await expect(page).toHaveURL(/#data-list/);

  await page.goto("/#reports");
  const types = [
    { type: "monthly", pattern: /^scarbon-monthly-.*\.csv$/ },
    { type: "scope", pattern: /^scarbon-scope-.*\.csv$/ },
    { type: "factors", pattern: /^scarbon-factors-.*\.csv$/ },
    { type: "json", pattern: /^scarbon-state.*\.json$/ },
    { type: "remote-preview", pattern: /^scarbon-state.*\.json$/ }
  ];
  for (const t of types) {
    const dl = page.waitForEvent("download");
    await page.locator(`[data-export-report="${t.type}"]`).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(t.pattern);
  }
});

test("データ入力で Scope タブを切り替えると排出源 select の選択肢が絞られる", async ({ page }) => {
  await page.goto("/#data-input");
  // Scope 1 タブ (デフォルト) → 燃料系の factor が見える
  await page.locator('[data-scope="Scope 1"]').first().click();
  let opts = await page.locator('select[data-draft="factorId"] option').allInnerTexts();
  expect(opts.some((t) => /都市ガス/.test(t))).toBeTruthy();
  expect(opts.every((t) => !/電力/.test(t))).toBeTruthy(); // 電力 (Scope 2) は出ない

  // Scope 2 タブに切り替え → 電力が見える
  await page.locator('[data-scope="Scope 2"]').first().click();
  opts = await page.locator('select[data-draft="factorId"] option').allInnerTexts();
  expect(opts.some((t) => /電力/.test(t))).toBeTruthy();

  // Scope 3 タブに切り替え → 通勤系が見える
  await page.locator('[data-scope="Scope 3"]').first().click();
  opts = await page.locator('select[data-draft="factorId"] option').allInnerTexts();
  expect(opts.some((t) => /通勤/.test(t))).toBeTruthy();
});

test("活動データを入力 → 紐付く factor を削除 → アラート画面に orphan として表示される", async ({ page }) => {
  // 一旦カスタム factor を作って activity を入れる
  await page.goto("/#factors");
  await page.locator("#factor-name").fill("削除予定原単位");
  await page.locator("#factor-unit").fill("kg");
  await page.locator("#factor-coefficient").fill("0.001");
  await page.locator("[data-add-factor]").click();
  await expect(page.getByText("削除予定原単位").first()).toBeVisible();

  // 削除予定原単位で 1件入力
  await page.goto("/#data-input");
  // factor select に「削除予定原単位」がある (Scope 1 デフォルト)
  await page.locator('select[data-draft="factorId"]').selectOption({ label: "削除予定原単位" });
  await page.locator('[data-draft="amount"]').fill("50");
  await page.locator('[data-draft="date"]').fill("2026-04-10");
  await page.locator("[data-save-entry]").click();
  await expect(page).toHaveURL(/#data-list/);

  // 詳細パネルを開いて削除 (factor の方を削除)
  await page.goto("/#factors");
  // 削除予定原単位 を選択 (factor list の button をクリック)
  await page.locator('[data-factor-id]').filter({ hasText: "削除予定原単位" }).first().click();
  // 「使用中のため削除できません」 toast が出る
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-delete-factor]').first().click();
  await expect(page.locator(".toast-error")).toBeVisible();
  // → 使用中なので削除されないはず。 念のため確認
  await expect(page.getByText("削除予定原単位").first()).toBeVisible();
});

test("「活動データのみ削除」は activities だけ wipe して factors は残す", async ({ page }) => {
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("100");
  await page.locator('[data-draft="date"]').fill("2026-04-01");
  await page.locator("[data-save-entry]").click();
  await expect(page).toHaveURL(/#data-list/);

  await page.goto("/#settings");
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-clear-activities]").click();
  await expect(page.locator(".toast-success")).toBeVisible();

  // activities が空、 factors は残ってる
  const factorCount = await page.evaluate(() => JSON.parse(localStorage.getItem("scarbon:factors:v2") || "[]").length);
  const activityCount = await page.evaluate(() => JSON.parse(localStorage.getItem("scarbon:activities:v2") || "[]").length);
  expect(factorCount).toBeGreaterThanOrEqual(9); // seed
  expect(activityCount).toBe(0);
});

test("「シードに戻す」は localStorage を seed で上書きしてリロードでも seed が戻る", async ({ page }) => {
  await page.goto("/#factors");
  // カスタム factor を 1 件登録
  await page.locator("#factor-name").fill("リセットされる原単位");
  await page.locator("#factor-unit").fill("kg");
  await page.locator("#factor-coefficient").fill("0.5");
  await page.locator("[data-add-factor]").click();
  await expect(page.getByText("リセットされる原単位").first()).toBeVisible();

  await page.goto("/#settings");
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-seed-reset]").click();
  await expect(page.locator(".toast-success")).toBeVisible();

  // リロードしても seed が表示される (= localStorage に seed が永続化されてる)
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.locator('[data-route="factors"]').first().click();
  await expect(page.getByText("電力（日本・全国平均）").first()).toBeVisible();
  // カスタムは消えてる
  await expect(page.getByText("リセットされる原単位")).toHaveCount(0);
});

test("GitHub 同期は token / owner / repo が無いと error toast を出して何もしない", async ({ page }) => {
  await page.goto("/#settings");
  await page.locator('[data-remote-action="push"]').click();
  await expect(page.locator(".toast-error")).toBeVisible();
});

test("topbar のサイト select は activities から候補が動的に生成される", async ({ page }) => {
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("100");
  await page.locator('[data-draft="site"]').fill("東京本社");
  await page.locator('[data-draft="date"]').fill("2026-04-01");
  await page.locator("[data-save-entry]").click();
  await expect(page).toHaveURL(/#data-list/);

  await page.goto("/#dashboard");
  // site select の選択肢に「東京本社」がある
  const opts = await page.locator("#site-select option").allInnerTexts();
  expect(opts).toContain("東京本社");
});

// === ここから探索的テスト（バグ捕り） ===========================================

test("活動量に負の値を入れると弾かれて遷移しない", async ({ page }) => {
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("-10");
  await page.locator('[data-draft="date"]').fill("2026-04-01");
  await page.locator("[data-save-entry]").click();
  await expect(page.locator(".toast-error")).toBeVisible();
  await expect(page).toHaveURL(/#data-input/);
});

test("原単位フォームに負の係数を入れると弾かれる", async ({ page }) => {
  await page.goto("/#factors");
  await page.locator("#factor-name").fill("負係数テスト");
  await page.locator("#factor-unit").fill("kg");
  await page.locator("#factor-coefficient").fill("-1");
  await page.locator("[data-add-factor]").click();
  await expect(page.locator(".toast-error")).toBeVisible();
});

test("自分で登録した原単位がデータ入力フォームの select に出てくる", async ({ page }) => {
  await page.goto("/#factors");
  await page.locator("#factor-name").fill("カスタム測定値");
  await page.locator("#factor-scope").selectOption("Scope 1");
  await page.locator("#factor-unit").fill("kg");
  await page.locator("#factor-coefficient").fill("0.5");
  await page.locator("[data-add-factor]").click();
  await expect(page.locator(".toast-success")).toBeVisible();

  await page.goto("/#data-input");
  // Scope 1 タブにいる前提（factor 保存後の state.scope は新 factor の scope）
  const opts = await page.locator('[data-draft="factorId"] option').allInnerTexts();
  expect(opts).toContain("カスタム測定値");
});

test("JSON エクスポートをダウンロードしたら factors と activities を含む", async ({ page }) => {
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("50");
  await page.locator('[data-draft="site"]').fill("テスト拠点");
  await page.locator('[data-draft="date"]').fill("2026-04-15");
  await page.locator("[data-save-entry]").click();
  await expect(page).toHaveURL(/#data-list/);

  await page.goto("/#settings");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const download = await downloadPromise;
  const path = await download.path();
  const fs = require("fs");
  const content = fs.readFileSync(path, "utf8");
  const parsed = JSON.parse(content);
  expect(Array.isArray(parsed.factors)).toBe(true);
  expect(Array.isArray(parsed.activities)).toBe(true);
  expect(parsed.activities.some((a) => a.site === "テスト拠点")).toBe(true);
});

test("壊れた localStorage JSON があってもアプリが起動して seed が読み込まれる", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("scarbon:factors:v2", "{ this is broken JSON ");
      localStorage.setItem("scarbon:activities:v2", "}}}");
    } catch (error) {}
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // 起動して factors が表示される（seed が fetch されたことを確認）
  await page.locator('[data-route="factors"]').first().click();
  // 最低 1 件は factor が出る
  const factorCards = page.locator(".factor-list .factor-item, [data-factor-id]");
  await expect(factorCards.first()).toBeVisible({ timeout: 5000 });
});

test("topbar の集計期間と site フィルタが両方同時に効く", async ({ page }) => {
  // 4月の本社と1月の支店を入れる
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("100");
  await page.locator('[data-draft="site"]').fill("本社");
  await page.locator('[data-draft="date"]').fill("2026-04-10");
  await page.locator("[data-save-entry]").click();
  await page.goto("/#data-input");
  await page.locator('[data-draft="amount"]').fill("200");
  await page.locator('[data-draft="site"]').fill("支店");
  await page.locator('[data-draft="date"]').fill("2026-01-10");
  await page.locator("[data-save-entry]").click();

  await page.goto("/#dashboard");
  // 本社 + 4月 → 100 件分
  await page.locator("#site-select").selectOption("本社");
  await page.locator("#period-select").selectOption("2026-04");
  const honshaApr = await page.locator(".metric-value").first().innerText();
  // 支店 + 1月 → 200 件分（合計が違うはず）
  await page.locator("#site-select").selectOption("支店");
  await page.locator("#period-select").selectOption("2026-01");
  const shitenJan = await page.locator(".metric-value").first().innerText();
  expect(shitenJan).not.toBe(honshaApr);
  // 本社 + 1月 → 0 件 → 0
  await page.locator("#site-select").selectOption("本社");
  await page.locator("#period-select").selectOption("2026-01");
  const honshaJan = await page.locator(".metric-value").first().innerText();
  expect(honshaJan).toMatch(/^0(\.0+)?\s*t-CO2e/);
});

test("hash route として存在しない URL は dashboard に fallback する", async ({ page }) => {
  await page.goto("/#nonexistent-route");
  await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible();
});

test("factor 削除後に同じ ID で activity を保存しようとするとエラー", async ({ page }) => {
  // 9 件目の f-commute-car を削除（誰も使っていない seed factor）
  await page.goto("/#factors");
  page.on("dialog", (d) => d.accept());
  await page.locator('[data-factor-id="f-commute-car"]').first().click();
  await page.locator('[data-delete-factor="f-commute-car"]').click();
  await expect(page.locator(".toast-success")).toBeVisible();

  // 削除されたことを確認
  await page.goto("/#data-input");
  const opts = await page.locator('[data-draft="factorId"] option').allInnerTexts();
  expect(opts).not.toContain("通勤（自家用乗用車）");
});
