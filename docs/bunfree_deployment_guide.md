# CloudRun と Firebase Hosting へのデプロイ手順書

## 概要

本ガイドは、CloudflareからGCPへの移行として、Hono.jsで構築されたAPIをCloud Runに、ViteとReactで開発された静的ウェブサイトをFirebase Hostingにデプロイする手順を説明します。

## 前提条件

- Google Cloudアカウントがすでに作成されている
- GCPプロジェクトが作成済み、課金が有効化されている
- Google Cloud CLI (`gcloud`)がインストール済み
- Node.js 18以上がインストール済み
- FirebaseのCLI (`firebase-tools`)がインストール済み
- Gitがインストール済み

## 1. GCPプロジェクトのセットアップ

### 1.1 必要なAPIの有効化

```bash
# Google Cloud CLIにログイン
gcloud auth login

# プロジェクトの設定
gcloud config set project YOUR_PROJECT_ID

# 必要なAPIを有効化
gcloud services enable run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com
```

### 1.2 サービスアカウントの権限設定

```bash
# Cloud BuildがCloud Runにデプロイするための権限を付与
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member=serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com \
    --role=roles/run.admin

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member=serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com \
    --role=roles/iam.serviceAccountUser
```

## 2. bunfree-api のCloud Runへのデプロイ

### 2.1 APIプロジェクトの準備

プロジェクトのルートディレクトリに `Dockerfile` を作成します：

```bash
cd bunfree-api
```

`Dockerfile` を次の内容で作成：

```dockerfile
FROM node:lts-alpine

WORKDIR /app

# ソースファイルをコピー
COPY package*.json ./
RUN npm ci

# アプリケーションソースをコピー
COPY . .

# アプリをビルド
RUN npm run build

# 環境変数を設定
ENV PORT=8080
EXPOSE 8080

# 直接node commandでサーバーを起動
CMD ["node", "dist-server/index.js"]
```

`package.json` のスクリプトを確認し、適切な起動コマンドが設定されていることを確認します。
既存の `package.json` の `scripts` セクションを以下のように更新します:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build && vite build --ssr",
  "preview": "$npm_execpath run build && wrangler dev dist-server/index.js",
  "start": "node dist-server/index.js",
  "deploy": "$npm_execpath run build && wrangler deploy dist-server/index.js",
  "cf-typegen": "wrangler types --env-interface CloudflareBindings"
}
```

### 2.2 Hono.jsのアダプタ設定

`src/index.ts` ファイルを更新して、Node.jsのアダプタを使用するように変更します：

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
import z from 'zod'
import { getLlmAIResponse } from './getLlmAIResponse'

// 環境変数のスキーマを定義
const envSchema = z.object({
  QDRANT_URL: z.string(),
  QDRANT_API_KEY: z.string(),
  GEMINI_API_KEY: z.string(),
  VOYAGE_API_KEY: z.string()
})

// 型定義
type EnvVars = z.infer<typeof envSchema>

const app = new Hono()

// CORSミドルウェアを追加
app.use('/*', cors({
  origin: '*', // すべてのオリジンを許可（開発用）
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}))

app.post('/', async (c) => {
  const { message } = await c.req.json();
  
  // 環境変数を取得してバリデーション
  const environment = env<EnvVars>(c);
  const envResult = envSchema.safeParse(environment);
  
  if (!envResult.success) {
    console.error('環境変数のバリデーションに失敗したよ！', envResult.error);
    return c.json({ error: '環境変数の設定に問題があるよ！サーバー管理者に連絡してね！' }, 500);
  }
  
  const { QDRANT_URL, QDRANT_API_KEY, GEMINI_API_KEY, VOYAGE_API_KEY } = envResult.data;
  const response = await getLlmAIResponse(message, QDRANT_URL, QDRANT_API_KEY, GEMINI_API_KEY, VOYAGE_API_KEY);
  
  return c.json({ response });
})

app.get('/', async (c) => {
  const message = c.req.query('message');
  if (!message) {
    return c.json({ error: 'メッセージが必要だよ〜！' }, 400);
  }
  
  // 環境変数を取得してバリデーション
  const environment = env<EnvVars>(c);
  const envResult = envSchema.safeParse(environment);
  
  if (!envResult.success) {
    console.error('環境変数のバリデーションに失敗したよ！', envResult.error);
    return c.json({ error: '環境変数の設定に問題があるよ！サーバー管理者に連絡してね！' }, 500);
  }
  
  const { QDRANT_URL, QDRANT_API_KEY, GEMINI_API_KEY, VOYAGE_API_KEY } = envResult.data;
  const response = await getLlmAIResponse(message, QDRANT_URL, QDRANT_API_KEY, GEMINI_API_KEY, VOYAGE_API_KEY);
  
  return c.json({ response });
})

// Cloud Run環境とCloudflare Workers環境の両方で動作するように調整
// Node.js環境かどうかをチェック
if (typeof process !== 'undefined' && process.env) {
  // Node.js環境（Cloud Run）の場合はサーバーを起動
  const port = parseInt(process.env.PORT || '8080');
  console.log(`サーバーがポート ${port} で起動したよ～ (Node.js環境)`);

  serve({
    fetch: app.fetch,
    port
  });
}

// Cloudflare Workersおよびその他の環境向けにappをエクスポート
export default app
```

