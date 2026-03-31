# AGENTS.md — Edge Node-RED Subset (Minimal Plan)

本リポジトリは「**UI=ブラウザ（WASM+Service Worker）／実行=Cloudflare Workers**」で動く **Node-REDサブセット**を実装する。  
初期ロードマップは **Inject & Debug → Function → HTTP** の順で再現する。

---

## グローバルルール

- 必ず英語で思考し、日本語で出力すること
- npx serveやnpx node-redなどサーバー待受するようなコマンドは禁止

## 1) Mission / Non-Goals

### Mission
- Node-REDの体験（Inject → Debug → Function → HTTP）を **Edge原生** で最小構成から再現。  
- UIは**ブラウザ**で動作（SWが仮想エンドポイントを仲介、Wasmで処理を隔離）。 [oai_citation:1‡MDNウェブドキュメント](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event?utm_source=chatgpt.com)  
- デプロイは**Cloudflare Workers**（`fetch()`ハンドラ、KVにフロー保存、wranglerで構築）。 [oai_citation:2‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/?utm_source=chatgpt.com)

### Non-Goals（v0.1）
- 既存Node-REDの完全互換やnpmノードの網羅。  
- 並列・スプリット・長時間ジョブ。  
- 大規模ML常駐（必要なら別ワーカーに委譲）。

---

## 2) スコープ（段階実装）

