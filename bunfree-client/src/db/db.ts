import Dexie from 'dexie';
import { LLMResponse } from '../types';

// チャットメッセージの型定義
export interface ChatMessage {
  id?: number; // 自動インクリメント用ID
  timestamp: number; // タイムスタンプ
  role: 'user' | 'assistant';
  content: string;
  llmResponse?: LLMResponse;
}

// お気に入りブースの型定義
export interface FavoriteBooth {
  id?: number; // 自動インクリメント用ID
  timestamp: number; // タイムスタンプ
  boothId: number; // ブースID
  boothData: any; // ブースの詳細データ
}

// データベースクラスを作成
class ChatDatabase extends Dexie {
  // テーブル定義
  messages!: Dexie.Table<ChatMessage, number>;
  favorites!: Dexie.Table<FavoriteBooth, number>;

  constructor() {
    super('BunfreeChat');
    
    // データベースのスキーマ定義
    this.version(1).stores({
      messages: '++id, timestamp, role' // id は自動インクリメント、timestampとroleにインデックスを作成
    });

    // バージョン2でお気に入りテーブルを追加
    this.version(2).stores({
      messages: '++id, timestamp, role',
      favorites: '++id, timestamp, boothId' // お気に入りブース用のテーブル
    });
  }
}

// データベースのインスタンスを作成して外部に公開
export const db = new ChatDatabase();

// チャットメッセージの保存
export const saveMessage = async (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
  return await db.messages.add({
    ...message,
    timestamp: Date.now()
  });
};

// 全てのメッセージを取得（新しい順）
export const getAllMessages = async () => {
  return await db.messages.orderBy('timestamp').reverse().toArray();
};

// 全てのメッセージを取得（古い順）
export const getAllMessagesChronological = async () => {
  return await db.messages.orderBy('timestamp').toArray();
};

// 全てのメッセージを削除
export const clearAllMessages = async () => {
  return await db.messages.clear();
};

// お気に入りブースを追加
export const addFavoriteBooth = async (booth: any) => {
  // 既存のお気に入りを確認
  const existing = await db.favorites.where('boothId').equals(booth.id).first();
  
  // 既に存在する場合は追加しない
  if (existing) {
    return existing.id;
  }
  
  // 存在しない場合は追加
  return await db.favorites.add({
    boothId: booth.id,
    boothData: booth,
    timestamp: Date.now()
  });
};

// お気に入りブースを削除
export const removeFavoriteBooth = async (boothId: number) => {
  return await db.favorites.where('boothId').equals(boothId).delete();
};

// お気に入りブースの全取得
export const getAllFavoriteBooths = async () => {
  return await db.favorites.orderBy('timestamp').toArray();
};

// ブースがお気に入りに登録されているか確認
export const isFavoriteBooth = async (boothId: number) => {
  const booth = await db.favorites.where('boothId').equals(boothId).first();
  return booth !== undefined;
}; 