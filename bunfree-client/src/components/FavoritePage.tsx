import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ChevronLeft, ExternalLink, ShoppingBag } from 'lucide-react';
import FavoriteMapViewer from './FavoriteMapViewer';
import { getAllFavoriteBooths, removeFavoriteBooth } from '../db/db';
import styles from './FavoritePage.module.css';

const FavoritePage: React.FC = () => {
  const [favoriteBooths, setFavoriteBooths] = useState<any[]>([]);
  const [selectedBooth, setSelectedBooth] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
  const openBoothUrl = (url: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  // 価格を日本円表示にフォーマット
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(price);
  };

  // 選択されたブースに関連するハンドラー
  const handleRemoveSelectedFavorite = () => {
    if (selectedBooth) {
      handleRemoveFavorite(selectedBooth.id);
    }
  };

  return (
    <div className={styles["favorite-page"]}>
      <div className={styles["favorite-header"]}>
        <Link to="/" className={styles["back-button"]}>
          <ChevronLeft size={24} />
        </Link>
        <h1>Favorite Booths</h1>
        <div className={styles["back-button-spacer"]}></div>
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

          {/* 選択したブースの詳細情報 */}
          <div className={styles["favorite-details-section"]}>
            <h2>選択したブースの詳細情報</h2>
            {selectedBooth ? (
              <div className={styles["favorite-list"]}>
                <div className={`${styles["favorite-item"]} ${styles["selected-booth-detail"]}`}>
                  <div className={`${styles["booth-info"]} ${styles["wide-info"]}`}>
                    <div className={styles["booth-detail-header"]}>
                      <h3>{selectedBooth.name}</h3>
                      <button 
                        className={styles["remove-favorite"]} 
                        onClick={handleRemoveSelectedFavorite}
                        aria-label="お気に入りから削除"
                      >
                        <Heart size={20} fill="#ff4d4d" color="#ff4d4d" />
                      </button>
                    </div>
                    
                    <p className={styles["booth-location"]}>{selectedBooth.area}-{selectedBooth.area_number}</p>
                    
                    {selectedBooth.description && (
                      <div className={styles["booth-detail-section"]}>
                        <p className={styles["section-label"]}>説明:</p>
                        <p className={styles["booth-description-full"]}>{selectedBooth.description}</p>
                      </div>
                    )}
                    
                    {selectedBooth.items && selectedBooth.items.length > 0 ? (
                      <div className={styles["booth-detail-section"]}>
                        <p className={styles["section-label"]}>販売商品:</p>
                        <div className={styles["items-list"]}>
                          {selectedBooth.items.map((item: any) => (
                            <div className={styles["item-card"]} key={item.id}>
                              <div className={styles["item-header"]}>
                                <ShoppingBag size={14} />
                                <span className={styles["item-name"]}>{item.name}</span>
                              </div>
                              <div className={styles["item-details"]}>
                                <p><span>ジャンル:</span> {item.genre}</p>
                                <p><span>著者:</span> {item.author}</p>
                                <p><span>形式:</span> {item.item_type}</p>
                                {item.page_count > 0 && <p><span>ページ数:</span> {item.page_count}ページ</p>}
                                {item.price > 0 && <p><span>価格:</span> {formatPrice(item.price)}</p>}
                                {item.description && <p className={styles["item-description"]}><span>説明:</span> {item.description}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className={styles["booth-detail-section"]}>
                        <p className={styles["section-label"]}>販売商品:</p>
                        <p className={styles["no-items-message"]}>チャットでの検索結果に販売商品が含まれていなかったようです。文フリのページを確認してください。</p>
                      </div>
                    )}
                    
                    {selectedBooth.url && (
                      <div className={styles["booth-detail-section"]}>
                        <button className={styles["booth-url-button"]} onClick={() => openBoothUrl(selectedBooth.url)}>
                          <ExternalLink size={18} />
                          <span>文フリのページへ移動</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles["placeholder-message"]}>
                <p>ブースを選択すると、詳細情報がここに表示されます</p>
              </div>
            )}
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
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FavoritePage; 