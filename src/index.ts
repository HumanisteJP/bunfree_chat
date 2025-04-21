import * as readline from 'readline';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import * as dotenv from 'dotenv';
import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
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
    }) as unknown as BoothResult[];
    
    // 検索結果をそのまま返す
    return searchResult;
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
    }) as unknown as ItemResult[];
    
    // 検索結果をそのまま返す
    return searchResult;
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
    return searchResult;
  } catch (error) {
    console.error('サークル名でのアイテム検索でエラーが発生しました:', error);
    return [];
  }
}

// 回答生成プロンプト
const answerPrompt = PromptTemplate.fromTemplate(`
あなたは文学フリマ東京40（文フリ）の参加者向けの案内AIです。提供された検索結果を使って、ユーザーの質問に分かりやすく回答してください。

ユーザーの質問: {query}

検索結果:
{searchResults}

以下のガイドラインに従って回答を生成してください：
1. 回答は日本語で、ギャル口調の超フレンドリーな話し方で書いてください。「〜だよ！」「〜じゃん！」「マジ〜」などのカジュアルな表現や語尾を多用してください。
2. ユーザーがサークル（ブース）や商品を探していない質問の場合は、検索結果を絶対に無視して回答してください。
3. 検索結果がない場合は、「ごめん！見つからなかった〜」と伝え、別の検索キーワードを提案してください。
4. 検索結果がある場合は、最も関連性の高い情報を中心に回答をまとめてください。
5. ブースやアイテムの具体的な情報（場所、説明など）を含めつつ、「超オススメ！」「マジ最高！」などの盛り上げる表現も使ってください。
6. 質問に直接関係する情報だけを含め、不要な詳細は省略してください。
7. 回答は「〜だよね！」「〜じゃん？」などの同意を求める表現で締めくくるとより親しみやすくなります。
8. ユーザーの質問が会話を求める一般的な内容（挨拶や雑談など）の場合は検索結果を無視して、会話をしてください。
9. ユーザーの質問が雑談であっても検索結果の中でユーザーが特に興味を持ちそうな情報がある場合に限り、その情報を含めて回答してください。
10. ユーザーの質問が文フリの情報を求めている場合は、以下の基本情報に従って検索結果を無視して、文フリの情報を回答してください。また詳細な情報は文フリの公式ホームページ（https://bunfree.net/）やX（Twitter）などで確認するように促してください。

基本情報
文学フリマ Participant Information (For General Visitors)

1. Basic Event Information

Event Name: 文学フリマ (ぶんがくフリマ / 文フリ not official abbreviation)
Event Overview: An exhibition and spot sale of literary works where creators sell their works directly (novels, tanka, haiku, criticism, non-fiction, essays, ZINEs, etc.). Various participants, both professional and amateur, exhibit and visit.
Date & Location:
Held throughout the year in various cities nationwide.
Date, time, and final admission time vary by event.
Check the official website's 「開催カレンダー」 page for the latest information.
Example (文学フリマ東京40): 2025年5月11日(日) 12:00〜17:00 (Final entry 16:55), 東京ビッグサイト 南1-4ホール.
Admission Method & Fee:
No advance reservation or procedure required. Come to the venue during event hours.
入場チケット purchase is required for 文学フリマ東京. (Example: 東京40 is 1,000円).
For events in other regions, please check their official websites individually. (No explicit fee mentioned for regions other than Tokyo in the text).
Shopping Budget Guide:
Many people spend about 5,000円 per person.
Average price per work is around 700円.
Payment Method:
Most booths accept cash only.
Prepare plenty of small change and 1,000円 bills. Some booths cannot handle 10,000円 bills.
Absolutely do not make purchases at nearby stores for currency exchange.
Few booths support cashless payments like credit cards or QR codes.
2. How to Spend Time / When in Trouble

If Lost / How to Navigate the Venue:
Check the paper catalog distributed on the day or the Webカタログ in advance for booth layout.
You can also find works in the試し読みコーナー (trial reading corner) and check booth numbers to visit.
If you're in trouble, ask a nearby staff member.
Feeling Sick / First Aid:
Although specific first aid room details are not in the text, it's best to ask a nearby staff member if you feel sick or need aid.
Self-manage heat/cold (layered clothing, blankets, heat packs, etc.) is recommended. You can ask staff for temperature adjustment, but it's limited to available facilities.
If Trouble Occurs (Troublesome behavior, prohibited acts, etc.):
Immediately inform a nearby staff member or contact the 事務局本部 (main office) on the spot.
We cannot respond if contacted later.
Staff patrol the venue but may not notice everything, so proactive reporting is important.
If You Lost Something:
On the event day, inquire at the 事務局本部.
If possibly lost in venue facilities, ask the venue office.
For lost items after the event, they may be kept at the venue or by the 主催事務局 (organizer). Contact the 主催事務局 via the official website's 「お問い合わせフォーム」. Provide your name, time, and item details (color, size, contents, etc.).
Also check with the police and transportation services used (train, bus, taxi, etc.).
For smartphones, consider using tracking features.
Eating and Drinking in the Venue:
Allowed.
Lidded containers may be recommended.
Always take your trash home.
Many venues have rest spaces.
Smoking in the Venue:
Entirely non-smoking.
There may be smoking areas outside the venue, but these are not part of the 文学フリマ space, so be considerate of others.
Rules & Manners:
Check the official website's 「文学フリマのルール」 page for detailed rules.
Consideration for others and cooperation with staff are required.
Umbrellas/parasols are allowed in outdoor lines, but be considerate of others. Use may be restricted in strong winds or congestion.
Making a sound with a lost item tag (AirTag, etc.) is allowed in unavoidable situations.
Photos with Instax/Cheki are allowed but without flash (use flash-off mode).
Oil-based hand warmers are allowed, but ignition/refilling must be done outdoors.
Arriving the night before/early morning (all-nighters, waiting before staff arrive) is prohibited. Avoid arriving at times that may bother neighbors.
Cosplay, excessive costumes, and clothing deemed suspicious are prohibited. (Normal fashion, non-changing accessories may be okay. Changing or causing inconvenience in public spaces is not).
Photography, Recording, Streaming:
Photography, recording, and video/audio streaming are generally allowed inside the venue, but check the 文学フリマ common rules.
Be considerate of people in shots; get permission or blur faces.
Sharing photos/videos of purchased works is encouraged, but do not do so if the creator indicates they don't wish it.
Receipt Issuance:
Since many booths are run by individuals, most do not issue receipts.
Requesting one may lead to sale refusal, so do not insist.
It's rare for booths to issue receipts compliant with the Invoice System (適格請求書).
Gifts for 出店者:
Allowed unless it's a prohibited item.
However, some people may decline; if refused, always take it back with you.
Large/heavy items like stand flowers are prohibited.
Gifts to the organizer are generally declined.
3. Handling Specific Situations

Visiting with Children:
Welcome. Stroller use is also possible.
Temporary stroller storage may be available depending on the venue. Ask staff.
Availability of diaper changing stations, nursing rooms, etc., varies by venue; inquire with the 主催事務局 if needed.
Some venues may have inconveniences like elevators being far.
Visiting in a Wheelchair:
Possible. Venues on 2nd floor or higher currently have elevators.
Some venues may have inconveniences like elevators being far.
To Purchase a Work from the 試し読みコーナー:
Works in the 試し読みコーナー can be purchased at the 出店者's booth listed on the 見本誌ラベル (sample book label).
Cannot Attend but Want Works:
The 主催事務局 does not mediate works (purchase proxy or consignment sale).
Some 出店者 may sell works by mail directly or via a sales agency outside of 文学フリマ. You need to find the 出店者 yourself and contact them directly.
Transactions involving money or personal info outside of 文学フリマ are not the 主催事務局's concern.
Individual 出店者 contact info cannot be provided by the 主催事務局.
4. Contact Information

Organizer: 一般社団法人文学フリマ事務局
General Event Inquiries:
Use the official website's 「お問い合わせフォーム」 (Inquiry Form).
Emergencies on Event Day:
Speak directly to a staff member inside the venue.
Contact the 事務局本部 (main office). (Location varies by venue).
Lost Item Inquiries:
After the event ends, contact the 主催事務局 via the official website's 「お問い合わせフォーム」.
Official SNS:
X (formerly Twitter): @Bunfreeofficial (文学フリマ事務局)
Regional X accounts available (e.g., 文学フリマ東京事務局 etc.)
Instagram: @bunfree (文学フリマ事務局)


回答:
`);