### Phase 1 — **Inject / Debug**
- **Injectノード**: 手動トリガ/一定間隔などで `msg.payload` を生成。Node-REDの基本概念に準拠（ただし最小）。 [oai_citation:3‡nodered.org](https://nodered.org/docs/user-guide/nodes?utm_source=chatgpt.com)  
- **Debugノード**: `msg.payload` をUIのデバッグパネルに表示（時刻/ノードID付き）。 [oai_citation:4‡nodered.org](https://nodered.org/docs/user-guide/nodes?utm_source=chatgpt.com)  
- **UI実装ポイント**  
  - **Service Worker** が `/ui/api/*` をインターセプトし、フロー実行（ブラウザ内）とパネル表示を仲介。 [oai_citation:5‡MDNウェブドキュメント](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event?utm_source=chatgpt.com)  
  - **Wasm** ローダで「安全・高速」な処理スロットを確保（`instantiateStreaming`の基本形）。 [oai_citation:6‡MDNウェブドキュメント](https://developer.mozilla.org/ja/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static?utm_source=chatgpt.com)

#### Phase 1 フォローアップ計画
- Deploy ボタンを動作させるため、`/ui/api/settings` で匿名ユーザーに `deploy.write` 権限を付与し、`/auth/login` 系エンドポイントはスタブ応答で済ませる。
- `RED.runtime.init()` で必要となる通知イベントを Service Worker から擬似送信し、未実装部分は安全にスキップできるようにする。
- `POST /ui/api/flows` に加え、将来の Workers 連携を見据えた `/ui/api/deploy` スタブを用意し、デプロイ完了イベント (`notification/runtime-deploy`) を UI に返す。

### Phase 2 — **Function**
- **Functionノード（fn:js）**: `return msg;` を基本とする同期JS処理。Node-REDの関数ノードの“書き方”に沿うが、**同期・副作用なし**に制限。 [oai_citation:7‡nodered.org](https://nodered.org/docs/user-guide/writing-functions?utm_source=chatgpt.com)  
- **Wasm実行（任意）**: `process(ArrayBuffer) -> ArrayBuffer` の極小ABIで、バイナリ処理用スロットを追加（UI側は .wasm を選択して紐付け）。

#### Phase 2 実装方針
- `@node-red/nodes/core/function` の UI/ヘルプ資産を最小構成で取り込み、Ace エディタを既存のまま利用する。
- Service Worker に関数ノード実行エンジンを実装（同期処理限定、`context/flow/global` は簡易 Map で代替）。
- UI には Edge Subset の制約（同期処理のみ、外部モジュール不可）を明記し、警告トーストのカスタム文言を追加する。

### Phase 3 — **HTTP（ミニマムサーバ機能）**
- **http-in / http-out** を Workers で再現：`ANY /api/*` を **fetchハンドラ**で受け、フローにルーティング → レスポンスを返す。 [oai_citation:8‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/?utm_source=chatgpt.com)  
- **KV** へ `/deploy` で保存した「アクティブなフロー」を即反映（ホットデプロイ）。 [oai_citation:9‡Cloudflare Docs](https://developers.cloudflare.com/kv/?utm_source=chatgpt.com)  
- （必要に応じて）**node:http互換レイヤ**を検討できるが、本サブセットではまず Workers 流のHTTPモデルを採用。 [oai_citation:10‡The Cloudflare Blog](https://blog.cloudflare.com/ja-jp/bringing-node-js-http-servers-to-cloudflare-workers/?utm_source=chatgpt.com)

#### Phase 3 実装方針
- ブラウザ UI では HTTP ノード (`http in/out`) のフォームを読み込みつつ、Service Worker 上で Cloudflare Workers 風のリクエスト/レスポンスフローを模倣する。
- Cloudflare Workers プロジェクトを追加し、`PUT /deploy` → KV 保存 → `fetch /api/*` のパスを整える。
- ブラウザ UI のデプロイボタンから Workers 側 `/deploy` を呼び出し、成功時に Flow を即反映させるホットデプロイを目指す。

---

## 3) 仕様（v0.1 サブセット）

### Flow JSON（最小例）
```json
{
  "id": "flow-id",
  "version": "0.1",
  "routes": [{ "path": "/api/echo", "entry": "n1" }],
  "nodes": [
    { "id": "n0", "type": "inject", "wires": [["n1"]], "config": { "payload": {"hello":"world"} } },
    { "id": "n1", "type": "debug",  "wires": [[]],     "config": { "target": "payload" } }
  ]
}
```

#### 共通
- **直列・同期**の単純ワイヤのみ（`wires` は配列の配列だが出力1本想定）。  
- `msg` は `{ id, headers, query, params, text, payload, context:{}, meta:{ts} }` の薄型。  
- ノードタイプ: `inject` / `debug` / `fn:js` / `fn:wasm` / `http-in` / `http-out`（段階解放）。

---

## 4) 役割分担

### UI（ブラウザ；Wasm + Service Worker）
- **SW**: `/ui/api/*` を捕捉 → Inject/Functionなどをブラウザ内で実行 → Debugパネルへ送出。 [oai_citation:11‡MDNウェブドキュメント](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event?utm_source=chatgpt.com)  
- **Wasm**: 計算スロットの提供（`instantiateStreaming`で読み込み、MIMEは `application/wasm` 必須）。 [oai_citation:12‡MDNウェブドキュメント](https://developer.mozilla.org/ja/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static?utm_source=chatgpt.com)  
- **状態**: 開発時は IndexedDB/OPFS、実運用ではWorkers側へデプロイして走らせる。

### 実行（Cloudflare Workers）
- **fetch**: `/deploy`（Flow保存）、`/api/*`（実行）、`/healthz`（監視）。 [oai_citation:13‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/?utm_source=chatgpt.com)  
- **KV**: `KV_FLOWS` に `active` を保存／取得（即時反映）。 [oai_citation:14‡Cloudflare Docs](https://developers.cloudflare.com/kv/?utm_source=chatgpt.com)  
- **Wrangler**: init/build/deploy。環境毎設定は `wrangler.toml` の `env` 機能を用いる。 [oai_citation:15‡Cloudflare Docs](https://developers.cloudflare.com/workers/wrangler/?utm_source=chatgpt.com)

---

## 5) 受け入れ基準（各フェーズ）

### Phase 1（Inject/Debug）
- Injectクリックで `msg.payload` が生成され、**Debugパネルに即表示**。  
- 連打や負荷時もUIが固まらない（SW経由の非同期メッセージングで処理）。  
- p50 < 100ms（ブラウザ内）。Node-REDの導入チュートリアルと同等の体験が再現できること。 [oai_citation:16‡nodered.jp](https://nodered.jp/docs/tutorials/first-flow?utm_source=chatgpt.com)

### Phase 2（Function）
- `fn:js` に `return msg;` の最小コードで通る。**同期のみ**・ネットワーク/Timer禁止。 [oai_citation:17‡nodered.org](https://nodered.org/docs/user-guide/writing-functions?utm_source=chatgpt.com)  
- `msg.payload` の型（text/json/binary）を保ち、Debugで確認できる。

### Phase 3（HTTP）
- `/deploy` でFlowをアップ → `/api/echo` に `POST` すると**Flowに沿って処理→レスポンス**。  
- KVの更新が即反映（新リクエストから有効）。 [oai_citation:18‡Cloudflare Docs](https://developers.cloudflare.com/kv/?utm_source=chatgpt.com)  
- p95 < 500ms（一般ワークロード目安）。無料枠のCPU制限を超えない実装。 [oai_citation:19‡Zenn](https://zenn.dev/catnose99/articles/d1d16e11e7c6d0?utm_source=chatgpt.com)

---

## 6) タスク（AGENTS向け・順番厳守）

1. **Flow Schema**: `schema/flow-0.1.json` を定義（routes/nodes/各configの基本型）。  
2. **UI Core**:  
   - SWで`/ui/api/*`をインターセプト（fetchイベント）。  
   - Debugパネルの最小UI（ノードID・時刻・一部msg表示）。 [oai_citation:20‡MDNウェブドキュメント](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event?utm_source=chatgpt.com)  
   - Wasmローダ（`instantiateStreaming`）。`.wasm`のMIME注意。 [oai_citation:21‡MDNウェブドキュメント](https://developer.mozilla.org/ja/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static?utm_source=chatgpt.com)
3. **Inject/Debug ノード（ブラウザ内）**:  
   - Inject: 手動ボタン・固定ペイロード・（任意で）interval。  
   - Debug: パネルへpostMessage。Node-REDの挙動に準ず。 [oai_citation:22‡nodered.org](https://nodered.org/docs/user-guide/nodes?utm_source=chatgpt.com)
4. **Workers ルータ**:  
   - `PUT /deploy` → `KV_FLOWS.put('active', json)`（スキーマ検証）。  
   - `ANY /api/*` → Flow解釈→直列実行→Response。 [oai_citation:23‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/?utm_source=chatgpt.com)
5. **Function ノード（fn:js）**:  
   - 同期・副作用無しサンドボックス（`return msg`必須）。Node-RED Functionの基本規約に沿う。 [oai_citation:24‡nodered.org](https://nodered.org/docs/user-guide/writing-functions?utm_source=chatgpt.com)
6. **HTTP ノード（Workers側）**:  
   - `http-in`: メソッド/クエリ/パスパラ/ボディを `msg` に正規化。  
   - `http-out`: `status/headers/body` をResponseに反映。**Workersの`fetch`モデル**で実装。 [oai_citation:25‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/?utm_source=chatgpt.com)
7. **CLI/Deploy**: wranglerの`dev/publish`フローと環境分離の手順をREADMEに記載。 [oai_citation:26‡Cloudflare Docs](https://developers.cloudflare.com/workers/wrangler/?utm_source=chatgpt.com)
8. **Deploy UX 強化**: 匿名ユーザーに `deploy.write` 権限を与える設定レスポンスと `/ui/api/deploy` スタブを追加し、Deploy ボタンのUI連携を確認する。
9. **Function ノード導入**: Function ノードのUI/実行環境をブラウザ内に実装し、同期処理のみ許容する制限を設ける。
10. **HTTP ノード/Workers 連携**: HTTP ノードのフォームと実行パイプラインを整備し、Cloudflare Workers 側 `/deploy` `/api/*` ルートへ接続する。
11. **ドキュメント & テスト**: README/PROGRESS.md に開発手順と制約を追記し、簡易E2Eテスト（Inject→Debug確認）を自動化する。

---

## 7) リスク & 回避
- **CSPでWasmブロック** → `application/wasm` のMIME/`script-src` を正しく設定。 [oai_citation:27‡MDNウェブドキュメント](https://developer.mozilla.org/ja/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static?utm_source=chatgpt.com)  
- **無料枠のCPU超過** → Functionの同期・短時間遵守。重処理はWasm or 別ワーカーへ。 [oai_citation:28‡Zenn](https://zenn.dev/catnose99/articles/d1d16e11e7c6d0?utm_source=chatgpt.com)  
- **KV eventual consistency** → 設定は読み多め（Flow）に限定。強整合が要る場合はDOを段階導入。 [oai_citation:29‡Cloudflare Docs](https://developers.cloudflare.com/kv/?utm_source=chatgpt.com)

---

## 8) 参考リンク
- Workers `fetch()` ハンドラ（HTTP入口/出口）  [oai_citation:30‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/?utm_source=chatgpt.com)  
- Wrangler（開発/デプロイ）  [oai_citation:31‡Cloudflare Docs](https://developers.cloudflare.com/workers/wrangler/?utm_source=chatgpt.com)  
- Workers KV（低レイテンシKVS）  [oai_citation:32‡Cloudflare Docs](https://developers.cloudflare.com/kv/?utm_source=chatgpt.com)  
- Service Worker の `fetch` イベント（リクエスト介入）  [oai_citation:33‡MDNウェブドキュメント](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event?utm_source=chatgpt.com)  
- WebAssembly `instantiateStreaming`（最適ロード）  [oai_citation:34‡MDNウェブドキュメント](https://developer.mozilla.org/ja/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static?utm_source=chatgpt.com)  
- Node-RED Inject/Debug 概要（挙動の参照元）  [oai_citation:35‡nodered.org](https://nodered.org/docs/user-guide/nodes?utm_source=chatgpt.com)  
- Functionノードの基本（`return msg`）  [oai_citation:36‡nodered.org](https://nodered.org/docs/user-guide/writing-functions?utm_source=chatgpt.com)