import * as readline from 'readline';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import * as dotenv from 'dotenv';
import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnableBranch } from "@langchain/core/runnables";
import { QdrantClient } from '@qdrant/js-client-rest';

// 環境変数の読み込み
dotenv.config();

// APIキーの存在確認
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEYが設定されてないよ！.envファイルを確認してね！');
  process.exit(1);
}

if (!process.env.VOYAGE_API_KEY) {
  console.error('❌ VOYAGE_API_KEYが設定されてないよ！.envファイルを確認してね！');
  process.exit(1);
}

if (!process.env.QDRANT_API_KEY) {
  console.error('❌ QDRANT_API_KEYが設定されてないよ！.envファイルを確認してね！');
  process.exit(1);
}

if (!process.env.QDRANT_URL) {
  console.error('❌ QDRANT_URLが設定されてないよ！.envファイルを確認してね！');
  process.exit(1);
}

const qdrantUrl = process.env.QDRANT_URL;
const apiKey = process.env.QDRANT_API_KEY;

// LLMの初期化
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY,
});

// Embeddings初期化
const embeddings = new VoyageEmbeddings({
  apiKey: process.env.VOYAGE_API_KEY,
  modelName: "voyage-3-large",
  inputType: "query",
  truncation: true,
  outputDimension: 2048, // Voyage-3-largeのデフォルト次元数
});

// Qdrantクライアント初期化
const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  apiKey: apiKey,
});

// ブース検索関数 - 意味的検索
async function searchBooths(query: string, limit = 5): Promise<BoothResult[]> {
  try {
    // ベクトル化
    const queryEmbedding = await embeddings.embedQuery(query);
    
    // Qdrantで検索
    const searchResult = await qdrantClient.search('booths', {
      vector: queryEmbedding,
      limit: limit,
      with_payload: true,
      with_vector: false,
    });
    
    return searchResult as unknown as BoothResult[];
  } catch (error) {
    console.error('ブース検索でエラーが発生しました:', error);
    return [];
  }
}

// サークル名検索関数 - 完全一致検索
async function searchBoothByName(circleName: string, limit = 5) {
  try {
    // Qdrantで検索（フィルター付き）
    const searchResult = await qdrantClient.scroll('booths', {
      limit: limit,
      with_payload: true,
      filter: {
        must: [
          {
            key: "name",
            match: {
              value: circleName,
            },
          },
        ],
      },
    });
    
    // 検索結果をそのまま返す
    return searchResult.points as unknown as BoothResult[];
  } catch (error) {
    console.error('サークル名検索でエラーが発生しました:', error);
    return [];
  }
}

// アイテム検索関数
async function searchItems(query: string, limit = 5): Promise<ItemResult[]> {
  try {
    // ベクトル化
    const queryEmbedding = await embeddings.embedQuery(query);
    
    // Qdrantで検索
    const searchResult = await qdrantClient.search('items', {
      vector: queryEmbedding,
      limit: limit,
      with_payload: true,
      with_vector: false,
    });
    
    return searchResult as unknown as ItemResult[];
  } catch (error) {
    console.error('アイテム検索でエラーが発生しました:', error);
    return [];
  }
}

// サークル名でアイテム検索関数
async function searchItemsByBoothName(query: string, boothName: string, limit = 5) {
  try {
    // ベクトル化
    const queryEmbedding = await embeddings.embedQuery(query);
    
    // Qdrantで検索（フィルター付き）
    const searchResult = await qdrantClient.search('items', {
      vector: queryEmbedding,
      limit: limit,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [
          {
            key: "booth_name",
            match: {
              value: boothName,
            },
          },
        ],
      },
    });
    
    // 検索結果をそのまま返す
    return searchResult as unknown as ItemResult[];
  } catch (error) {
    console.error('サークル名でのアイテム検索でエラーが発生しました:', error);
    return [];
  }
}

// 入力クエリタイプ分類プロンプト
const classifyQueryPrompt = PromptTemplate.fromTemplate(`
あなたはユーザー入力を分類するヘルパーAIです。以下のユーザーの質問を分析して、最も適切なカテゴリに分類してください。

ユーザーの質問: {query}

以下のカテゴリから1つだけ選んでください:
- BOOTH_NAME_SEARCH<booth_name>: ユーザーが特定のサークル名／ブース名で検索しようとしている場合。<booth_name>の部分には実際のサークル名を入れてください。例: BOOTH_NAME_SEARCH<青空文庫>
- VECTOR_SEARCH: ユーザーがキーワードや内容で検索しようとしている（具体的なサークル名は指定していない）
- GENERAL_CHAT: ユーザーが挨拶や雑談をしている（文学フリマのことを聞かれていないだけでなく全く関係ないと革新できる場合のみこれそうでない雑多な場合はEVENT_INFOになる）
- EVENT_INFO: ユーザーが文学フリマそのものについて質問している（入場料、開催場所、日時、飲食の可否など）、また腹痛や迷子といったサポートについて質問している

回答は必ず上記のカテゴリ名のみを返してください。余計な説明は不要です。
BOOTH_NAME_SEARCHの場合は、必ずブース名を<>で囲んで返してください。例: BOOTH_NAME_SEARCH<青空文庫>
`);

