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

// データベースクラスを作成
class ChatDatabase extends Dexie {
  // テーブル定義
  messages!: Dexie.Table<ChatMessage, number>;

  constructor() {
    super('BunfreeChat');
    
    // データベースのスキーマ定義
    this.version(1).stores({
      messages: '++id, timestamp, role' // id は自動インクリメント、timestampとroleにインデックスを作成
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