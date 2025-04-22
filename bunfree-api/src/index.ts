import { Hono } from 'hono'
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
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

export default app
