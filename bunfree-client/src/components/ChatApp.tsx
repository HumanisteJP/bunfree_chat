import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LLMResponse } from '../types';
import MapViewer from './MapViewer';
import KofiButtonAnimated from './KofiButtonAnimated';
import styles from './ChatApp.module.css';
// markdown-itをインポート
import MarkdownIt from 'markdown-it';
// lucide-reactから必要なアイコンをインポート
import { SendIcon, Trash2Icon, BookHeart, Heart } from 'lucide-react';
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
  const navigate = useNavigate();

  // 質問例の配列を定義
  const genreExamples = [
    "青春",
    "恋愛",
    "ファンタジー",
    "SF",
    "ミステリー",
    "歴史",
    "哲学",
    "詩",
    "エッセイ",
    "ホラー"
  ];

  const bunfriExamples = [
    "文フリはいつ開催？",
    "初めての文フリ参加について教えて",
    "文フリのサークル申し込み方法は？",
    "文フリの持ち物リストを教えて",
    "文フリの人気ジャンルは？",
    "文フリの会場はどこ？",
    "文フリの当日の流れを教えて",
    "文フリでの本の値段相場は？",
    "文フリのイベントスペースについて",
    "文フリでの支払い方法は？"
  ];

  // ランダムな質問例を選択する
  const randomExample = useMemo(() => {
    const randomGenre = genreExamples[Math.floor(Math.random() * genreExamples.length)];
    const randomBunfri = bunfriExamples[Math.floor(Math.random() * bunfriExamples.length)];
    return `「${randomGenre}」や「${randomBunfri}」などのキーワードで質問してみてください！`;
  }, []);

  // サポートフレーズの配列を定義
  const supportPhrases = [
    "開発者のエナジードリンク代だよ〜ん",
    "コード書きすぎてキーボード壊れちゃった💦",
    "ピザ一枚で徹夜乗り切るよ！",
    "バグ退治隊に投げ銭する",
    "アイデア産みの苦しみを応援！",
    "夢を形にする魔法の一押し✨",
    "深夜のインスピレーションに燃料補給",
    "開発者のサンドイッチ代だけど、心は満タン！",
    "コーヒー一杯で天才が目覚める☕",
    "ラーメン一杯でコード百行！",
    "あなたの千円で私のアプリが動く",
    "『もうムリ』を『まだイケる』に変える魔法の支援",
    "プログラマーの夜食費だけど、あなたの夢のおかず♪",
    "バグ取りに付き合ってくれる猫の餌代",
    "あなたの応援がエラーを修正する！",
    "一杯の珈琲で起きる、コード革命",
    "ウィザードにネット代払ってあげる",
    "クリエイターの創造力にチャージ🔋",
    "眠気と闘う戦士に栄養ドリンクを",
    "あなたのおかげでプロジェクト進む進む〜♪",
    "イケてるプロジェクトを育てる水やり",
    "天才のひらめきに一票入れる",
    "クリエイターの背中を押す千円札",
    "開発者に『CONTINUE』のコイン",
    "アップデートの神様にお賽銭",
    "あなたの千円で世界が変わる、マジで！",
    "新機能追加の魔法の呪文",
    "夢見る開発者にエールを送る",
    "コーディングマラソンの給水ポイント",
    "あなたの応援が最強のデバッガー！"
  ];

  // Ko-fiボタンの色の配列
  const kofiColors = ['#FF6433', '#202020', '#E3D6C6', '#FFDA6E', '#C19BFF'];

  // ランダムなサポートフレーズを選択
  const randomSupportPhrase = useMemo(() => {
    return supportPhrases[Math.floor(Math.random() * supportPhrases.length)];
  }, [messages]);

  // ランダムなKo-fi色を選択
  const randomKofiColor = useMemo(() => {
    return kofiColors[Math.floor(Math.random() * kofiColors.length)];
  }, [messages]);

  // お気に入りページへ遷移
  const navigateToFavorites = () => {
    navigate('/favorites');
  };

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
    <div className={styles["chat-app"]}>
      <div className={styles["chat-container"]}>
        <div className={styles["chat-container-inner"]}>
          <div className={styles["chat-header"]}>
            <button
              className={styles["clear-chat-button"]}
              style={{ left: "20px", right: "auto" }}
              onClick={navigateToFavorites}
              aria-label="お気に入りを表示"
              title="お気に入りを表示"
            >
              <BookHeart size={16} />
            </button>
            <h1>BunfreeChat</h1>
            {messages.length > 0 && (
              <button 
                className={styles["clear-chat-button"]} 
                onClick={handleClearChat}
                aria-label="チャット履歴を消去"
                title="チャット履歴を消去"
              >
                <Trash2Icon size={16} />
              </button>
            )}
          </div>
          <div className={styles["message-list"]}>
            {messages.length === 0 && (
              <div className={styles["empty-state"]}>
                {randomExample}
              </div>
            )}

            {messages.map((msg, index) => (
              <div key={index} className={`${styles.message} ${styles[msg.role]}`}>
                <div className={styles["message-content"]}>
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
                      <div className={styles["map-label"]}>ブースの場所を地図で表示しています↓</div>
                      <MapViewer
                        boothResults={msg.llmResponse.boothResults || []}
                        itemResults={msg.llmResponse.itemResults || []}
                      />
                      
                      {/* お気に入りページへの誘導 */}
                      <div className={styles["favorite-link-container"]} onClick={navigateToFavorites}>
                        <div className={styles["favorite-link"]}>
                          <Heart size={20} className={styles["favorite-link-icon"]} fill="#ff4d4d" />
                          <span>気に入ったブースは「お気に入り」に追加できます！お気に入りページでまとめて確認できます</span>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {/* Ko-fiボタンの追加 */}
                  {index === messages.length - 1 && msg.role === 'assistant' && !loading && messages.length >= 2 && (
                    <div className={styles["kofi-container"]}>
                      <p className={styles["support-text"]}>{randomSupportPhrase}</p>
                      <KofiButtonAnimated kofiId="C0C81AQPW8" label="Support me on Ko-fi" color={randomKofiColor} />
                    </div>
                  )}
                  
              </div>
            ))}

            {/* ローディングインジケータ */}
            {loading && (
              <div className={`${styles.message} ${styles.assistant}`}>
                <div className={styles["loading-indicator"]}>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                </div>
              </div>
            )}

            {/* スクロール用の参照ポイント - 常に表示 */}
            <div ref={messageEndRef} className={styles["scroll-marker"]} />
          </div>
        </div>
        <form className={styles["input-form"]} onSubmit={handleSubmit}>
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