// 入力クエリタイプ分類チェーン
const classifyQueryChain = RunnableSequence.from([
  classifyQueryPrompt,
  llm,
  new StringOutputParser(),
]);

// イベント情報回答プロンプト
const eventInfoPrompt = PromptTemplate.fromTemplate(`
あなたは文学フリマ東京40（文フリ）の参加者向けの案内AIです。ユーザーの質問に分かりやすく回答してください。

ユーザーの質問: {query}

以下のガイドラインに従って回答を生成してください：
1. 回答は日本語で、ギャル口調の超フレンドリーな話し方で書いてください。「〜だよ！」「〜じゃん！」「マジ〜」などのカジュアルな表現や語尾を多用してください。
2. 質問に直接関係する情報だけを含め、不要な詳細は省略してください。
3. 回答は「〜だよね！」「〜じゃん？」などの同意を求める表現で締めくくるとより親しみやすくなります。
4. 詳細な情報は文フリの公式ホームページ（https://bunfree.net/）やX（Twitter）などで確認するように促してください。

文学フリマ基本情報：
文学フリマ (ぶんがくフリマ / 文フリ): 小説、短歌、俳句、批評、ノンフィクション、エッセイ、ZINEなど様々な文学作品の展示即売会。
開催日時・場所: 全国各地で年間を通して開催。詳細は公式サイトの「開催カレンダー」ページを確認。
例）文学フリマ東京40: 2025年5月11日(日) 12:00〜17:00 (最終入場 16:55)、東京ビッグサイト 南1-4ホール
入場方法・料金: 文学フリマ東京は入場チケット購入が必要（例: 東京40は1,000円）。他地域は各公式サイトで確認。
支払い方法: ほとんどのブースは現金のみ対応。小銭と1,000円札を準備推奨。一部ブースのみキャッシュレス対応。
会場内での飲食: 許可されている。ふた付き容器推奨。ゴミは持ち帰り。
喫煙: 会場内は全面禁煙。
撮影・録画: 会場内での撮影、録画、動画/音声配信は一般的に許可されているが、文学フリマ共通ルールを確認のこと。
子ども連れ・車椅子での来場: 可能。ベビーカー使用も可能。会場によって設備が異なるため、必要に応じて主催事務局に問い合わせを。
問い合わせ先: 一般社団法人文学フリマ事務局。公式サイトの「お問い合わせフォーム」を使用。
公式SNS: X（旧Twitter）: @Bunfreeofficial（文学フリマ事務局）、Instagram: @bunfree（文学フリマ事務局）

回答:
`);

// 雑談回答プロンプト
const generalChatPrompt = PromptTemplate.fromTemplate(`
あなたは文学フリマ東京40（文フリ）の参加者向けの案内AIです。ユーザーとフレンドリーに会話してください。

ユーザーの発言: {query}

以下のガイドラインに従って回答を生成してください：
1. 回答は日本語で、ギャル口調の超フレンドリーな話し方で書いてください。「〜だよ！」「〜じゃん！」「マジ〜」などのカジュアルな表現や語尾を多用してください。
2. 文学フリマのことを聞かれていなくても、自然な流れで文学フリマに関する話題を織り交ぜてください。
3. ポジティブで元気のある返答を心がけてください。
4. 相手の気持ちに共感するような返答を心がけてください。
5. 回答は「〜だよね！」「〜じゃん？」などの同意を求める表現で締めくくるとより親しみやすくなります。

回答:
`);

// ベクトル検索結果プロンプト
const vectorSearchPrompt = PromptTemplate.fromTemplate(`
あなたは文学フリマ東京40（文フリ）の参加者向けの案内AIです。提供された検索結果を使って、ユーザーの質問に分かりやすく回答してください。

ユーザーの質問: {query}

検索結果:
{searchResults}

以下のガイドラインに従って回答を生成してください：
1. 回答は日本語で、ギャル口調の超フレンドリーな話し方で書いてください。「〜だよ！」「〜じゃん！」「マジ〜」などのカジュアルな表現や語尾を多用してください。
2. 検索結果がある場合は、最も関連性の高い情報を中心に回答をまとめてください。
3. ブースやアイテムの具体的な情報（場所、説明など）を含めつつ、「超オススメ！」「マジ最高！」などの盛り上げる表現も使ってください。
4. 質問に直接関係する情報だけを含め、不要な詳細は省略してください。
5. 回答は「〜だよね！」「〜じゃん？」などの同意を求める表現で締めくくるとより親しみやすくなります。
6. 検索結果がない場合は、「ごめん！見つからなかった〜」と伝え、別の検索キーワードを提案してください。

回答:
`);

