# S&Carbon - Scope 1-3 算定ツール

GitHub Pages 上で動く、Scope 1・2・3 の温室効果ガス排出量算定ツール。原単位は外部データ連携を行わず、利用者が必要なものだけ手動登録します。データはブラウザの `localStorage` と GitHub リポジトリ内 JSON のどちらか／両方に保存できます。

- 静的ファイル（`index.html` / `styles.css` / `app.js`）のみで動作
- 外部 CDN 依存ゼロ、ビルドステップなし
- GitHub Contents API による任意保存（個人アクセストークンはブラウザ内のみ保持）
- スマホ／PC レスポンシブ、ライト／ダークテーマ
- **本番**: <https://sustainableand.com/scope1-3_calc_app/>（GitHub Pages のカスタムドメイン）

## 画面（10 画面、 全機能実装済み）

| 画面 | 内容 |
| --- | --- |
| ダッシュボード | 総排出量・Scope 別比率・最近の入力 |
| データ入力 | factor を選んで活動量を入力。 算定式と CO2e プレビューを即時表示 |
| データ一覧 | 活動データの一覧・削除 |
| 原単位管理 | 原単位 (factor) の CRUD・検索・カテゴリ絞り込み |
| 排出量分析 | サイト別・カテゴリ別の内訳 |
| レポート | 月次・Scope別・原単位マスタ・状態スナップショット・GitHub保存内容プレビュー（CSV / JSON） |
| 目標・進捗管理 | 削減目標を年度・Scope ごとに登録 → 実績との進捗バー表示 |
| 削減施策管理 | 検討中／実行中／完了の 3 列カンバン。 ワンクリック状態移動 |
| アラート管理 | 入力データの整合性検出（orphan factor 参照など） |
| 設定 | テーマ／GitHub 連携／PAT 管理／開発用リセット |

## ディレクトリ構成

```text
.
├── index.html
├── styles.css
├── app.js
├── data/
│   └── scarbon-state.json   # 配信される初期データ（factors の seed あり、 activities/goals/actions は空）
├── docs/
│   └── design-plan.md       # 設計ドキュメント
├── tests/
│   ├── app.spec.js          # Playwright E2E（40件）
│   ├── smoke.mjs            # XSS / 集計ロジック / 永続化の軽量チェック
│   └── dom-harness.mjs      # Node vm で全 renderer × バリエーション を検証
├── CNAME                    # カスタムドメイン (sustainableand.com)
└── README.md
```

## ローカルでの起動

依存ライブラリはありません。任意の静的サーバで `index.html` を配信してください。

```sh
python3 -m http.server 8000
# http://localhost:8000 を開く
```

検証コマンド:

```sh
# 構文チェック（依存ゼロ）
node --check app.js
xmllint --html --noout index.html
python3 -m json.tool data/scarbon-state.json > /dev/null

# 軽量スモークテスト（依存ゼロ）
npm run test:smoke

# DOM ハーネス（Node の vm モジュールで全画面描画を静的検証）
npm run test:dom

# Playwright による E2E
npm install
npm test
```

`npm test` は `playwright.config.js` の指定で `python3 -m http.server 8001` を一時起動して動作します（別途サーバ起動は不要）。
ブラウザはシステムにインストール済みの **Google Chrome**（`channel: "chrome"`）を直接使う設定なので、`npx playwright install` は不要です。Chrome が無い環境では `npm run test:install` で Playwright バンドルの Chromium をインストールしてから `playwright.config.js` の `channel` 行を外してください。

## データの優先順位

起動時のロード順は次のとおりです。

1. `localStorage` に過去の編集データがある → そのデータを使う
   - 旧 `*:v1` キー → `*:v2` キーへ自動移行（バックアップ作成と verify 付き）
2. なければ `data/scarbon-state.json` を `fetch()` する
3. それも失敗したら空状態で起動

GitHub からの読み込み・保存は設定画面のボタンから明示的に実行します（自動同期はしません）。

### localStorage に保存されるデータ

| キー | 内容 |
| --- | --- |
| `scarbon:factors:v2` | 原単位マスタ |
| `scarbon:activities:v2` | 活動データ |
| `scarbon:goals:v1` | 削減目標 |
| `scarbon:actions:v1` | 削減施策 |
| `scarbon:settings:v2` | テーマ／topbar フィルタ／GitHub 接続情報 |
| `scarbon:remote:v2` | 直近の sha と同期時刻 |
| `scarbon:token:v1` | GitHub PAT（**コミットされない、 エクスポートされない**） |

### ローカルデータのリセット

設定画面 → 開発用 に 2 つのボタンがあります。

- **活動データのみ削除**: activities だけを空にします。 factors / goals / actions / 設定は残ります。
- **シードに戻す**: factors / activities の localStorage キーを削除し、 `data/scarbon-state.json` のシードから再ロードします。 `goals` / `actions` / 設定 / トークンは残ります。 atomic な setItem + verify + rollback で、 保存失敗時もユーザーデータは保持されます。

