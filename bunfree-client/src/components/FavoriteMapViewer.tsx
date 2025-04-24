import React, { useState, useEffect, useRef } from 'react';
import mapStyles from './MapViewer.module.css';
import styles from './FavoriteMapViewer.module.css';

interface FavoriteMapViewerProps {
  favoriteBooths: any[];
  onBoothClick?: (booth: any) => void;
  selectedBooth: any | null;
}

const FavoriteMapViewer: React.FC<FavoriteMapViewerProps> = ({ favoriteBooths, onBoothClick, selectedBooth }) => {
  const [mapNumber, setMapNumber] = useState<number>(1); // デフォルトはmap_1.webp
  const [filteredBooths, setFilteredBooths] = useState<any[]>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapViewerRef = useRef<HTMLDivElement>(null);

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
    
    // 親コンポーネントにブース情報を渡す
    if (onBoothClick) {
      onBoothClick(booth);
    }
  };
  
  // マップがクリックされたときのハンドラー
  const handleMapClick = () => {
    // 選択状態をリセット
    if (onBoothClick) {
      onBoothClick(null);
    }
  };

  // お気に入りブースの処理とマップフィルタリング
  useEffect(() => {
    if (favoriteBooths && favoriteBooths.length > 0) {
      // マップごとのブース数をカウント
      const map1Booths = favoriteBooths.filter(item => 
        getMapNumberFromArea(item.boothData.area) === 1
      );
      const map2Booths = favoriteBooths.filter(item => 
        getMapNumberFromArea(item.boothData.area) === 2
      );
      
      // より多くのブースがあるマップを初期表示する
      if (map1Booths.length >= map2Booths.length) {
        setMapNumber(1);
      } else {
        setMapNumber(2);
      }
    }
  }, [favoriteBooths]);

  // 選択されたブースに基づいてマップを切り替え
  useEffect(() => {
    if (selectedBooth) {
      const boothMapNumber = getMapNumberFromArea(selectedBooth.area);
      if (boothMapNumber !== mapNumber) {
        setMapNumber(boothMapNumber);
      }
    }
  }, [selectedBooth]);

  // 現在表示中のマップに対応するブースのみをフィルタリング
  useEffect(() => {
    if (favoriteBooths) {
      const filtered = favoriteBooths.filter(item => 
        getMapNumberFromArea(item.boothData.area) === mapNumber
      );
      setFilteredBooths(filtered);
    }
  }, [favoriteBooths, mapNumber]);

  return (
    <div className={`${mapStyles["map-viewer"]} ${styles["favorite-map-viewer"]}`} ref={mapViewerRef}>
      <div 
        className={mapStyles["map-container"]} 
        ref={mapContainerRef}
        onClick={handleMapClick}
      >
        <img 
          src={`/map_${mapNumber}.webp`} 
          alt={`会場マップ ${mapNumber}`} 
          className={mapStyles["map-image"]} 
        />
        
        {/* お気に入りブースのマーカーを表示 */}
        {filteredBooths.map((item) => {
          const booth = item.boothData;
          const isSelected = selectedBooth && selectedBooth.id === booth.id;
          return (
            <div 
              key={`fav-booth-${booth.id}`}
              className={`${styles["favorite-marker"]} ${isSelected ? styles.selected : ''}`}
              style={{
                top: `${booth.position_top * 100}%`,
                left: `${booth.position_left * 100}%`
              }}
              onClick={(e) => handleBoothClick(booth, e)}
              title={`${booth.area}-${booth.area_number}: ${booth.name}`}
            >
              {(selectedBooth === null || isSelected) && (
                <div className={styles["favorite-marker-label"]}>
                  {booth.name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 地図切り替えボタン */}
      <div className={mapStyles["map-controls"]}>
        <button 
          className={mapNumber === 1 ? mapStyles.active : ""} 
          onClick={() => setMapNumber(1)}
        >
          地図１（南１・２ホール）
        </button>
        <button 
          className={mapNumber === 2 ? mapStyles.active : ""} 
          onClick={() => setMapNumber(2)}
        >
          地図２（南３・４ホール）
        </button>
      </div>
    </div>
  );
};

export default FavoriteMapViewer; 