### 2.3 環境変数の設定

Cloud Runの環境変数として、APIキーなどの機密情報を設定します。
`.dev.vars`ファイルに記載されている変数を、後ほどCloud Runサービスのデプロイ時に設定します。

### 2.4 APIのビルドとデプロイ

```bash
# ビルドを実行
npm run build

# Cloud Runにデプロイ
gcloud run deploy bunfree-api \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars="QDRANT_URL=YOUR_QDRANT_URL,QDRANT_API_KEY=YOUR_QDRANT_API_KEY,GEMINI_API_KEY=YOUR_GEMINI_API_KEY,VOYAGE_API_KEY=YOUR_VOYAGE_API_KEY"
```

デプロイが完了すると、サービスURLが表示されます。このURLを保存しておきます。

## 3. bunfree-client のFirebase Hostingへのデプロイ

### 3.1 Firebaseプロジェクトのセットアップ

```bash
# Firebase CLIのインストール（まだの場合）
npm install -g firebase-tools

# Firebaseにログイン
firebase login

# Firebase プロジェクトを初期化
cd bunfree-client
firebase init
```

Firebase初期化プロセスでは、以下の選択をします：
- 「Hosting: Configure files for Firebase Hosting...」を選択
- 既存のGCPプロジェクトを使用（Cloud Runと同じプロジェクトを選択）
- 公開ディレクトリとして「dist」を指定（Viteのビルド出力先）
- シングルページアプリケーションの設定に「Yes」と回答
- GitHubアクションによる自動デプロイの設定は任意（推奨：Yes）

### 3.2 API URLの設定

クライアントアプリケーションがAPIを呼び出すためのURLを環境変数として設定します。
プロジェクトのルートに`.env.production`ファイルを作成：

```
VITE_API_URL=https://bunfree-api-xxxxxxxx.asia-northeast1.run.app
```

`VITE_API_URL`にはCloud Runデプロイ後に得られたAPIのURLを設定します。正確なURLはGCPコンソールのCloud Runサービス詳細画面で確認できます。

また、クライアントコードでは環境変数を使用するよう変更します。`src/components/ChatApp.tsx`ファイル内で：

```typescript
// APIのURL設定 - 環境変数または固定値（フォールバック）
const API_URL = import.meta.env.VITE_API_URL || 'https://bunfree-api.ushida-yosei.workers.dev';

// 使用例
const response = await fetch(`${API_URL}/?message=${encodeURIComponent(input)}`);
```

この設定により、本番環境ではCloud Run上のAPIを、環境変数が未設定の場合は開発用のバックアップAPIを使用します。

### 3.3 クライアントアプリのビルドとデプロイ

```bash
# アプリケーションをビルド
npm run build

# Firebase Hostingにデプロイ
firebase deploy --only hosting
```

デプロイが完了すると、ホスティングURLが表示されます。このURLでアプリケーションにアクセスできます。

### 3.5 独自のサブドメインの設定

Firebase Hostingでは、独自のドメインやサブドメインを使用してサイトを公開できます。以下の手順で設定しましょう。

#### 3.5.1 カスタムドメインの接続

Firebase Hostingでは、独自のドメインやサブドメインを使用してサイトを公開できます。以下の手順で設定しましょう。

1. Firebase CLIを使用して、追加のサイトを作成します：
```sh
firebase hosting:sites:create bunfree-client
```

2. ターゲットを設定します：
```sh
firebase target:apply hosting bunfree-client bunfree-client
```

3. サイトをデプロイする際は、ターゲットを指定します：
```sh
firebase deploy --only hosting:bunfree-client
```

注意: `firebase hosting:channel:deploy production --target bunfree-client` コマンドでチャンネルデプロイを使用することもできます。（`--site` ではなく `--target` を使用してください）

#### 3.5.2 DNSレコードの設定

1. Firebase Consoleにアクセスし、プロジェクトを選択
2. 「Hosting」セクションに移動し、「カスタムドメインを追加」をクリック
3. 使用したいドメイン（例：`chat.yourdomain.com`）を入力
4. 表示されるDNSレコード（通常はCNAMEレコード）をドメインプロバイダーのDNS設定に追加
5. DNSの伝播を待つ（通常数時間〜24時間）

#### 3.5.3 SSL証明書の自動設定

