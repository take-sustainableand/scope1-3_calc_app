# S&Carbon - Scope 1-3 算定ツール

GitHub Pages 上で動く、Scope 1・2・3 の温室効果ガス排出量算定ツールのプロトタイプです。原単位は外部データ連携を行わず、利用者が必要なものだけ手動登録します。データはブラウザの `localStorage` と GitHub リポジトリ内 JSON のどちらか／両方に保存できます。

- 静的ファイル（`index.html` / `styles.css` / `app.js`）のみで動作
- 外部 CDN 依存ゼロ、ビルドステップなし
- GitHub Contents API による任意保存（個人アクセストークンはブラウザ内のみ保持）
- スマホ／PC レスポンシブ、ライト／ダークテーマ

## ディレクトリ構成

```text
.
├── index.html
├── styles.css
├── app.js
├── data/
│   └── scarbon-state.json   # 配信される初期データ（factors / activities）
├── docs/
│   └── design-plan.md       # 設計ドキュメント・実装Plan
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
node --check app.js
xmllint --html --noout index.html
python3 -m json.tool data/scarbon-state.json > /dev/null
```

## データの優先順位

起動時のロード順は次のとおりです。最初にヒットしたものを採用します。

1. `localStorage` に過去の編集データがある → そのデータを使う
2. なければ `data/scarbon-state.json` を `fetch()` する
3. それも失敗したら、コード内のシードデータを使う

GitHub からの読み込み・保存は設定画面のボタンから明示的に実行します（自動同期はしません）。

## GitHub Pages へのデプロイ

このリポジトリは <https://github.com/take-sustainableand/scope1-3_calc_app> をホストとして利用する想定です。

1. GitHub のリポジトリ画面で **Settings → Pages** を開く
2. **Source** を `Deploy from a branch` に設定
3. **Branch** を `main` の `/ (root)` に設定して保存
4. 数十秒〜数分後に `https://take-sustainableand.github.io/scope1-3_calc_app/` が公開される

サブパス配信（`/scope1-3_calc_app/`）でも CSS / JS は相対パスで動作します。

## GitHub Contents API による保存

設定画面（`#settings`）から、ブラウザ内のデータを GitHub リポジトリの JSON ファイルへ保存できます。

### Personal Access Token の作成

Fine-grained personal access token を強く推奨します。

1. GitHub の **Settings → Developer settings → Personal access tokens → Fine-grained tokens** を開く
2. **Repository access** を保存先リポジトリのみに限定
3. **Permissions → Repository permissions → Contents** を **Read and write** に設定
4. 期限を短めに設定し、生成されたトークンをコピー

### アプリ側の設定

設定画面で次を入力します。

| 項目 | 値の例 |
| --- | --- |
| GitHub owner | `take-sustainableand` |
| GitHub repo | `scope1-3_calc_app` |
| ブランチ | `main` |
| データ保存パス | `data/scarbon-state.json` |
| トークン | （上で作成したPAT） |

トークンは `localStorage` の `scarbon:token:v1` にのみ保存され、リポジトリへはコミットされません。

### 操作

- **GitHubから取得**: リモートの JSON を読み込み、ローカル状態を上書きします。`sha` を保持します。
- **GitHubに保存**: 現在の状態を JSON 化（base64）して `PUT` します。直前に取得した `sha` と差異があれば、上書き確認のダイアログを出します。
- **履歴を表示**: 当該ファイルの直近20件のコミットを表示し、任意リビジョンへの復元ができます。

## レポート出力

`#reports` 画面から次を出力できます（BOM 付き UTF-8 CSV）。

- 月次排出量サマリー（月 × Scope）
- Scope別明細（活動データ全件）
- 原単位マスタ
- 状態スナップショット（factors / activities の完全 JSON）
- GitHub保存内容プレビュー

## セキュリティ上の注意

- 個人アクセストークン・APIキー・認証情報をリポジトリへ絶対にコミットしない
- 公開リポジトリへ保存する場合、請求書番号・個人名・取引先の機微情報は登録しない
- アプリが通信する外部エンドポイントは `https://api.github.com/` のみ
- 証憑ファイル本体は本実装の対象外（メモ欄に参照名を記載するだけ）

詳細は `docs/design-plan.md` §5 を参照してください。

## 算定式

```text
排出量（t-CO2e）= 活動量 × 原単位係数
```

集計は同じ計算結果から派生するため、ダッシュボード・一覧・分析・レポートで値が一致します。

## ライセンス

個人利用前提のプロトタイプ。ライセンスは未指定です。
