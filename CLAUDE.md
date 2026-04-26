# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

GitHub Pages 上で個人利用する Scope 1・2・3 の温室効果ガス排出量算定ツール「S&Carbon」。原単位は外部データ連携を行わず、利用者が手動登録する方針。詳細な仕様・フェーズ計画は `docs/design-plan.md` を参照する。

## 構成と前提

- 依存ライブラリゼロのバニラ HTML / CSS / JS で構成。ビルドステップ・パッケージマネージャ・テストランナーは存在しない。
- ファイルは `index.html` / `styles.css` / `app.js` の3点のみ（プラス `docs/` `image/` `logs/`）。`index.html` は `app.js` を `defer` でロードし、`#app` に SPA を描画する。
- このリポジトリは git 管理されていない（`.git` なし）。`git status` / `git diff` などは使えないので、変更追跡はファイル単位で確認すること。

## よく使うコマンド

ビルド・テスト・lint コマンドはない。検証は以下を使う:

```sh
# JS の構文チェック
node --check app.js

# HTML の構文チェック（macOS 標準の xmllint）
xmllint --html --noout index.html

# ローカルでブラウザ確認するときは静的サーバを立てる
python3 -m http.server 8000
# → http://localhost:8000 にアクセス
```

GitHub Pages は静的配信のみで動作するため、サーバ側処理は前提にしないこと。

## アーキテクチャ要点

`app.js` は単一ファイルで以下を内包する。複数ファイルを読まないと辿れない構造ではないが、責務の境界だけ把握しておくと早い。

- **状態管理**: トップレベルに `state`（route, scope, draft, settings 等）と `factors` / `activities` のグローバル変数を保持。`localStorage` の `STORAGE_KEYS`（`scarbon:factors:v1` 等）から復元し、無ければ `seedFactors` / `seedActivities` をフォールバックに使う。
- **ルーティング**: `location.hash` ベースの SPA。`screens` 配列で全10画面を定義し、`renderScreen()` がルートに対応する `renderXxx()` を呼ぶ。`hashchange` イベントで再描画。
- **イベントハンドリング**: `document` レベルで `click` / `input` / `change` を1つずつ委譲。各ハンドラは `data-*` 属性（`data-route`, `data-scope`, `data-draft`, `data-setting`, `data-save-entry` など）でディスパッチする。新しい操作を追加するときは「`data-*` 属性 → ハンドラ分岐」のパターンを踏襲する。
- **描画**: 全画面が `innerHTML` への文字列代入で構築される。`render()` を呼ぶたびに `#app` 全体を作り直すため、フォーカスや一時的な DOM 状態は保持されない。入力中の値は `state.draft` / `state.settings` 経由で保持する。
- **算定ロジック**: 排出量は常に `amount × coefficient`（`calcEmission()`）。Scope別合計は `getScopeTotals()`、入力中プレビューは `calcDraft()` / `updateCalcPreview()` を使う。同じデータからダッシュボード・一覧・分析の値が一致することを設計上保証している。
- **永続化**: `persist()` が factors と activities を、`persistSettings()` が settings を `localStorage` に書き込む。`exportState()` は3つを束ねた JSON を Blob でダウンロードさせる。

## データモデル

`docs/design-plan.md` の §3 が正本。`EmissionFactor` / `ActivityRecord` / `AppSettings` の3種類で、`ActivityRecord.factorId` が `EmissionFactor.id` を参照する単純な関係。シード値は `app.js` 冒頭の `seedFactors` / `seedActivities` を見れば全形式が確認できる。

## フェーズと未実装範囲

現状は Phase 1（localStorage + JSON 出力）まで完了。以下は未実装で、設計のみ存在する:

- Phase 2: `data/scarbon-state.json` のフェッチ読み込み
- Phase 3: GitHub Contents API による `PUT` 保存（`sha` 取得 → base64 化）
- Phase 4: 競合検知、履歴、CSV 出力

GitHub Pages 配信を前提とし、外部 API は GitHub Contents API のみが将来追加される。**Personal Access Token はコード・リポジトリに絶対保存しない**（設計書 §5）。token 入力欄は設定画面に置き、ブラウザ内ストレージのみに保持する設計。

## ログ運用

`logs/{YYYY-MM-DD}_{topic}.md` に作業ログを残すのがプロジェクト規約（グローバル CLAUDE.md 由来）。過去ログは `logs/2026-04-26_scope1-3-ui-design.md` に初期実装の経緯がある。同じ対象を再度触るときは関連ログを先に読むこと。