カスタムドメインを追加すると、Firebaseは自動的にSSL証明書を発行・更新します。証明書の状態はFirebase Consoleで確認できます。

#### 3.5.4 firebase.jsonの更新

複数のサイトをホスティングする場合は、`firebase.json`ファイルを更新して各サイトの設定を指定する必要があります。例えば：

```json
{
  "hosting": {
    "target": "bunfree-client",
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

また、`.firebaserc`ファイルが自動的に更新され、ターゲットとサイトのマッピングが追加されます：

```json
{
  "projects": {
    "default": "your-project-id"
  },
  "targets": {
    "your-project-id": {
      "hosting": {
        "bunfree-client": [
          "bunfree-client"
        ]
      }
    }
  }
}
```

## 4. Cloud RunとFirebase Hostingの連携

### 4.1 CORS設定の確認

APIのCORS設定が、Firebase Hostingのドメインからのリクエストを許可していることを確認します。
本番環境では、`origin: '*'`の代わりに具体的なドメインを指定することをお勧めします。

```typescript
app.use('/*', cors({
  origin: ['https://your-firebase-app.web.app', 'https://chat.yourdomain.com'], // Firebase Hostingのドメインとカスタムドメイン
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}))
```

### 4.2 Firebase Hostingのリライト設定（オプション）

APIリクエストをCloud RunにリダイレクトするようにFirebaseのリライトルールを設定できます。
これにより、CORSの問題を回避し、同一オリジンからのAPIコールが可能になります。

`firebase.json`ファイルを以下のように編集：

```json
{
  "hosting": {
    ...,
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "bunfree-api",
          "region": "asia-northeast1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

リライト設定を追加した場合は、クライアントコードの環境変数も更新する必要があります：

```
VITE_API_URL=/api
```

設定を更新したら、再デプロイを行います：

```bash
firebase deploy --only hosting

# または特定のターゲットを指定する場合
firebase deploy --only hosting:bunfree-client
```

## 5. デプロイの検証とモニタリング

### 5.1 アプリケーションの動作確認

Firebase HostingのURLにアクセスし、アプリケーションが正常に動作することを確認します。特にAPIとの通信が正常に行われているかを確認します。

### 5.2 Cloud Runのログ確認

APIのログを確認するには：

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=bunfree-api" --limit=10
```

### 5.3 モニタリングとアラートの設定

GCP Cloud Monitoringを使用して、APIのパフォーマンスとエラー率をモニタリングし、問題が発生した場合にアラートを設定することをお勧めします。

## 6. 運用とメンテナンス

### 6.1 APIの更新デプロイ

コードを修正した後、再デプロイするには：

```bash
cd bunfree-api
npm run build
gcloud run deploy bunfree-api --source .
```

### 6.2 クライアントアプリの更新デプロイ

コードを修正した後、再デプロイするには：

```bash
cd bunfree-client
npm run build
firebase deploy --only hosting

# カスタムドメインを設定している場合は、特定のターゲットを指定してデプロイ
firebase deploy --only hosting:bunfree-client
```

### 6.3 GitHubアクションによる自動デプロイ

GitHubアクションを設定した場合、メインブランチへの変更がプッシュされると自動的にデプロイが行われます。`.github/workflows`ディレクトリ内のワークフローファイルを確認・編集することで、デプロイプロセスをカスタマイズできます。

## 7. トラブルシューティング

### 7.1 Cloud Runデプロイの問題

- **ビルドエラー**: `gcloud builds logs [BUILD_ID]`でビルドログを確認
- **起動エラー**: Cloud Runサービスの詳細ページでログを確認
- **環境変数の問題**: 環境変数が正しく設定されているか確認

### 7.2 Firebase Hostingデプロイの問題

- **ビルドエラー**: プロジェクトを正常にビルドできるか確認
- **デプロイエラー**: `firebase deploy --debug`でデバッグ情報を表示
- **GitHubアクションの失敗**: GitHubリポジトリのActionsタブでエラーを確認
- **「Hosting site or target not detected」エラー**: `firebase.json`ファイルに`"target": "bunfree-client"`が設定されているか確認。このプロパティがないとターゲットを指定したデプロイができません。例：
  ```json
  {
    "hosting": {
      "target": "bunfree-client",
      "public": "dist",
      ...
    }
  }
  ```

### 7.3 CORS関連の問題

- ブラウザのDeveloper Toolsでネットワークエラーを確認
- APIのCORS設定が正しいか確認
- Firebase Hostingのリライトルールが正しく設定されているか確認

---

本デプロイガイドを参考に、bunfree-apiをCloud Runに、bunfree-clientをFirebase Hostingにデプロイすることで、スケーラブルで高パフォーマンスな環境を構築できます。この構成はコスト効率が良く、運用負荷も低いため、中小規模のアプリケーションに最適です。 