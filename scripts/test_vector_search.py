import os
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models
import voyageai

# 環境変数の読み込み
load_dotenv()

# API KEYの取得
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")

# Qdrantクライアントの初期化
qdrant = QdrantClient(
    url="https://0302bb4c-aef5-4d84-8669-259bd1cdfaa0.eu-west-2-0.aws.cloud.qdrant.io",
    api_key=QDRANT_API_KEY,
    timeout=60.0  # タイムアウトを1分に設定
)

# VoyageAIクライアントの初期化
voyage = voyageai.Client(api_key=VOYAGE_API_KEY)

# 使用するモデルとディメンションの設定
EMBEDDING_MODEL = "voyage-3-large"
EMBEDDING_DIMENSION = 2048

def search_booths(query_text, limit=5):
    """ブースをベクトル検索する"""
    print(f"\n【ブース検索】クエリ: '{query_text}'")
    
    # クエリをベクトル化
    query_vector = voyage.embed(
        texts=[query_text],
        model=EMBEDDING_MODEL,
        output_dimension=EMBEDDING_DIMENSION,
        truncation=True
    ).embeddings[0]
    
    # ベクトル検索を実行
    search_result = qdrant.search(
        collection_name="booths",
        query_vector=query_vector,
        limit=limit
    )
    
    print(f"\n検索結果（{len(search_result)}件）:")
    for i, hit in enumerate(search_result, 1):
        booth = hit.payload
        score = hit.score
        
        print(f"\n[{i}] スコア: {score:.4f}")
        print(f"ブース名: {booth.get('name', '不明')}")
        print(f"エリア: {booth.get('area', '不明')} {booth.get('area_number', '')}")
        print(f"カテゴリ: {booth.get('category', '不明')}")
        if booth.get('description'):
            description = booth['description']
            if len(description) > 100:
                description = description[:100] + "..."
            print(f"説明: {description}")
        
        # アイテム情報を表示（最大3つまで）
        if booth.get('items') and len(booth['items']) > 0:
            print("主な頒布物:")
            for j, item in enumerate(booth['items'][:3], 1):
                print(f"  - {item.get('name', '不明')}")
    
    return search_result

def search_items(query_text, limit=5):
    """アイテムをベクトル検索する"""
    print(f"\n【アイテム検索】クエリ: '{query_text}'")
    
    # クエリをベクトル化
    query_vector = voyage.embed(
        texts=[query_text],
        model=EMBEDDING_MODEL,
        output_dimension=EMBEDDING_DIMENSION,
        truncation=True
    ).embeddings[0]
    
    # ベクトル検索を実行
    search_result = qdrant.search(
        collection_name="items",
        query_vector=query_vector,
        limit=limit
    )
    
    print(f"\n検索結果（{len(search_result)}件）:")
    for i, hit in enumerate(search_result, 1):
        item = hit.payload
        score = hit.score
        
        print(f"\n[{i}] スコア: {score:.4f}")
        print(f"アイテム名: {item.get('name', '不明')}")
        print(f"ジャンル: {item.get('genre', '不明')}")
        print(f"著者: {item.get('author', '不明')}")
        print(f"タイプ: {item.get('item_type', '不明')}")
        print(f"ブース名: {item.get('booth_name', '不明')}")
        
        if item.get('description'):
            description = item['description']
            if len(description) > 100:
                description = description[:100] + "..."
            print(f"説明: {description}")
    
    return search_result

def main():
    """メイン関数"""
    print("Qdrantベクトル検索テスト")
    
    try:
        # Qdrantの接続テスト
        collections = qdrant.get_collections()
        print(f"\n利用可能なコレクション: {[c.name for c in collections.collections]}")
        
        # コレクション情報の確認
        booths_info = qdrant.get_collection(collection_name="booths")
        items_info = qdrant.get_collection(collection_name="items")
        
        print(f"\nブースコレクション: {booths_info.points_count}件のデータ")
        print(f"アイテムコレクション: {items_info.points_count}件のデータ")
        
        # 検索テスト実行
        while True:
            print("\n" + "="*50)
            print("検索タイプを選択してください:")
            print("1: ブース検索")
            print("2: アイテム検索")
            print("q: 終了")
            
            choice = input("\n選択 (1/2/q): ").strip().lower()
            
            if choice == 'q':
                break
            
            query = input("検索クエリを入力してください: ")
            
            if not query:
                print("クエリが空です。もう一度入力してください。")
                continue
            
            limit = input("表示件数を入力してください (デフォルト: 5): ")
            try:
                limit = int(limit) if limit else 5
            except ValueError:
                limit = 5
                print("不正な値です。デフォルトの5件を使用します。")
            
            if choice == '1':
                search_booths(query, limit)
            elif choice == '2':
                search_items(query, limit)
            else:
                print("不正な選択です。もう一度選択してください。")
    
    except Exception as e:
        print(f"エラーが発生しました: {e}")

if __name__ == "__main__":
    main() 