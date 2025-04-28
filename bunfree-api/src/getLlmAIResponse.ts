import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnableBranch } from "@langchain/core/runnables";
import { QdrantClient } from '@qdrant/js-client-rest';
import { LLMResponse } from './types';
import { classifyQueryPrompt, searchQueryGenerationPrompt } from './prompts';
import { handleVectorSearch, handleBoothNameSearch, handleBoothTwitterSearch, handleEventInfo, handleGeneralChat } from './handlers';
// 回答生成関数
async function getLlmAIResponse(userInput: string,qdrantUrl: string,qdrantApiKey: string,geminiApiKey: string,voyageApiKey: string): Promise<LLMResponse> {
  // LLMの初期化
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    apiKey: geminiApiKey,
  });

  // Embeddings初期化
  const embeddings = new VoyageEmbeddings({
    apiKey: voyageApiKey,
    modelName: "voyage-3-large",
    inputType: "query",
    truncation: true,
    outputDimension: 2048, // Voyage-3-largeのデフォルト次元数
  });

  // Qdrantクライアント初期化
  const qdrantClient = new QdrantClient({
    url: qdrantUrl,
    apiKey: qdrantApiKey,
  });

  // 入力クエリタイプ分類チェーン
  const classifyQueryChain = RunnableSequence.from([
    classifyQueryPrompt,
    llm,
    new StringOutputParser(),
  ]);

  // 検索クエリ生成チェーン
  const searchQueryGenerationChain = RunnableSequence.from([
    searchQueryGenerationPrompt,
    llm,
    new StringOutputParser(),
  ]);

  // RunnableBranchによる分岐処理
  const branchProcessor = RunnableBranch.from([
    [
      (x: { queryType: string; originalQuery: string }) =>
        x.queryType.includes('BOOTH_NAME_SEARCH'),
      async (x: { queryType: string; originalQuery: string }) => {
        // BOOTH_NAME_SEARCH<ブース名>の形式からブース名を抽出
        const match = x.queryType.match(/BOOTH_NAME_SEARCH<(.+?)>/);
        const boothName = match ? match[1] : '';
        return handleBoothNameSearch(x.originalQuery, boothName, qdrantClient, llm);
      }
    ],
    // Twitterアカウント検索処理
    [
      (x: { queryType: string; originalQuery: string }) =>
        x.queryType.includes('BOOTH_TWITTER_SEARCH'),
      async (x: { queryType: string; originalQuery: string }) => {
        // BOOTH_TWITTER_SEARCH<twitter_account>の形式からアカウントを抽出
        const match = x.queryType.match(/BOOTH_TWITTER_SEARCH<(.+?)>/);
        const twitterAccount = match ? match[1] : '';
        return handleBoothTwitterSearch(x.originalQuery, twitterAccount, qdrantClient, llm);
      }
    ],
    [
      (x: { queryType: string; originalQuery: string }) =>
        x.queryType.includes('VECTOR_SEARCH'),
      async (x: { queryType: string; originalQuery: string }) => {
        // VECTOR_SEARCH<検索クエリ>の形式から検索クエリを抽出
        const match = x.queryType.match(/VECTOR_SEARCH<(.+?)>/);
        let searchQuery = match ? match[1] : '';
        
        // 検索クエリが抽出できなかった場合は元のクエリからクエリを生成
        if (!searchQuery) {
          searchQuery = await searchQueryGenerationChain.invoke({ query: x.originalQuery });
        }
        
        return handleVectorSearch(x.originalQuery, searchQuery, embeddings, qdrantClient, llm);
      }
    ],
    [
      (x: { queryType: string; originalQuery: string }) =>
        x.queryType.includes('EVENT_INFO'),
      async (x: { queryType: string; originalQuery: string }) => 
        handleEventInfo(x.originalQuery, llm)
    ],
    [
      (x: { queryType: string; originalQuery: string }) =>
        x.queryType.includes('GENERAL_CHAT'),
      async (x: { queryType: string; originalQuery: string }) => 
        handleGeneralChat(x.originalQuery, llm)
    ],
    // デフォルト処理はベクトル検索（検索クエリを生成してから検索）
    async (x: { queryType: string; originalQuery: string }) => {
      const searchQuery = await searchQueryGenerationChain.invoke({ query: x.originalQuery });
      return handleVectorSearch(x.originalQuery, searchQuery, embeddings, qdrantClient, llm);
    }
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

export { getLlmAIResponse };