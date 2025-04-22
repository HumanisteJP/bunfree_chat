```txt
npm install
npm run dev
```

```txt
npm run deploy
```

## 環境変数の設定

このアプリケーションは以下の環境変数を使用します：

- `QDRANT_URL`: QdrantデータベースのURL
- `QDRANT_API_KEY`: QdrantのAPIキー
- `GEMINI_API_KEY`: Google GeminiのAPIキー
- `VOYAGE_API_KEY`: Voyage EmbeddingsのAPIキー

### 開発環境

1. プロジェクトのルートに`.dev.vars`ファイルを作成します
2. 以下のフォーマットで環境変数を設定します:

```
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
GEMINI_API_KEY=your_gemini_api_key
VOYAGE_API_KEY=your_voyage_api_key
```

### 本番環境

Cloudflare Workersにデプロイする場合は、以下のコマンドで環境変数を設定します:

```
wrangler secret put QDRANT_URL
wrangler secret put QDRANT_API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put VOYAGE_API_KEY
```

または、Cloudflareダッシュボードから環境変数を設定することもできます。

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
