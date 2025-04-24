import { useState, useEffect } from 'react';
import styles from './PWAInstallPrompt.module.css';

// PWAインストールプロンプトコンポーネント
const PWAInstallPrompt = () => {
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // beforeinstallpromptイベントをリッスン
    const handleBeforeInstallPrompt = (e: Event) => {
      // Chromeのデフォルトインストールプロンプトを防止
      e.preventDefault();
      // イベントを保存
      setDeferredPrompt(e);
      // インストール可能フラグを設定
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // インストール済みかチェック
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // インストールプロンプトを表示
    deferredPrompt.prompt();
    
    // ユーザーの選択を待つ
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('アプリがインストールされました');
    } else {
      console.log('インストールはキャンセルされました');
    }
    
    // プロンプトは一度しか使えないので、null に設定
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  if (!isInstallable) return null;

  return (
    <div className={styles.installPrompt}>
      <div className={styles.promptContent}>
        <div className={styles.promptText}>
          <h3>BunfreeChatをインストール</h3>
          <p>より良い体験のために、ホーム画面に追加できます！</p>
        </div>
        <button 
          className={styles.installButton}
          onClick={handleInstallClick}
        >
          インストール
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt; 