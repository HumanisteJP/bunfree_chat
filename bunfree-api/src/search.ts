import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { QdrantClient } from '@qdrant/js-client-rest';
import { BoothResult, ItemResult } from './types';


// ブース検索関数 - 意味的検索
async function searchBooths(
    query: string,
    embeddings: VoyageEmbeddings,
    qdrantClient: QdrantClient,
    limit = 5
): Promise<BoothResult[]> {
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
async function searchBoothByName(
    circleName: string,
    qdrantClient: QdrantClient,
    limit = 5
) {
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

// 新たにTwitterアカウントでのブース検索関数を追加
async function searchBoothByTwitter(
    twitterAccount: string,
    qdrantClient: QdrantClient,
    limit = 5
): Promise<BoothResult[]> {
    try {
        // ツイッターアカウントで検索（完全一致）
        const account = twitterAccount.startsWith('@') ? twitterAccount : `@${twitterAccount}`;
        const filter = {
            must: [
                {
                    key: "twitter",
                    match: {
                        value: account,
                    },
                },
            ],
        };
        // console.log(`[searchBoothByTwitter] Qdrant scroll params: collection='booths', limit=${limit}, with_payload=true, filter=${JSON.stringify(filter)}`);
        const searchResult = await qdrantClient.scroll('booths', {
            limit: limit,
            with_payload: true,
            filter,
        });
        // console.log(`[searchBoothByTwitter] Qdrant scroll result points:`, searchResult.points);
        return searchResult.points as unknown as BoothResult[];
    } catch (error) {
        console.error('Twitterアカウント検索でエラーが発生しました:', error);
        return [];
    }
}

// アイテム検索関数
async function searchItems(
    query: string,
    embeddings: VoyageEmbeddings,
    qdrantClient: QdrantClient,
    limit = 5
): Promise<ItemResult[]> {
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
async function searchItemsByBoothName(
    query: string,
    boothName: string,
    embeddings: VoyageEmbeddings,
    qdrantClient: QdrantClient,
    limit = 5
) {
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

export { searchBooths, searchBoothByName, searchBoothByTwitter, searchItems, searchItemsByBoothName };