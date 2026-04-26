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
  // v2 にもコピーされていない
  const v2 = await page.evaluate(() => localStorage.getItem("scarbon:factors:v2"));
  expect(v2 === null || !v2.includes("保護対象データ")).toBeTruthy();
  // バックアップキーも未保存
  const backup = await page.evaluate(() => localStorage.getItem("scarbon:legacy-backup:v1"));
  expect(backup).toBeNull();
  // ユーザーにエラートーストが出る
  await expect(page.locator(".toast-error")).toBeVisible();
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
  await expect(page.getByText("電力（日本・全国平均）")).toBeVisible();
  await expect(page.getByText("都市ガス（13A）")).toBeVisible();
  await expect(page.getByText("通勤（鉄道）")).toBeVisible();
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
  await expect(page.getByText("自宅")).toBeVisible();
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
  await page.locator('[data-theme="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator('[data-theme="light"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator('[data-theme="system"]').click();
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
  await page.locator('[data-theme="light"]').click();
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
