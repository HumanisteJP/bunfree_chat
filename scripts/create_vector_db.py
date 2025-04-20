import os
import sqlite3
import json
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
qdrant = QdrantClient(api_key=QDRANT_API_KEY)

# VoyageAIクライアントの初期化
voyage = voyageai.Client(api_key=VOYAGE_API_KEY)

def get_database_connection():
    """データベース接続を取得する"""
    conn = sqlite3.connect('bunfree.db')
    conn.row_factory = sqlite3.Row
    return conn

def fetch_booths():
    """ブースデータを取得する"""
    conn = get_database_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM booths
    ''')
    booths = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return booths

def fetch_items():
    """アイテムデータを取得する"""
    conn = get_database_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT i.*, b.name as booth_name, b.area as booth_area, b.area_number as booth_area_number 
        FROM items i
        JOIN booths b ON i.booth_id = b.id
    ''')
    items = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return items

def prepare_booth_vectors(booths):
    """ブースデータをベクトル化する準備をする"""
    booth_texts = []
    for booth in booths:
        # ベクトル化するテキストを作成
        text = f"ブース名: {booth['name'] or ''}\n"
        text += f"読み: {booth['yomi'] or ''}\n"
        text += f"カテゴリ: {booth['category'] or ''}\n"
        text += f"エリア: {booth['area'] or ''} {booth['area_number'] or ''}\n"
        text += f"メンバー: {booth['members'] or ''}\n"
        text += f"説明: {booth['description'] or ''}\n"
        
        booth_texts.append(text)
    
    # Voyage AIでベクトル化
    embeddings = voyage.embed(texts=booth_texts, model="voyage-large-2").embeddings
    
    # ベクトルデータとブースデータを紐づける
    vectorized_booths = []
    for i, booth in enumerate(booths):
        vectorized_booths.append({
            "id": booth["id"],
            "vector": embeddings[i],
            "payload": booth
        })
    
    return vectorized_booths

def prepare_item_vectors(items):
    """アイテムデータをベクトル化する準備をする"""
    item_texts = []
    for item in items:
        # ベクトル化するテキストを作成
        text = f"アイテム名: {item['name'] or ''}\n"
        text += f"読み: {item['yomi'] or ''}\n"
        text += f"ジャンル: {item['genre'] or ''}\n"
        text += f"著者: {item['author'] or ''}\n"
        text += f"アイテムタイプ: {item['item_type'] or ''}\n"
        text += f"ページ数: {item['page_count'] or ''}\n"
        text += f"説明: {item['description'] or ''}\n"
        text += f"ブース名: {item['booth_name'] or ''}\n"
        
        item_texts.append(text)
    
    # Voyage AIでベクトル化
    embeddings = voyage.embed(texts=item_texts, model="voyage-large-2").embeddings
    
    # ベクトルデータとアイテムデータを紐づける
    vectorized_items = []
    for i, item in enumerate(items):
        vectorized_items.append({
            "id": item["id"],
            "vector": embeddings[i],
            "payload": item
        })
    
    return vectorized_items

def create_collections():
    """Qdrantにコレクションを作成する"""
    # ブースコレクションの作成
    qdrant.recreate_collection(
        collection_name="booths",
        vectors_config=models.VectorParams(
            size=1024,  # voyage-large-2のベクトルサイズ
            distance=models.Distance.COSINE
        ),
        on_disk_payload=True
    )
    
    # アイテムコレクションの作成
    qdrant.recreate_collection(
        collection_name="items",
        vectors_config=models.VectorParams(
            size=1024,  # voyage-large-2のベクトルサイズ
            distance=models.Distance.COSINE
        ),
        on_disk_payload=True
    )
    
    # ペイロードインデックスの作成（テキスト検索用）
    # ブースコレクション
    qdrant.create_payload_index(
        collection_name="booths",
        field_name="payload.name",
        field_schema=models.PayloadSchemaType.KEYWORD
    )
    qdrant.create_payload_index(
        collection_name="booths",
        field_name="payload.twitter",
        field_schema=models.PayloadSchemaType.KEYWORD
    )
    qdrant.create_payload_index(
        collection_name="booths",
        field_name="payload.instagram",
        field_schema=models.PayloadSchemaType.KEYWORD
    )
    
    # アイテムコレクション
    qdrant.create_payload_index(
        collection_name="items",
        field_name="payload.name",
        field_schema=models.PayloadSchemaType.KEYWORD
    )
    qdrant.create_payload_index(
        collection_name="items",
        field_name="payload.author",
        field_schema=models.PayloadSchemaType.KEYWORD
    )

def upload_vectors():
    """ベクトルデータをQdrantにアップロードする"""
    # ブースデータの取得
    booths = fetch_booths()
    print(f"{len(booths)}件のブースデータを取得しました")
    
    # アイテムデータの取得
    items = fetch_items()
    print(f"{len(items)}件のアイテムデータを取得しました")
    
    # ブースベクトルの作成
    booth_vectors = prepare_booth_vectors(booths)
    print(f"{len(booth_vectors)}件のブースベクトルを作成しました")
    
    # アイテムベクトルの作成
    item_vectors = prepare_item_vectors(items)
    print(f"{len(item_vectors)}件のアイテムベクトルを作成しました")
    
    # コレクションの作成
    create_collections()
    print("コレクションを作成しました")
    
    # ブースベクトルのアップロード
    qdrant.upload_points(
        collection_name="booths",
        points=[
            models.PointStruct(
                id=b["id"],
                vector=b["vector"],
                payload=b["payload"]
            ) for b in booth_vectors
        ]
    )
    print("ブースベクトルをアップロードしました")
    
    # アイテムベクトルのアップロード
    qdrant.upload_points(
        collection_name="items",
        points=[
            models.PointStruct(
                id=i["id"],
                vector=i["vector"],
                payload=i["payload"]
            ) for i in item_vectors
        ]
    )
    print("アイテムベクトルをアップロードしました")

if __name__ == "__main__":
    upload_vectors() 