トークンは別ボタンで削除できます。

## GitHub Pages へのデプロイ

このリポジトリは <https://github.com/take-sustainableand/scope1-3_calc_app> をホストとして利用しています。

1. GitHub のリポジトリ画面で **Settings → Pages** を開く
2. **Source** を `Deploy from a branch` に設定
3. **Branch** を `main` の `/ (root)` に設定して保存
4. **Custom domain** に `sustainableand.com` を入力。リポジトリ直下の `CNAME` ファイルに同じ値を記載しておくと、再デプロイでも設定が失われません
5. 数十秒〜数分後に <https://sustainableand.com/scope1-3_calc_app/> が公開される

サブパス配信（`/scope1-3_calc_app/`）でも CSS / JS は相対パスで動作します。`index.html` には Cache-Control / Pragma / Expires の no-cache メタタグと、 `app.js` `styles.css` への `?v=YYYYMMDD` クエリ（cache buster）を付けているので、 デプロイ後はリロード一発で最新が反映されます。

## GitHub Contents API による保存

設定画面（`#settings`）から、ブラウザ内のデータを GitHub リポジトリの JSON ファイルへ保存できます。 この保存は `factors` / `activities` / `goals` / `actions` すべてを 1 ファイル (`data/scarbon-state.json`) に書き出します。

### Personal Access Token の作成

Fine-grained personal access token を強く推奨します。

直接リンク: <https://github.com/settings/personal-access-tokens/new>

1. **Token name**: 何でも可（例 `scarbon-app`）
2. **Resource owner**: `take-sustainableand`
3. **Repository access**: **Only select repositories** → `scope1-3_calc_app` を選択
4. **Repository permissions → Contents**: **Read and write**
5. **Generate token** をクリックして表示された `github_pat_xxx...` をコピー
6. アプリの設定画面 → 「GitHub Personal Access Token」 に貼り付けて **保存**

トークンは表示画面を閉じると 2 度と表示できないので、 その場でアプリに貼ること。 もし漏洩したら <https://github.com/settings/tokens> で **Revoke** で即無効化できます。

### アプリ側の設定（プリセット済み）

| 項目 | デフォルト値 |
| --- | --- |
| GitHub owner | `take-sustainableand` |
| GitHub repo | `scope1-3_calc_app` |
| ブランチ | `main` |
| データ保存パス | `data/scarbon-state.json` |
| トークン | （手動で貼り付け） |

owner / repo / ブランチ / パスは defaultSettings からプリセットされるため、 通常はトークンだけ入れれば動きます。 既存ユーザーが旧版で空文字を保存していた場合も `normalizeSettings` が起動時に default で埋め戻します。

トークンは `localStorage` の `scarbon:token:v1` にのみ保存され、リポジトリへはコミットされません。 JSON エクスポートにも含まれません。

### 操作

- **GitHubから取得 (pull)**: リモートの JSON を読み込み、ローカル状態を上書き。`sha` を保持。 `factors` / `activities` / `goals` / `actions` のうち、 payload に存在するキーだけが上書きされます（v1 schema との後方互換）。
- **GitHubに保存 (push)**: 現在の状態を JSON 化（base64）して `PUT`。直前に取得した `sha` と差異があれば、上書き確認のダイアログを出します。
- **履歴を表示**: 当該ファイルの直近20件のコミットを表示し、任意リビジョンへ復元できます。

## レポート出力

`#reports` 画面から次を出力できます（BOM 付き UTF-8 CSV / JSON）。

- 月次排出量サマリー（月 × Scope）
- Scope別明細（活動データ全件）
- 原単位マスタ
- 状態スナップショット（factors / activities / goals / actions の完全 JSON、 `schemaVersion: 2`）
- GitHub保存内容プレビュー

## セキュリティ上の注意

- 個人アクセストークン・APIキー・認証情報をリポジトリへ絶対にコミットしない
- 公開リポジトリへ保存する場合、請求書番号・個人名・取引先の機微情報は登録しない
- アプリが通信する外部エンドポイントは `https://api.github.com/` のみ
- 証憑ファイル本体は本実装の対象外（メモ欄に参照名を記載するだけ）
- フォーム input には `id` `name` `autocomplete="off"`（PAT は `autocomplete="new-password"`）を付与してパスワードマネージャーの autofill 干渉を抑制

詳細は `docs/design-plan.md` §5 を参照。

## 算定式

```text
排出量（t-CO2e）= 活動量 × 原単位係数
```

集計は同じ計算結果から派生するため、ダッシュボード・一覧・分析・レポートで値が一致します。

## ライセンス

個人利用前提。ライセンスは未指定です。
