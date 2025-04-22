import React, { useState, useEffect, useRef } from 'react';
import { BoothResult, ItemResult } from '../types';
import './MapViewer.css';

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
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

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
      setIsClosing(true);
      setSelectedBooth(null);
      
      // アニメーション完了後に閉じたブース情報をクリア
      setTimeout(() => {
        setClosingBooth(null);
        setIsClosing(false);
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

  // マップがクリックされたときのハンドラー
  const handleMapClick = () => {
    // 詳細表示を閉じる
    handleCloseDetail();
  };

  // デバッグ用：受け取ったブースデータをログに出力
  useEffect(() => {
    console.log('MapViewer received boothResults:', boothResults);
    console.log('MapViewer received itemResults:', itemResults);
    
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
      
      console.log('Detected area types:', Array.from(areaTypes));
      
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
      console.log(`Filtered booths for map ${mapNumber}:`, filtered.length);
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
      console.log(`Filtered item booths for map ${mapNumber}:`, filteredItems.length);
    }
    
    // マップを切り替えたら選択状態をリセット
    handleCloseDetail();
  }, [boothResults, itemResults, mapNumber]);

  // ブースの詳細情報の表示
  const renderBoothDetail = (booth: any, isClosing: boolean) => {
    return (
      <div className={`booth-detail ${isClosing ? 'closing' : ''}`} onClick={handleDetailClick}>
        <button className="close-button" onClick={handleCloseDetail}>×</button>
        <h3>{booth.name}</h3>
        <p>{`${booth.area}-${booth.area_number}`}</p>
        {booth.description && <p className="booth-description">{booth.description}</p>}
        {booth.url && (
          <button className="url-button" onClick={(e) => openBoothUrl(booth.url, e)}>
            文フリのサイトへ移動
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="map-viewer">
      <div 
        className="map-container" 
        ref={mapContainerRef}
        onClick={handleMapClick}
      >
        <img 
          src={`/map_${mapNumber}.webp`} 
          alt={`会場マップ ${mapNumber}`} 
          className="map-image" 
        />
        
        {/* ブースのマーカーを表示 */}
        {filteredBooths.map((boothResult) => {
          const booth = boothResult.payload;
          const isSelected = selectedBooth && selectedBooth.id === booth.id;
          const isClosingThis = closingBooth && closingBooth.id === booth.id;
          return (
            <div 
              key={`booth-${booth.id}`}
              className={`booth-marker ${isSelected ? 'selected' : ''} ${isClosingThis ? 'closing-marker' : ''}`}
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
              className={`item-marker ${isSelected ? 'selected' : ''} ${isClosingThis ? 'closing-marker' : ''}`}
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
      <div className="map-controls">
        <button 
          className={mapNumber === 1 ? "active" : ""} 
          onClick={() => setMapNumber(1)}
        >
          地図１（南１・２ホール）
        </button>
        <button 
          className={mapNumber === 2 ? "active" : ""} 
          onClick={() => setMapNumber(2)}
        >
          地図２（南３・４ホール）
        </button>
      </div>
    </div>
  );
};

export default MapViewer; 