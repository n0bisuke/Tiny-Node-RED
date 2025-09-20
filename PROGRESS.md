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
