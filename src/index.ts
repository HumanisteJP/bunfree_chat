import readline from 'readline';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEYが設定されてないよ！.envファイルを確認してね！');
  process.exit(1);
}

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('こんにちは！LangChain × Geminiのチャットアプリのテストを始めるよ！');
console.log('何か入力してね。終わるときは "exit" って入力してね！');

let messageHistory: any[] = [
  new SystemMessage("あなたは親切で役立つAIアシスタントです。ユーザーの質問に日本語で答えてください。")
];

rl.on('line', async (input: string) => {
  if (input.toLowerCase() === 'exit') {
    console.log('バイバイ！またね！');
    rl.close();
  } else {
    messageHistory.push(new HumanMessage(input));
    const response = await model.invoke(messageHistory);
    messageHistory.push(response);
    console.log(`\nGemini: ${response.content}`);
  }
}); 