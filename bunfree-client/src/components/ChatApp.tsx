import React, { useState, useEffect, useRef } from 'react';
import { LLMResponse } from '../types';
import MapViewer from './MapViewer';
import './ChatApp.css';
// markdown-itをインポート
import MarkdownIt from 'markdown-it';
// lucide-reactから送信アイコンをインポート
import { SendIcon, Trash2Icon } from 'lucide-react';
// データベース関連のインポート
import { getAllMessagesChronological, saveMessage, clearAllMessages } from '../db/db';

// マークダウンパーサーを初期化
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true  // 改行をbrタグに変換
})

// APIレスポンスの構造を修正
interface ApiResponse {
  response: LLMResponse;
}

const ChatApp = () => {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string, llmResponse?: LLMResponse }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  // 初期化時にIndexedDBからチャット履歴を読み込む
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const savedMessages = await getAllMessagesChronological();
        if (savedMessages && savedMessages.length > 0) {
          const formattedMessages = savedMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
            llmResponse: msg.llmResponse
          }));
          setMessages(formattedMessages);
        }
      } catch (error) {
        console.error('チャット履歴の読み込みに失敗しました:', error);
      }
    };

    loadMessages();
  }, []);

  // 自動スクロール - メッセージが追加されたらスクロール
  useEffect(() => {
    if (messageEndRef.current) {
      // モバイルSafariなどでもスクロールが確実に効くように複数の方法でスクロール
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
      
      // 少し遅延させてスクロールを確実にする
      setTimeout(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'auto'
        });
        
        // messageEndRefの要素も表示範囲内に入れる
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages]);

  // メッセージ送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // ユーザーメッセージをチャットに追加
    const userMessage = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    
    // ユーザーメッセージをIndexedDBに保存
    try {
      await saveMessage(userMessage);
    } catch (error) {
      console.error('メッセージの保存に失敗しました:', error);
    }
    
    setInput('');
    setLoading(true);

    try {
      // 直近のメッセージを取得（最大2つ - 直前のAIの応答とユーザーの直前の質問）
      const recentMessages = messages.slice(-2);
      
      // 直近のメッセージを文字列化
      let context = '';
      if (recentMessages.length > 0) {
        context = recentMessages.map(msg => `${msg.role}: ${msg.content}`).join(' | ');
      }
      
      // APIリクエスト
      const response = await fetch(`https://bunfree-api.ushida-yosei.workers.dev/?message=${encodeURIComponent(input + " [前回の会話: " + context + "]")}`);

      // レスポンスが正常かチェック
      if (!response.ok) {
        throw new Error(`APIエラー: ${response.status} ${response.statusText}`);
      }

      // レスポンスボディをテキストとして取得
      const responseText = await response.text();
      console.log('Raw API Response:', responseText);

      // JSONとしてパース
      let parsedData: ApiResponse;
      try {
        parsedData = JSON.parse(responseText) as ApiResponse;
      } catch (e) {
        console.error('JSONパースエラー:', e);
        throw new Error('APIからの応答が正しいJSON形式ではありません');
      }

      console.log('Parsed API Response:', parsedData);

      // データの構造を確認（responseプロパティの存在確認）
      if (!parsedData || !parsedData.response) {
        throw new Error('APIレスポンスが正しい形式ではありません');
      }

      // response内のデータを取得
      const data = parsedData.response;

      // デフォルト値を設定
      const safeData: LLMResponse = {
        message: data.message || 'メッセージがありません',
        boothResults: Array.isArray(data.boothResults) ? data.boothResults : [],
        itemResults: Array.isArray(data.itemResults) ? data.itemResults : []
      };

      console.log('Safe data for UI:', safeData);
      console.log('Booth data count:', safeData.boothResults.length);

      // アシスタントの応答メッセージを作成
      const assistantMessage = {
        role: 'assistant' as const,
        content: safeData.message,
        llmResponse: safeData
      };

      // アシスタントの応答をチャットに追加
      setMessages(prev => [...prev, assistantMessage]);
      
      // アシスタントの応答をIndexedDBに保存
      try {
        await saveMessage(assistantMessage);
      } catch (error) {
        console.error('アシスタントメッセージの保存に失敗しました:', error);
      }
    } catch (error) {
      console.error('エラー:', error);
      // エラーメッセージを作成
      const errorMessage = {
        role: 'assistant' as const,
        content: `すみません、エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`
      };
      
      // エラーメッセージをチャットに追加
      setMessages(prev => [...prev, errorMessage]);
      
      // エラーメッセージをIndexedDBに保存
      try {
        await saveMessage(errorMessage);
      } catch (saveError) {
        console.error('エラーメッセージの保存に失敗しました:', saveError);
      }
    } finally {
      setLoading(false);
    }
  };

  // チャット履歴を消去
  const handleClearChat = async () => {
    if (window.confirm('チャット履歴を全て削除しますか？')) {
      try {
        await clearAllMessages();
        setMessages([]);
      } catch (error) {
        console.error('チャット履歴の削除に失敗しました:', error);
        alert('チャット履歴の削除に失敗しました');
      }
    }
  };

  return (
    <div className="chat-app">
      <div className="chat-container">
        <div className="chat-container-inner">
          <div className="chat-header">
            <h1>BunfreeChat</h1>
            {messages.length > 0 && (
              <button 
                className="clear-chat-button" 
                onClick={handleClearChat}
                aria-label="チャット履歴を消去"
              >
                <Trash2Icon size={16} />
              </button>
            )}
          </div>
          <div className="message-list">
            {messages.length === 0 && (
              <div className="empty-state">
                「青春」や「文フリはいつ開催？」などのキーワードで質問してみてください！
              </div>
            )}

            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.role}`}>
                <div className="message-content">
                  {msg.role === 'assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: md.render(msg.content) }} />
                  ) : (
                    msg.content
                  )}
                </div>

                {/* LLMレスポンスに含まれるブースデータがあれば地図を表示 */}
                {msg.llmResponse &&
                  ((msg.llmResponse.boothResults && msg.llmResponse.boothResults.length > 0) ||
                    (msg.llmResponse.itemResults && msg.llmResponse.itemResults.length > 0)) && (
                    <>
                      <div className="map-label">ブースの場所を地図で表示しています↓</div>
                      <MapViewer
                        boothResults={msg.llmResponse.boothResults || []}
                        itemResults={msg.llmResponse.itemResults || []}
                      />
                    </>
                  )}
              </div>
            ))}

            {/* ローディングインジケータ */}
            {loading && (
              <div className="message assistant">
                <div className="loading-indicator">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>
            )}

            {/* スクロール用の参照ポイント - 常に表示 */}
            <div ref={messageEndRef} className="scroll-marker" />
          </div>
        </div>
        <form className="input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="メッセージを入力..."
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()} aria-label="送信">
            <SendIcon size={24} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatApp; 