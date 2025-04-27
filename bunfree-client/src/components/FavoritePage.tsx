import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ChevronLeft, ExternalLink } from 'lucide-react';
import FavoriteMapViewer from './FavoriteMapViewer';
import { getAllFavoriteBooths, removeFavoriteBooth } from '../db/db';
import styles from './FavoritePage.module.css';
// ヘッダーコンポーネントをインポート
import HeaderComponent from './HeaderComponent';
// GoogleアナリティクスのインポートGAを追加
import ReactGA from 'react-ga4';

const FavoritePage: React.FC = () => {
  const [favoriteBooths, setFavoriteBooths] = useState<any[]>([]);
  const [selectedBooth, setSelectedBooth] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  useEffect(() => {
    // お気に入りブースのデータを取得
    const loadFavorites = async () => {
      try {
        setLoading(true);
        const booths = await getAllFavoriteBooths();
        setFavoriteBooths(booths);
      } catch (error) {
        console.error('お気に入り情報の取得に失敗しました:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFavorites();
  }, []);

  // ブースがクリックされたときの処理
  const handleBoothClick = (booth: any) => {
    console.log('選択されたブース:', booth); // デバッグ用
    
    // 既に選択されているブースが再クリックされた場合は選択解除
    if (selectedBooth && booth && selectedBooth.id === booth.id) {
      setSelectedBooth(null);
    } else {
      setSelectedBooth(booth);
    }
  };

  // お気に入りから削除する処理
  const handleRemoveFavorite = async (boothId: number) => {
    if (window.confirm('このブースをお気に入りから削除しますか？')) {
      try {
        await removeFavoriteBooth(boothId);
        // 削除後リストを更新
        setFavoriteBooths(prevBooths => prevBooths.filter(item => item.boothId !== boothId));
        
        // 選択中のブースが削除された場合、選択を解除
        if (selectedBooth && selectedBooth.id === boothId) {
          setSelectedBooth(null);
        }
      } catch (error) {
        console.error('お気に入りの削除に失敗しました:', error);
      }
    }
  };

  // URLを開く処理
  const openBoothUrl = (url: string, booth: any) => {
    if (url) {
      // Google Analyticsでトラッキング
      ReactGA.event({
        category: 'FavoriteList',
        action: 'NavigateToBunfreePage',
        label: `Booth: ${booth.area}-${booth.area_number} ${booth.name}`
      });
      window.open(url, '_blank');
    }
  };

  // メインページに戻る
  const navigateToHome = () => {
    navigate('/');
  };

  return (
    <div className={styles["favorite-page"]}>
      {/* ヘッダーをラッパーで囲む */}
      <div className={styles["header-wrapper"]}>
        <HeaderComponent
          title="Favorite Booths"
          leftButton={{
            icon: <ChevronLeft size={24} />,
            onClick: navigateToHome,
            ariaLabel: "メインページに戻る"
          }}
        />
      </div>

      {loading ? (
        <div className={styles["loading-container"]}>
          <p>お気に入り情報を読み込み中...</p>
        </div>
      ) : favoriteBooths.length === 0 ? (
        <div className={styles["empty-favorites"]}>
          <p>お気に入りに登録されたブースはありません。</p>
          <p>チャットでブースを検索して、ハートマークをクリックするとお気に入りに追加できます。</p>
        </div>
      ) : (
        <>
          <div className={styles["favorite-map-section"]}>
            <FavoriteMapViewer 
              favoriteBooths={favoriteBooths} 
              onBoothClick={handleBoothClick}
              selectedBooth={selectedBooth}
            />
          </div>

          <div className={styles["favorite-details-section"]}>
            <h2>お気に入りブース一覧</h2>
            <div className={styles["favorite-list"]}>
              {favoriteBooths.map(item => (
                <div 
                  key={item.boothId} 
                  className={`${styles["favorite-item"]} ${selectedBooth && selectedBooth.id === item.boothData.id ? styles.selected : ''}`}
                  onClick={() => handleBoothClick(item.boothData)}
                >
                  <div className={styles["booth-container"]}>
                    <div className={styles["booth-info"]}>
                      <h3>{item.boothData.name}</h3>
                      <p className={styles["booth-location"]}>{item.boothData.area}-{item.boothData.area_number}</p>
                      {item.boothData.description && (
                        <p className={styles["booth-description"]}>{item.boothData.description}</p>
                      )}
                    </div>
                    <button 
                      className={styles["remove-favorite"]} 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFavorite(item.boothId);
                      }}
                      aria-label="お気に入りから削除"
                    >
                      <Heart size={20} fill="#ff4d4d" color="#ff4d4d" />
                    </button>
                  </div>
                  <div className={styles["booth-actions"]}>
                    {item.boothData.url && (
                      <button 
                        className={styles["booth-url-button"]} 
                        onClick={(e) => {
                          e.stopPropagation();
                          openBoothUrl(item.boothData.url, item.boothData);
                        }}
                      >
                        <ExternalLink size={16} />
                        <span>文フリのページへ移動</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FavoritePage; 