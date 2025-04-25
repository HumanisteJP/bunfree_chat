import React, { useState, useEffect, useRef } from 'react';
import { BoothResult, ItemResult } from '../types';
import { Heart } from 'lucide-react';
import { addFavoriteBooth, removeFavoriteBooth, isFavoriteBooth } from '../db/db';
import styles from './MapViewer.module.css';

interface MapViewerProps {
  boothResults: BoothResult[];
  itemResults?: ItemResult[];
  onBoothClick?: (booth: BoothResult['payload']) => void;
}

const MapViewer: React.FC<MapViewerProps> = ({ boothResults, itemResults = [], onBoothClick }) => {
  const [mapNumber, setMapNumber] = useState<number>(1); // デフォルトはmap_1.webp
  const [filteredBooths, setFilteredBooths] = useState<BoothResult[]>([]);
  const [filteredItemBooths, setFilteredItemBooths] = useState<any[]>([]);
  const [selectedBooth, setSelectedBooth] = useState<any>(null);
  const [closingBooth, setClosingBooth] = useState<any>(null);
  const [favoriteBooths, setFavoriteBooths] = useState<Record<number, boolean>>({});
  const [isTouchActive, setIsTouchActive] = useState<boolean>(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapViewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // タッチイベントがサポートされているかチェック
    const isTouchSupported = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // タッチデバイスの場合、hoverを無効化するためのクラスを追加
    if (isTouchSupported && mapViewerRef.current) {
      mapViewerRef.current.classList.add(styles['touch-device']);
    }
  }, []);

  useEffect(() => {
    // タップ操作時にhoverの疑似要素を非表示にする
    const container = mapContainerRef.current;
    if (container) {
      const handleTouchStart = () => setIsTouchActive(true);
      const handleMouseDown = () => setIsTouchActive(false);
      container.addEventListener('touchstart', handleTouchStart);
      container.addEventListener('mousedown', handleMouseDown);
      return () => {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('mousedown', handleMouseDown);
      };
    }
  }, []);

  // エリア名からマップ番号を判断する関数
  const getMapNumberFromArea = (area: string): number => {
    // ひらがな判定の正規表現
    const hiraganaPattern = /^[\u3040-\u309F]$/;
    return hiraganaPattern.test(area) ? 2 : 1;
  };

  // ブースをクリックしたときの処理
  const handleBoothClick = (booth: any, event: React.MouseEvent) => {
    // イベントの伝播を止める（マップクリックのイベントを発火させない）
    event.stopPropagation();
    
    // 同じブースを再度クリックした場合は詳細を閉じる
    if (selectedBooth && selectedBooth.id === booth.id) {
      handleCloseDetail();
      return;
    }
    
    // 他のブースが選択されていた場合、まず現在の選択を閉じる
    if (selectedBooth) {
      handleCloseDetail();
      // アニメーション完了後に新しいブースを選択するため、少し遅延させる
      setTimeout(() => {
        setSelectedBooth(booth);
        if (onBoothClick) {
          onBoothClick(booth);
        }
      }, 200); // アニメーション時間と同じ
    } else {
      // 選択したブースの情報を設定
      setSelectedBooth(booth);
      
      if (onBoothClick) {
        onBoothClick(booth);
      }
    }
  };
  
  // 詳細を閉じる処理
  const handleCloseDetail = () => {
    if (selectedBooth) {
      setClosingBooth(selectedBooth);
      setSelectedBooth(null);
      
      // アニメーション完了後に閉じたブース情報をクリア
      setTimeout(() => {
        setClosingBooth(null);
      }, 200); // アニメーション時間と同じ
    }
  };
  
  // 詳細内のクリックイベントの伝播を止める
  const handleDetailClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };
  
  // URLを開く処理を分離
  const openBoothUrl = (url: string, event: React.MouseEvent) => {
    event.stopPropagation(); // イベントの伝播を止める
    if (url) {
      window.open(url, '_blank');
    }
  };

  // お気に入り追加・削除の切り替え処理
  const toggleFavorite = async (booth: any, event: React.MouseEvent) => {
    event.stopPropagation(); // イベントの伝播を止める
    
    try {
      const isFavorite = favoriteBooths[booth.id];
      
      if (isFavorite) {
        // お気に入りから削除
        await removeFavoriteBooth(booth.id);
        setFavoriteBooths(prev => ({
          ...prev,
          [booth.id]: false
        }));
      } else {
        // お気に入りに追加
        await addFavoriteBooth(booth);
        setFavoriteBooths(prev => ({
          ...prev,
          [booth.id]: true
        }));
      }
    } catch (error) {
      console.error('お気に入り操作に失敗しました:', error);
    }
  };

  // マップがクリックされたときのハンドラー
  const handleMapClick = () => {
    // 詳細表示を閉じる
    handleCloseDetail();
  };

  // ドキュメント全体のクリックで詳細を閉じるためのイベントリスナーを追加
  useEffect(() => {
    // 詳細が選択されている時のみイベントを監視する
    if (selectedBooth) {
      const handleDocumentClick = (event: MouseEvent) => {
        // MapViewer以外の場所がクリックされた場合のみ詳細を閉じる
        if (mapViewerRef.current && !mapViewerRef.current.contains(event.target as Node)) {
          handleCloseDetail();
        }
      };
      
      // documentにクリックイベントリスナーを追加
      document.addEventListener('click', handleDocumentClick);
      
      // クリーンアップ関数（コンポーネントのアンマウント時に実行）
      return () => {
        document.removeEventListener('click', handleDocumentClick);
      };
    }
  }, [selectedBooth]); // selectedBoothが変更されたときに再実行

  // お気に入りステータスの取得
  useEffect(() => {
    const checkFavoriteStatus = async () => {
      const boothIds = new Set<number>();
      
      // ブースIDを収集
      boothResults.forEach(booth => {
        if (booth.payload.id) {
          boothIds.add(booth.payload.id);
        }
      });
      
      // アイテム検索結果からのブースIDも収集
      if (itemResults && itemResults.length > 0) {
        itemResults.forEach(item => {
          if (item.payload.booth_details?.id) {
            boothIds.add(item.payload.booth_details.id);
          }
        });
      }
      
      // 各ブースのお気に入りステータスを確認
      const favoriteStatus: Record<number, boolean> = {};
      
      for (const boothId of boothIds) {
        const isFavorite = await isFavoriteBooth(boothId);
        favoriteStatus[boothId] = isFavorite;
      }
      
      setFavoriteBooths(favoriteStatus);
    };
    
    checkFavoriteStatus();
  }, [boothResults, itemResults]);

  // デバッグ用：受け取ったブースデータをログに出力
  useEffect(() => {
    if (boothResults && boothResults.length > 0) {
      // ブースのエリアタイプをチェック
      const areaTypes = new Set<number>();
      
      boothResults.forEach(booth => {
        const area = booth.payload.area;
        const mapNum = getMapNumberFromArea(area);
        areaTypes.add(mapNum);
        
        // ブースのmap_numberを上書き
        booth.payload.map_number = mapNum;
      });
      
      // 最初は1番のマップを表示
      if (areaTypes.has(1)) {
        setMapNumber(1);
      } else if (areaTypes.has(2)) {
        setMapNumber(2);
      }
    }
  }, [boothResults, itemResults]);

  // 現在表示中のマップに対応するブースのみをフィルタリング
  useEffect(() => {
    if (boothResults) {
      const filtered = boothResults.filter(booth => {
        const area = booth.payload.area;
        return getMapNumberFromArea(area) === mapNumber;
      });
      setFilteredBooths(filtered);
    }

    // itemResultsからブース情報を抽出してフィルタリング
    if (itemResults && itemResults.length > 0) {
      const itemBooths = itemResults.map(item => ({
        id: item.payload.booth_details.id,
        booth: item.payload.booth_details
      }));
      
      // 重複を削除
      const uniqueItemBooths = Array.from(
        new Map(itemBooths.map(item => [item.id, item])).values()
      );
      
      // 現在のマップに対応するもののみをフィルタリング
      const filteredItems = uniqueItemBooths.filter(item => {
        const area = item.booth.area;
        return getMapNumberFromArea(area) === mapNumber;
      });
      
      setFilteredItemBooths(filteredItems);
    }
    
    // マップを切り替えたら選択状態をリセット
    handleCloseDetail();
  }, [boothResults, itemResults, mapNumber]);

  // ブースの詳細情報の表示
  const renderBoothDetail = (booth: any, isClosing: boolean) => {
    const isFavorite = favoriteBooths[booth.id] || false;
    
    return (
      <div className={`${styles["booth-detail"]} ${isClosing ? styles.closing : ''}`} onClick={handleDetailClick}>
        <div className={styles["booth-detail-header"]}>
          <button className={styles["close-button"]} onClick={handleCloseDetail}>×</button>
        </div>
        <div className={styles["booth-title-row"]}>
          <h3>{booth.name}</h3>
          <button 
            className={`${styles["favorite-button-map"]} ${isFavorite ? styles["is-favorite"] : ''}`}
            onClick={(e) => toggleFavorite(booth, e)}
            title={isFavorite ? "お気に入りから削除" : "お気に入りに追加"}
          >
            <Heart size={16} fill={isFavorite ? "#ff4d4d" : "none"} stroke="currentColor" />
          </button>
        </div>
        <p>{`${booth.area}-${booth.area_number}`}</p>
        {booth.description && <p className={styles["booth-description"]}>{booth.description}</p>}
        {booth.url && (
          <button className={styles["url-button"]} onClick={(e) => openBoothUrl(booth.url, e)}>
            文フリのページへ移動
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`${styles["map-viewer"]} ${isTouchActive ? styles["touch-active"] : ""}`} ref={mapViewerRef}>
      <div 
        className={styles["map-container"]} 
        ref={mapContainerRef}
        onClick={handleMapClick}
      >
        <img 
          src={`/map_${mapNumber}.webp`} 
          alt={`会場マップ ${mapNumber}`} 
          className={styles["map-image"]} 
        />
        
        {/* ブースのマーカーを表示 */}
        {filteredBooths.map((boothResult) => {
          const booth = boothResult.payload;
          const isSelected = selectedBooth && selectedBooth.id === booth.id;
          const isClosingThis = closingBooth && closingBooth.id === booth.id;
          return (
            <div 
              key={`booth-${booth.id}`}
              className={`${styles["booth-marker"]} ${isSelected ? styles.selected : ''} ${isClosingThis ? styles["closing-marker"] : ''}`}
              style={{
                top: `${booth.position_top * 100}%`,
                left: `${booth.position_left * 100}%`
              }}
              onClick={(e) => handleBoothClick(booth, e)}
              title={`${booth.area}-${booth.area_number}: ${booth.name}`}
            >
              {isSelected && renderBoothDetail(booth, false)}
              {isClosingThis && renderBoothDetail(booth, true)}
            </div>
          );
        })}

        {/* アイテム検索結果から取得したブースのマーカーを表示 */}
        {filteredItemBooths.map((item) => {
          const booth = item.booth;
          const isSelected = selectedBooth && selectedBooth.id === booth.id;
          const isClosingThis = closingBooth && closingBooth.id === booth.id;
          return (
            <div 
              key={`item-booth-${booth.id}`}
              className={`${styles["item-marker"]} ${isSelected ? styles.selected : ''} ${isClosingThis ? styles["closing-marker"] : ''}`}
              style={{
                top: `${booth.position_top * 100}%`,
                left: `${booth.position_left * 100}%`
              }}
              onClick={(e) => handleBoothClick(booth, e)}
              title={`${booth.area}-${booth.area_number}: ${booth.name}`}
            >
              {isSelected && renderBoothDetail(booth, false)}
              {isClosingThis && renderBoothDetail(booth, true)}
            </div>
          );
        })}
      </div>

      {/* 地図切り替えボタン */}
      <div className={styles["map-controls"]}>
        <button 
          className={mapNumber === 1 ? styles.active : ""} 
          onClick={() => setMapNumber(1)}
        >
          地図１（南１・２ホール）
        </button>
        <button 
          className={mapNumber === 2 ? styles.active : ""} 
          onClick={() => setMapNumber(2)}
        >
          地図２（南３・４ホール）
        </button>
      </div>
    </div>
  );
};

export default MapViewer;