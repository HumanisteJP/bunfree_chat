import os
import json
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models
import voyageai
import sqlite3

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

def get_booth_items(booth_id):
    """指定したブースのアイテムを取得する"""
    conn = get_database_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM items WHERE booth_id = ?
    ''', (booth_id,))
    items = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return items

def get_booth_by_id(booth_id):
    """指定したIDのブースを取得する"""
    conn = get_database_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM booths WHERE id = ?
    ''', (booth_id,))
    booth = dict(cursor.fetchone()) if cursor.fetchone() else None
    conn.close()
    return booth

def search_by_vector(query, collection="booths", limit=10):
    """ベクトル検索を実行する"""
    # クエリをベクトル化
    query_vector = voyage.embed(texts=[query], model="voyage-large-2").embeddings[0]
    
    # ベクトル検索の実行
    search_result = qdrant.search(
        collection_name=collection,
        query_vector=query_vector,
        limit=limit
    )
    
    results = []
    for hit in search_result:
        item = hit.payload
        item['score'] = hit.score
        
        # ブースコレクションの場合、アイテム情報を追加
        if collection == "booths":
            items = get_booth_items(item['id'])
            item['items'] = items
        
        # アイテムコレクションの場合、ブース情報を追加（既に含まれている場合は不要）
        if collection == "items" and 'booth_id' in item:
            if 'booth_name' not in item:  # 結合クエリで取得していない場合
                booth = get_booth_by_id(item['booth_id'])
                if booth:
                    item['booth'] = booth
        
        results.append(item)
    
    return results

def search_by_text(field, value, collection="booths", limit=10):
    """テキスト検索を実行する"""
    # フィルター条件の設定
    filter_condition = models.Filter(
        must=[
            models.FieldCondition(
                key=f"payload.{field}",
                match=models.MatchValue(value=value)
            )
        ]
    )
    
    # テキスト検索の実行
    search_result = qdrant.scroll(
        collection_name=collection,
        scroll_filter=filter_condition,
        limit=limit
    )
    
    results = []
    for hit in search_result[0]:
        item = hit.payload
        
        # ブースコレクションの場合、アイテム情報を追加
        if collection == "booths":
            items = get_booth_items(item['id'])
            item['items'] = items
        
        # アイテムコレクションの場合、ブース情報を追加（既に含まれている場合は不要）
        if collection == "items" and 'booth_id' in item:
            if 'booth_name' not in item:  # 結合クエリで取得していない場合
                booth = get_booth_by_id(item['booth_id'])
                if booth:
                    item['booth'] = booth
        
        results.append(item)
    
    return results

def search(query_type, query, collection="booths", field=None, limit=10):
    """検索を実行する"""
    if query_type == "vector":
        return search_by_vector(query, collection, limit)
    elif query_type == "text":
        if not field:
            raise ValueError("テキスト検索にはフィールド名が必要です")
        return search_by_text(field, query, collection, limit)
    else:
        raise ValueError("無効な検索タイプです：vector または text を指定してください")

def main():
    # コマンドライン引数を使用した簡単な例
    import argparse
    
    parser = argparse.ArgumentParser(description='Qdrantでベクトル検索やテキスト検索を実行します。')
    parser.add_argument('--type', choices=['vector', 'text'], default='vector',
                        help='検索タイプ (vector または text)')
    parser.add_argument('--collection', choices=['booths', 'items'], default='booths',
                        help='検索するコレクション (booths または items)')
    parser.add_argument('--query', required=True, help='検索クエリ')
    parser.add_argument('--field', help='テキスト検索に使用するフィールド名 (例: name, twitter, instagram, author)')
    parser.add_argument('--limit', type=int, default=10, help='結果の最大数')
    
    args = parser.parse_args()
    
    try:
        results = search(args.type, args.query, args.collection, args.field, args.limit)
        print(json.dumps(results, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"エラーが発生しました: {e}")

if __name__ == "__main__":
    main() 