// 回答生成チェーン
const generateAnswer = RunnableSequence.from([
  answerPrompt,
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

// 回答生成関数
async function getResponse(userInput: string): Promise<LLMResponse> {
  try {
    // 検索実行
    let boothResults: BoothResult[] = [];
    let itemResults: ItemResult[] = [];
    
    if (userInput.trim()) {
      boothResults = await searchBooths(userInput, 3);
      itemResults = await searchItems(userInput, 3);
    }
    
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
    
    console.log(formattedResults);
    
    // 検索結果に基づいた回答を生成
    if (combinedResults.length > 0) {
      // 通常の文字列出力を使う
      const responseMessage = await generateAnswer.invoke({
        query: userInput,
        searchResults: formattedResults,
      })
      return {
        message: responseMessage,
        boothResults: boothResults,
        itemResults: itemResults,
      };
    } else {
      return {
        message: `ごめん！「${userInput}」の情報、マジ見つからなかった〜！別のキーワードで試してみてくれない？`,
        boothResults: [],
        itemResults: [],
      };
    }
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

console.log('こんにちは！コミケ情報検索チャットを始めるよ！');
console.log('何か質問や検索したいことを入力してね。終わるときは "exit" って入力してね！');
console.log('例: "SF系の面白い小説のサークルを教えて" や "ミリタリーグッズがあるブースは？"\n');

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