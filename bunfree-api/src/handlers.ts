import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { QdrantClient } from '@qdrant/js-client-rest';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";

import { LLMResponse } from './types';
import { searchBooths, searchItems, searchBoothByName, searchBoothByTwitter } from './search';
import { vectorSearchPrompt, boothNameSearchPrompt, boothTwitterSearchPrompt, eventInfoPrompt, generalChatPrompt } from './prompts';
// ベクトル検索処理
async function handleVectorSearch(
    query: string,
    searchQuery: string,
    embeddings: VoyageEmbeddings,
    qdrantClient: QdrantClient,
    llm: ChatGoogleGenerativeAI
): Promise<LLMResponse> {
    // 検索実行（最適化されたクエリを使用）
    const boothResults = await searchBooths(searchQuery, embeddings, qdrantClient, 3);
    const itemResults = await searchItems(searchQuery, embeddings, qdrantClient, 3);

    // 検索結果を統合
    const combinedResults = [
        ...boothResults.map(hit => ({
            type: 'booth',
            id: hit.id,
            score: hit.score,
            payload: {
                name: hit.payload.name,
                category: hit.payload.category,
                area: hit.payload.area,
                area_number: hit.payload.area_number,
                description: hit.payload.description,
                url: hit.payload.url,
                website_url: hit.payload.website_url,
                twitter: hit.payload.twitter,
                items: hit.payload.items.map(item => ({
                    name: item.name,
                    description: item.description,
                    author: item.author,
                    url: item.url,
                    price: item.price,
                    page_url: item.page_url,
                    page_count: item.page_count,
                }))
            }
        })),
        ...itemResults.map(hit => ({
            type: 'item',
            id: hit.id,
            score: hit.score,
            payload: {
                name: hit.payload.name,
                description: hit.payload.description,
                author: hit.payload.author,
                url: hit.payload.url,
                page_url: hit.payload.page_url,
                price: hit.payload.price,
                page_count: hit.payload.page_count,
                booth_name: hit.payload.booth_name,
                booth_area: hit.payload.booth_area,
                booth_area_number: hit.payload.booth_area_number,
                booth_url: hit.payload.booth_details.url,
                booth_twitter: hit.payload.booth_details.twitter,
            }
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
async function handleBoothNameSearch(
    query: string,
    boothName: string,
    qdrantClient: QdrantClient,
    llm: ChatGoogleGenerativeAI
): Promise<LLMResponse> {
    // ブース名で検索
    const boothResults = await searchBoothByName(boothName, qdrantClient, 3);

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

// Twitterアカウント検索処理
async function handleBoothTwitterSearch(
    query: string,
    twitterAccount: string,
    qdrantClient: QdrantClient,
    llm: ChatGoogleGenerativeAI
): Promise<LLMResponse> {
    // Twitterアカウントで検索
    const boothResults = await searchBoothByTwitter(twitterAccount, qdrantClient, 3);

    const combinedResults = [
        ...boothResults.map(hit => ({
            type: 'booth',
            id: hit.id,
            score: 1.0,
            payload: hit.payload
        }))
    ];

    const formattedResults = JSON.stringify(combinedResults, null, 2);

    if (combinedResults.length > 0) {
        const responseMessage = await boothTwitterSearchPrompt.pipe(llm).pipe(new StringOutputParser()).invoke({
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
            message: `ごめん！Twitterアカウント「${twitterAccount}」で見つからなかった〜！別のアカウントで試してみてね？`,
            boothResults: [],
            itemResults: []
        };
    }
}

// イベント情報処理
async function handleEventInfo(
    query: string,
    llm: ChatGoogleGenerativeAI
): Promise<LLMResponse> {
    const eventInfoChain = RunnableSequence.from([
        eventInfoPrompt,
        llm,
        new StringOutputParser(),
    ]);

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
async function handleGeneralChat(
    query: string,
    llm: ChatGoogleGenerativeAI
): Promise<LLMResponse> {
    const generalChatChain = RunnableSequence.from([
        generalChatPrompt,
        llm,
        new StringOutputParser(),
    ]);

    const responseMessage = await generalChatChain.invoke({
        query: query
    });

    return {
        message: responseMessage,
        boothResults: [],
        itemResults: []
    };
}

export { handleVectorSearch, handleBoothNameSearch, handleBoothTwitterSearch, handleEventInfo, handleGeneralChat };