// サークル名検索結果プロンプト
const boothNameSearchPrompt = PromptTemplate.fromTemplate(`
あなたは文学フリマ東京40（文フリ）の参加者向けの案内AIです。提供された検索結果を使って、ユーザーの質問に分かりやすく回答してください。

ユーザーの質問: {query}

検索結果:
{searchResults}

以下のガイドラインに従って回答を生成してください：
1. 回答は日本語で、ギャル口調の超フレンドリーな話し方で書いてください。「〜だよ！」「〜じゃん！」「マジ〜」などのカジュアルな表現や語尾を多用してください。
2. 検索結果がある場合は、サークル名に完全一致した情報を中心に回答をまとめてください。
3. ブースの具体的な情報（場所、説明など）を含めつつ、「超オススメ！」「マジ最高！」などの盛り上げる表現も使ってください。
4. そのサークルが出している商品情報も含めてください。
5. 質問に直接関係する情報だけを含め、不要な詳細は省略してください。
6. 回答は「〜だよね！」「〜じゃん？」などの同意を求める表現で締めくくるとより親しみやすくなります。
7. 検索結果がない場合は、「ごめん！そのサークル見つからなかった〜」と伝え、似た名前のサークルや別の検索方法を提案してください。

回答:
`);

// 各処理チェーンの定義
const eventInfoChain = RunnableSequence.from([
  eventInfoPrompt,
  llm,
  new StringOutputParser(),
]);

const generalChatChain = RunnableSequence.from([
  generalChatPrompt,
  llm,
  new StringOutputParser(),
]);

// ブース検索結果の型定義
type BoothResult = {
  type: string;
  id: number;
  score: number;
  payload: {
    id: number;
    name: string;
    yomi: string;
    category: string;
    area: string;
    area_number: string;
    members: string | null;
    twitter: string | null;
    instagram: string | null;
    website_url: string | null;
    description: string;
    map_number: number;
    position_top: number;
    position_left: number;
    url: string;
    items: {
      id: number;
      booth_id: number;
      name: string;
      yomi: string;
      genre: string;
      author: string;
      item_type: string;
      page_count: number;
      release_date: string;
      price: number;
      url: string;
      page_url: string;
      description: string;
    }[];
  }
};

// アイテム検索結果の型定義
type ItemResult = {
  type: string;
  id: number;
  score: number;
  payload: {
    id: number;
    booth_id: number;
    name: string;
    yomi: string;
    genre: string;
    author: string;
    item_type: string;
    page_count: number;
    release_date: string;
    price: number;
    url: string;
    page_url: string;
    description: string;
    booth_name: string;
    booth_area: string;
    booth_area_number: string;
    booth_details: {
      id: number;
      name: string;
      yomi: string;
      category: string;
      area: string;
      area_number: string;
      members: string | null;
      twitter: string | null;
      instagram: string | null;
    }
  }
};

// LLMレスポンスの型定義
type LLMResponse = {
  message: string;
  boothResults: BoothResult[];
  itemResults: ItemResult[];
}

// ベクトル検索処理
async function handleVectorSearch(query: string): Promise<LLMResponse> {
    // 検索実行
  const boothResults = await searchBooths(query, 3);
  const itemResults = await searchItems(query, 3);
    
    // 検索結果を統合
    const combinedResults = [
      ...boothResults.map(hit => ({
        type: 'booth',
        id: hit.id,
        score: hit.score,
        payload: hit.payload
      })),
      ...itemResults.map(hit => ({
        type: 'item',
        id: hit.id,
        score: hit.score,
        payload: hit.payload
      }))
    ];
    
    // 検索結果をJSON形式で整形
    const formattedResults = JSON.stringify(combinedResults, null, 2);
    
  if (combinedResults.length > 0) {
    const responseMessage = await vectorSearchPrompt.pipe(llm).pipe(new StringOutputParser()).invoke({
      query: query,
      searchResults: formattedResults,
    });
    
    return {
      message: responseMessage,
      boothResults: boothResults,
      itemResults: itemResults
    };
  } else {
    return {
      message: `ごめん！「${query}」の情報、マジ見つからなかった〜！別のキーワードで試してみてくれない？`,
      boothResults: [],
      itemResults: []
    };
  }
}

