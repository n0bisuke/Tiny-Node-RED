# 作業ログ (Edge Node-RED Subset UI)

## 2025-09-20
- 公式エディタ資産（@node-red/editor-client）を取り込んだが、初期表示で `monaco` が未定義になりロード停止。
  - Service Worker の `/ui/api/settings` レスポンスで `codeEditor.lib` を `ace` に切り替えて解消。
- Inject/Debug ノード読込が `Loading Nodes 1/2` で停止。
  - Service Worker に `red/keymap.json`、`debug/view/*`、`red/images/*` 等の静的パスを追加し、公式UIが必要とするファイルを返却。
  - デバッグビュー用アセットを `ui/debug/view/` に配置し、404 を解消。
- `debug` ノード用 API の擬似実装が例外で停止 (`path.slice('...__len__')`)。
  - 重複した古いルートを削除し、`substring` で安全に処理。
- トピック購読 (`notification/#`) が正規表現例外で失敗。
  - `edge-boot.js` にワイルドカード対応の `createTopicMatcher` を導入し、例外時はフォールバックするよう修正。
- `arrow-in.svg` などアイコンや Mermaid 資産の 404 が続出。
  - Service Worker で `red/images/*`/`icons/node-red/*` をローカル資産にフォールバック。
  - Mermaid を利用しない設定を返し、`/vendor/mermaid/*` にはスタブJSを返却。
- Deploy 実行時に Debug パネルへイベントが届かない。
  - `broadcastComms` がクライアント管理セットと矛盾していたため、未登録時でもブロードキャストするよう調整。

### 現状
- ブラウザ上で公式エディタが起動し、Inject/Debug ノードの編集・実行が可能。
- Service Worker 内部でフロー保存（`POST /ui/api/flows`）が完了するが、Edge Workers 側の `/deploy` 連携は未実装のため今後対応が必要。

## 2025-09-21
- mini-node-redでNode-REDのUI見た目を維持したEdge対応サブセットの統合作業を完了
  - ui/ディレクトリの内容をmini-node-red/public/に統合
  - vendor、locales、nodes、debugディレクトリをコピー
  - CSS、JS、SVGファイルをコピー
  - mini-node-red/public/index.htmlとui/index.htmlを作成
- Service WorkerのUI APIエンドポイントをCloudflare Worker側に統合実装
  - /ui/api/settingsでエディタ設定を返却
  - /ui/api/flowsでフロー取得・更新に対応
  - /ui/api/nodesでノード一覧とHTMLを返却
  - 認証、ロケール、静的アセット配信に対応
- Deploy/Debug操作をCloudflare Worker側と接続
  - handleDeploy関数をNode-REDフロー形式に対応
  - フロー形式の変換処理を追加（Node-RED → mini-node-red）
  - tabノードのフィルタリングとhttp-inノードのルート生成を実装

### 現状
- mini-node-redプロジェクトで本家Node-REDのUI見た目を維持したままEdge対応が完了
- Cloudflare Worker環境でNode-REDエディタが動作し、Deploy/Debug操作が統合
- Service Workerに依存しない形でUIとランタイムが連携

## 2025-09-21 (続き)
- Node-REDエディタの完全動作化を達成
  - vendor.js、red.min.js、style.min.cssの404エラーを修正
  - UIパス(/ui/*)での静的アセット配信を修正
  - localesファイルとdebug/viewファイルの配置
  - プラグイン、ノード、テーマ関連APIエンドポイントの実装
  - ノード読み込みタイムアウト問題の解決
  - inject/debugノードの完全動作

### 最終状態
- ✅ **フル機能のNode-REDエディタ**: パレット、ワークスペース、プロパティパネル、デバッグパネルが表示
- ✅ **ノード操作**: inject/debugノードのドラッグ&ドロップ、編集、接続が可能
- ✅ **Edge対応**: Cloudflare Worker環境でネイティブ動作
- ✅ **本家Node-RED互換**: UIの見た目と操作感を完全に維持