// サークル名検索処理
async function handleBoothNameSearch(query: string, boothName: string): Promise<LLMResponse> {
  // ブース名で検索
  const boothResults = await searchBoothByName(boothName, 1);
  
  
  // 検索結果を統合
  const combinedResults = [
    ...boothResults.map(hit => ({
      type: 'booth',
      id: hit.id,
      score: 1.0, // 完全一致の場合はスコアを1.0にする
      payload: hit.payload
    }))
  ];
  
  // 検索結果をJSON形式で整形
  const formattedResults = JSON.stringify(combinedResults, null, 2);
  
    if (combinedResults.length > 0) {
    const responseMessage = await boothNameSearchPrompt.pipe(llm).pipe(new StringOutputParser()).invoke({
      query: query,
        searchResults: formattedResults,
    });
    
      return {
        message: responseMessage,
        boothResults: boothResults,
        itemResults: []
      };
    } else {
    return {
      message: `ごめん！「${boothName}」っていうサークル、マジ見つからなかった〜！もしかして名前違うかも？別の言い方で検索してみてくれない？`,
      boothResults: [],
      itemResults: []
    };
  }
}

// イベント情報処理
async function handleEventInfo(query: string): Promise<LLMResponse> {
  const responseMessage = await eventInfoChain.invoke({
    query: query
  });
  
  return {
    message: responseMessage,
    boothResults: [],
    itemResults: []
  };
}

// 雑談処理
async function handleGeneralChat(query: string): Promise<LLMResponse> {
  const responseMessage = await generalChatChain.invoke({
    query: query
  });
  
  return {
    message: responseMessage,
    boothResults: [],
    itemResults: []
  };
}

// RunnableBranchによる分岐処理
const branchProcessor = RunnableBranch.from([
  [
    (x: { queryType: string; originalQuery: string }) => 
      x.queryType.includes('BOOTH_NAME_SEARCH'),
    async (x: { queryType: string; originalQuery: string }) => {
      // BOOTH_NAME_SEARCH<ブース名>の形式からブース名を抽出
      const match = x.queryType.match(/BOOTH_NAME_SEARCH<(.+?)>/);
      const boothName = match ? match[1] : '';
      return handleBoothNameSearch(x.originalQuery, boothName);
    }
  ],
  [
    (x: { queryType: string; originalQuery: string }) => 
      x.queryType.includes('VECTOR_SEARCH'),
    async (x: { queryType: string; originalQuery: string }) => handleVectorSearch(x.originalQuery)
  ],
  [
    (x: { queryType: string; originalQuery: string }) => 
      x.queryType.includes('EVENT_INFO'),
    async (x: { queryType: string; originalQuery: string }) => handleEventInfo(x.originalQuery)
  ],
  [
    (x: { queryType: string; originalQuery: string }) => 
      x.queryType.includes('GENERAL_CHAT'),
    async (x: { queryType: string; originalQuery: string }) => handleGeneralChat(x.originalQuery)
  ],
  // デフォルト処理はベクトル検索
  async (x: { queryType: string; originalQuery: string }) => handleVectorSearch(x.originalQuery)
]);

// メイン処理チェーン
const mainChain = RunnableSequence.from([
  {
    queryType: async (input: { query: string }) => {
      const queryType = await classifyQueryChain.invoke({ query: input.query });
      return queryType;
    },
    originalQuery: (input: { query: string }) => input.query
  },
  branchProcessor
]);

// 回答生成関数
async function getResponse(userInput: string): Promise<LLMResponse> {
  try {
    if (!userInput.trim()) {
      return {
        message: 'なになに？聞こえなかった〜！もう一回話してくれる？',
        boothResults: [],
        itemResults: []
      };
    }
    
    // クエリ分類と適切な処理の実行
    return await mainChain.invoke({ query: userInput });
    
  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    return {
      message: 'ヤバイ！エラーが出ちゃった！もう一回やってみてくれる？',
      boothResults: [],
      itemResults: [],
    };
  }
}

// CLI設定
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('こんにちは！文学フリマ情報検索チャットを始めるよ！');
console.log('何か質問や検索したいことを入力してね。終わるときは "exit" って入力してね！');
console.log('例: "SF系の面白い小説のサークルを教えて" や "「青空文庫」というサークルはどこ？"\n');

// 入力プロンプト表示関数
function showPrompt() {
  rl.question('> ', async (input: string) => {
    if (input.toLowerCase() === 'exit') {
      console.log('バイバイ！またね！');
      rl.close();
    } else {
      console.log('検索中...');
      const response = await getResponse(input);
      console.log(`\n${response.message}\n`);
      showPrompt();
    }
  });
}

// アプリケーション起動
async function startApp() {
  try {
    showPrompt();
  } catch (error) {
    console.error('アプリケーションの起動中にエラーが発生しました:', error);
    process.exit(1);
  }
}

startApp(); 