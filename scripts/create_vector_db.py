import os
import sqlite3
import json
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models
import voyageai
import pickle
import hashlib

# 環境変数の読み込み
load_dotenv()

# API KEYの取得
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")
QDRANT_URL = os.getenv("QDRANT_URL")

# Qdrantクライアントの初期化
qdrant = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY,
    timeout=300.0  # タイムアウトを5分に設定
)

# VoyageAIクライアントの初期化
voyage = voyageai.Client(api_key=VOYAGE_API_KEY)

# 使用するモデルとディメンションの設定
EMBEDDING_MODEL = "voyage-3-large"
EMBEDDING_DIMENSION = 2048

# キャッシュ関連の設定
CACHE_DIR = "cache"
# キャッシュディレクトリがなければ作成
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def get_cache_key(texts, model, output_dimension):
    """キャッシュのキーを生成する"""
    # テキストと設定からハッシュを生成
    text_hash = hashlib.md5("".join(texts).encode()).hexdigest()
    return f"{model}_{output_dimension}_{text_hash}"

def get_embeddings_from_cache(texts, model, output_dimension):
    """キャッシュから埋め込みベクトルを取得する"""
    cache_key = get_cache_key(texts, model, output_dimension)
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.pkl")
    
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'rb') as f:
                embeddings = pickle.load(f)
            print(f"キャッシュから{len(embeddings)}件の埋め込みベクトルを読み込みました")
            return embeddings
        except Exception as e:
            print(f"キャッシュの読み込みエラー: {e}")
    
    return None

def save_embeddings_to_cache(texts, model, output_dimension, embeddings):
    """埋め込みベクトルをキャッシュに保存する"""
    cache_key = get_cache_key(texts, model, output_dimension)
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.pkl")
    
    try:
        with open(cache_file, 'wb') as f:
            pickle.dump(embeddings, f)
        print(f"{len(embeddings)}件の埋め込みベクトルをキャッシュに保存しました")
        return True
    except Exception as e:
        print(f"キャッシュの保存エラー: {e}")
        return False

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

def fetch_booth_items(booth_id):
    """指定されたブースのアイテムを取得する"""
    conn = get_database_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM items WHERE booth_id = ?
    ''', (booth_id,))
    items = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return items

def prepare_booth_vectors(booths):
    """ブースデータをベクトル化する準備をする"""
    # APIの上限を考慮してバッチサイズを設定
    # トークン制限(120,000)に引っかからないよう、バッチサイズを縮小
    batch_size = 400
    vectorized_booths = []
    
    # 全ブースIDをファイルに保存（中断時の対策）
    booth_ids = [b['id'] for b in booths]
    with open(os.path.join(CACHE_DIR, 'booth_ids.json'), 'w') as f:
        json.dump(booth_ids, f)
    
    # 保存済みベクトルがあれば読み込む
    saved_vectors_file = os.path.join(CACHE_DIR, 'booth_vectors.pkl')
    if os.path.exists(saved_vectors_file):
        try:
            with open(saved_vectors_file, 'rb') as f:
                saved_vectors = pickle.load(f)
                print(f"{len(saved_vectors)}件の保存済みブースベクトルを読み込みました")
                
                # 処理済みのIDを取得
                processed_ids = [v['id'] for v in saved_vectors]
                
                # 未処理のブースだけを抽出
                booths = [b for b in booths if b['id'] not in processed_ids]
                
                # 既に処理済みのベクトルを追加
                vectorized_booths.extend(saved_vectors)
                
                print(f"残り{len(booths)}件のブースを処理します")
        except Exception as e:
            print(f"保存済みベクトルの読み込みエラー: {e}")
    
    # ブースをバッチに分割して処理
    for i in range(0, len(booths), batch_size):
        batch_booths = booths[i:i+batch_size]
        print(f"ブースバッチ処理中: {i+1}～{min(i+batch_size, len(booths))}/{len(booths)}")
        
        booth_texts = []
        for booth in batch_booths:
            # ベクトル化するテキストを作成（極力短くする）
            text = f"ブース名: {booth['name'] or ''}\n"
            text += f"読み: {booth['yomi'] or ''}\n"
            text += f"カテゴリ: {booth['category'] or ''}\n"
            text += f"エリア: {booth['area'] or ''} {booth['area_number'] or ''}\n"
            
            # 説明文は長くなりがちなので、適度に切り詰める
            description = booth['description'] or ''
            if len(description) > 500:  # 長すぎる説明文は切り詰める
                description = description[:500] + "..."
            text += f"説明: {description}\n"
            
            # 関連アイテムの情報も追加（少なめに）
            booth_items = fetch_booth_items(booth['id'])
            if booth_items:
                text += "主な頒布物:\n"
                for item in booth_items[:3]:  # 最大3つまでに制限
                    text += f"- {item['name'] or ''}\n"
            
            booth_texts.append(text)
        
        # 最大トークン数をチェック（概算）
        estimated_tokens = sum(len(text.split()) for text in booth_texts)
        print(f"推定トークン数: 約{estimated_tokens}（実際はこれより多い可能性あり）")
        
        # キャッシュから埋め込みベクトルを取得を試みる
        embeddings = get_embeddings_from_cache(booth_texts, EMBEDDING_MODEL, EMBEDDING_DIMENSION)
        
        # キャッシュになければVoyage AIでベクトル化
        if embeddings is None:
            print(f"Voyage APIで{len(booth_texts)}件のテキストをベクトル化します")
            try:
                embeddings = voyage.embed(
                    texts=booth_texts, 
                    model=EMBEDDING_MODEL,
                    output_dimension=EMBEDDING_DIMENSION,  # スペースを削除して正しいパラメータ名を使用
                    truncation=True  # 長いテキストも切り捨てずに処理
                ).embeddings
                
                # キャッシュに保存
                save_embeddings_to_cache(booth_texts, EMBEDDING_MODEL, EMBEDDING_DIMENSION, embeddings)
            except Exception as e:
                print(f"Voyage API呼び出しエラー: {e}")
                print("バッチサイズをさらに半分に縮小して再試行します")
                
                # バッチを半分に分割して再試行
                half_size = len(batch_booths) // 2
                for j in range(0, len(batch_booths), half_size):
                    sub_batch = batch_booths[j:j+half_size]
                    sub_texts = booth_texts[j:j+half_size]
                    print(f"小さいバッチで処理: {j+1}～{min(j+half_size, len(batch_booths))}/{len(batch_booths)}")
                    
                    # 小さいバッチでキャッシュをチェック
                    sub_embeddings = get_embeddings_from_cache(sub_texts, EMBEDDING_MODEL, EMBEDDING_DIMENSION)
                    
                    if sub_embeddings is None:
                        try:
                            sub_embeddings = voyage.embed(
                                texts=sub_texts, 
                                model=EMBEDDING_MODEL,
                                output_dimension=EMBEDDING_DIMENSION,
                                truncation=True
                            ).embeddings
                            
                            # キャッシュに保存
                            save_embeddings_to_cache(sub_texts, EMBEDDING_MODEL, EMBEDDING_DIMENSION, sub_embeddings)
                        except Exception as sub_e:
                            print(f"サブバッチでもエラー発生: {sub_e}")
                            # さらに小さいバッチに分割して処理
                            for k, text in enumerate(sub_texts):
                                print(f"1件ずつ処理: {k+1}/{len(sub_texts)}")
                                try:
                                    single_embedding = voyage.embed(
                                        texts=[text], 
                                        model=EMBEDDING_MODEL,
                                        output_dimension=EMBEDDING_DIMENSION,
                                        truncation=True
                                    ).embeddings[0]
                                    
                                    # 一時的に保存
                                    temp_file = os.path.join(CACHE_DIR, f"temp_booth_{batch_booths[j+k]['id']}.pkl")
                                    with open(temp_file, 'wb') as f:
                                        pickle.dump(single_embedding, f)
                                    
                                    # ブースデータを処理
                                    booth = batch_booths[j+k]
                                    booth_items = fetch_booth_items(booth['id'])
                                    booth_with_items = booth.copy()
                                    booth_with_items['items'] = booth_items
                                    
                                    vectorized_booths.append({
                                        "id": booth["id"],
                                        "vector": single_embedding,
                                        "payload": booth_with_items
                                    })
                                    
                                    # 途中結果を保存
                                    with open(saved_vectors_file, 'wb') as f:
                                        pickle.dump(vectorized_booths, f)
                                    print(f"現在までの{len(vectorized_booths)}件のブースベクトルを一時保存しました")
                                    
                                except Exception as e:
                                    print(f"個別処理でエラー発生（ブースID: {batch_booths[j+k]['id']}）: {e}")
                                    continue
                            continue
                        
                        # サブバッチ処理
                        for k, booth in enumerate(sub_batch):
                            booth_items = fetch_booth_items(booth['id'])
                            booth_with_items = booth.copy()
                            booth_with_items['items'] = booth_items
                            
                            vectorized_booths.append({
                                "id": booth["id"],
                                "vector": sub_embeddings[k],
                                "payload": booth_with_items
                            })
                        
                        # 途中結果を保存
                        with open(saved_vectors_file, 'wb') as f:
                            pickle.dump(vectorized_booths, f)
                        print(f"現在までの{len(vectorized_booths)}件のブースベクトルを一時保存しました")
                    else:
                        # キャッシュから取得したベクトルを使用
                        for k, booth in enumerate(sub_batch):
                            booth_items = fetch_booth_items(booth['id'])
                            booth_with_items = booth.copy()
                            booth_with_items['items'] = booth_items
                            
                            vectorized_booths.append({
                                "id": booth["id"],
                                "vector": sub_embeddings[k],
                                "payload": booth_with_items
                            })
                        
                        # 途中結果を保存
                        with open(saved_vectors_file, 'wb') as f:
                            pickle.dump(vectorized_booths, f)
                        print(f"現在までの{len(vectorized_booths)}件のブースベクトルを一時保存しました")
                
                # 次のメインバッチへ
                continue
        
        # ベクトルデータとブースデータを紐づける
        batch_vectorized_booths = []
        for j, booth in enumerate(batch_booths):
            # ブースの関連アイテムを取得
            booth_items = fetch_booth_items(booth['id'])
            # ペイロードに関連アイテム情報を追加
            booth_with_items = booth.copy()
            booth_with_items['items'] = booth_items
            
            batch_vectorized_booths.append({
                "id": booth["id"],
                "vector": embeddings[j],
                "payload": booth_with_items
            })
        
        # バッチごとに結果をリストに追加
        vectorized_booths.extend(batch_vectorized_booths)
        
        # 途中結果を保存（中断時の対策）
        with open(saved_vectors_file, 'wb') as f:
            pickle.dump(vectorized_booths, f)
        print(f"現在までの{len(vectorized_booths)}件のブースベクトルを一時保存しました")
    
    return vectorized_booths

def prepare_item_vectors(items):
    """アイテムデータをベクトル化する準備をする"""
    # APIの上限を考慮してバッチサイズを設定
    # トークン制限(120,000)に引っかからないよう、バッチサイズを縮小
    batch_size = 400
    vectorized_items = []
    
    # 全アイテムIDをファイルに保存（中断時の対策）
    item_ids = [i['id'] for i in items]
    with open(os.path.join(CACHE_DIR, 'item_ids.json'), 'w') as f:
        json.dump(item_ids, f)
    
    # 保存済みベクトルがあれば読み込む
    saved_vectors_file = os.path.join(CACHE_DIR, 'item_vectors.pkl')
    if os.path.exists(saved_vectors_file):
        try:
            with open(saved_vectors_file, 'rb') as f:
                saved_vectors = pickle.load(f)
                print(f"{len(saved_vectors)}件の保存済みアイテムベクトルを読み込みました")
                
                # 処理済みのIDを取得
                processed_ids = [v['id'] for v in saved_vectors]
                
                # 未処理のアイテムだけを抽出
                items = [i for i in items if i['id'] not in processed_ids]
                
                # 既に処理済みのベクトルを追加
                vectorized_items.extend(saved_vectors)
                
                print(f"残り{len(items)}件のアイテムを処理します")
        except Exception as e:
            print(f"保存済みベクトルの読み込みエラー: {e}")
    
    # アイテムをバッチに分割して処理
    for i in range(0, len(items), batch_size):
        batch_items = items[i:i+batch_size]
        print(f"アイテムバッチ処理中: {i+1}～{min(i+batch_size, len(items))}/{len(items)}")
        
        item_texts = []
        for item in batch_items:
            # ベクトル化するテキストを作成（極力短くする）
            text = f"アイテム名: {item['name'] or ''}\n"
            text += f"読み: {item['yomi'] or ''}\n"
            text += f"ジャンル: {item['genre'] or ''}\n"
            text += f"著者: {item['author'] or ''}\n"
            text += f"アイテムタイプ: {item['item_type'] or ''}\n"
            
            # 説明文は長くなりがちなので、適度に切り詰める
            description = item['description'] or ''
            if len(description) > 500:  # 長すぎる説明文は切り詰める
                description = description[:500] + "..."
            text += f"説明: {description}\n"
            
            text += f"ブース名: {item['booth_name'] or ''}\n"
            
            item_texts.append(text)
        
        # 最大トークン数をチェック（概算）
        estimated_tokens = sum(len(text.split()) for text in item_texts)
        print(f"推定トークン数: 約{estimated_tokens}（実際はこれより多い可能性あり）")
        
        # キャッシュから埋め込みベクトルを取得を試みる
        embeddings = get_embeddings_from_cache(item_texts, EMBEDDING_MODEL, EMBEDDING_DIMENSION)
        
        # キャッシュになければVoyage AIでベクトル化
        if embeddings is None:
            print(f"Voyage APIで{len(item_texts)}件のテキストをベクトル化します")
            try:
                embeddings = voyage.embed(
                    texts=item_texts, 
                    model=EMBEDDING_MODEL,
                    output_dimension=EMBEDDING_DIMENSION,  # スペースを削除して正しいパラメータ名を使用
                    truncation=True  # 長いテキストも切り捨てずに処理
                ).embeddings
                
                # キャッシュに保存
                save_embeddings_to_cache(item_texts, EMBEDDING_MODEL, EMBEDDING_DIMENSION, embeddings)
            except Exception as e:
                print(f"Voyage API呼び出しエラー: {e}")
                print("バッチサイズをさらに半分に縮小して再試行します")
                
                # バッチを半分に分割して再試行
                half_size = len(batch_items) // 2
                for j in range(0, len(batch_items), half_size):
                    sub_batch = batch_items[j:j+half_size]
                    sub_texts = item_texts[j:j+half_size]
                    print(f"小さいバッチで処理: {j+1}～{min(j+half_size, len(batch_items))}/{len(batch_items)}")
                    
                    # 小さいバッチでキャッシュをチェック
                    sub_embeddings = get_embeddings_from_cache(sub_texts, EMBEDDING_MODEL, EMBEDDING_DIMENSION)
                    
                    if sub_embeddings is None:
                        try:
                            sub_embeddings = voyage.embed(
                                texts=sub_texts, 
                                model=EMBEDDING_MODEL,
                                output_dimension=EMBEDDING_DIMENSION,
                                truncation=True
                            ).embeddings
                            
                            # キャッシュに保存
                            save_embeddings_to_cache(sub_texts, EMBEDDING_MODEL, EMBEDDING_DIMENSION, sub_embeddings)
                        except Exception as sub_e:
                            print(f"サブバッチでもエラー発生: {sub_e}")
                            # さらに小さいバッチに分割して処理
                            for k, text in enumerate(sub_texts):
                                print(f"1件ずつ処理: {k+1}/{len(sub_texts)}")
                                try:
                                    single_embedding = voyage.embed(
                                        texts=[text], 
                                        model=EMBEDDING_MODEL,
                                        output_dimension=EMBEDDING_DIMENSION,
                                        truncation=True
                                    ).embeddings[0]
                                    
                                    # 一時的に保存
                                    temp_file = os.path.join(CACHE_DIR, f"temp_item_{batch_items[j+k]['id']}.pkl")
                                    with open(temp_file, 'wb') as f:
                                        pickle.dump(single_embedding, f)
                                    
                                    # アイテムデータを処理
                                    item = batch_items[j+k]
                                    conn = get_database_connection()
                                    cursor = conn.cursor()
                                    cursor.execute('''
                                        SELECT * FROM booths WHERE id = ?
                                    ''', (item['booth_id'],))
                                    booth = dict(cursor.fetchone()) if cursor.rowcount != 0 else None
                                    conn.close()
                                    
                                    item_with_booth = item.copy()
                                    if booth:
                                        item_with_booth['booth_details'] = booth
                                    
                                    vectorized_items.append({
                                        "id": item["id"],
                                        "vector": single_embedding,
                                        "payload": item_with_booth
                                    })
                                    
                                    # 途中結果を保存
                                    with open(saved_vectors_file, 'wb') as f:
                                        pickle.dump(vectorized_items, f)
                                    print(f"現在までの{len(vectorized_items)}件のアイテムベクトルを一時保存しました")
                                    
                                except Exception as e:
                                    print(f"個別処理でエラー発生（アイテムID: {batch_items[j+k]['id']}）: {e}")
                                    continue
                            continue
                        
                        # サブバッチ処理
                        for k, item in enumerate(sub_batch):
                            conn = get_database_connection()
                            cursor = conn.cursor()
                            cursor.execute('''
                                SELECT * FROM booths WHERE id = ?
                            ''', (item['booth_id'],))
                            booth = dict(cursor.fetchone()) if cursor.rowcount != 0 else None
                            conn.close()
                            
                            item_with_booth = item.copy()
                            if booth:
                                item_with_booth['booth_details'] = booth
                            
                            vectorized_items.append({
                                "id": item["id"],
                                "vector": sub_embeddings[k],
                                "payload": item_with_booth
                            })
                        
                        # 途中結果を保存
                        with open(saved_vectors_file, 'wb') as f:
                            pickle.dump(vectorized_items, f)
                        print(f"現在までの{len(vectorized_items)}件のアイテムベクトルを一時保存しました")
                    else:
                        # キャッシュから取得したベクトルを使用
                        for k, item in enumerate(sub_batch):
                            conn = get_database_connection()
                            cursor = conn.cursor()
                            cursor.execute('''
                                SELECT * FROM booths WHERE id = ?
                            ''', (item['booth_id'],))
                            booth = dict(cursor.fetchone()) if cursor.rowcount != 0 else None
                            conn.close()
                            
                            item_with_booth = item.copy()
                            if booth:
                                item_with_booth['booth_details'] = booth
                            
                            vectorized_items.append({
                                "id": item["id"],
                                "vector": sub_embeddings[k],
                                "payload": item_with_booth
                            })
                        
                        # 途中結果を保存
                        with open(saved_vectors_file, 'wb') as f:
                            pickle.dump(vectorized_items, f)
                        print(f"現在までの{len(vectorized_items)}件のアイテムベクトルを一時保存しました")
                
                # 次のメインバッチへ
                continue
        
        # ベクトルデータとアイテムデータを紐づける
        batch_vectorized_items = []
        for j, item in enumerate(batch_items):
            # アイテムが所属するブースの情報を取得
            conn = get_database_connection()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM booths WHERE id = ?
            ''', (item['booth_id'],))
            booth = dict(cursor.fetchone()) if cursor.rowcount != 0 else None
            conn.close()
            
            # ペイロードにブース情報を追加
            item_with_booth = item.copy()
            if booth:
                item_with_booth['booth_details'] = booth
            
            batch_vectorized_items.append({
                "id": item["id"],
                "vector": embeddings[j],
                "payload": item_with_booth
            })
        
        # バッチごとに結果をリストに追加
        vectorized_items.extend(batch_vectorized_items)
        
        # 途中結果を保存（中断時の対策）
        with open(saved_vectors_file, 'wb') as f:
            pickle.dump(vectorized_items, f)
        print(f"現在までの{len(vectorized_items)}件のアイテムベクトルを一時保存しました")
    
    return vectorized_items

def create_collections():
    """Qdrantにコレクションを作成する"""
    # ブースコレクションの作成
    # 古いrecreate_collectionの代わりに新しいAPIを使用
    if qdrant.collection_exists(collection_name="booths"):
        qdrant.delete_collection(collection_name="booths")
    
    qdrant.create_collection(
        collection_name="booths",
        vectors_config=models.VectorParams(
            size=EMBEDDING_DIMENSION,  # voyage-3-largeのベクトルサイズ(2048)
            distance=models.Distance.COSINE
        ),
        on_disk_payload=True
    )
    
    # アイテムコレクションの作成
    # 古いrecreate_collectionの代わりに新しいAPIを使用
    if qdrant.collection_exists(collection_name="items"):
        qdrant.delete_collection(collection_name="items")
    
    qdrant.create_collection(
        collection_name="items",
        vectors_config=models.VectorParams(
            size=EMBEDDING_DIMENSION,  # voyage-3-largeのベクトルサイズ(2048)
            distance=models.Distance.COSINE
        ),
        on_disk_payload=True
    )
    
    # ペイロードインデックスの作成（テキスト検索用）
    # ブースコレクション
    try:
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
    except Exception as e:
        print(f"インデックス作成中にエラーが発生しましたが、処理を続行します: {e}")

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
    
    # アップロード状態を記録するファイル
    upload_state_file = os.path.join(CACHE_DIR, 'upload_state.json')
    upload_state = {}
    
    if os.path.exists(upload_state_file):
        try:
            with open(upload_state_file, 'r') as f:
                upload_state = json.load(f)
                print("前回のアップロード状態を読み込みました")
        except Exception as e:
            print(f"アップロード状態の読み込みエラー: {e}")
    
    # ブースベクトルのアップロード（まだ完了していなければ）
    if not upload_state.get('booths_uploaded', False):
        try:
            print("ブースベクトルをアップロード中...")
            
            # アップロード済みのIDをロード
            uploaded_booth_ids = set(upload_state.get('uploaded_booth_ids', []))
            
            # アップロードするベクトルをフィルタリング
            remaining_booth_vectors = [b for b in booth_vectors if b["id"] not in uploaded_booth_ids]
            
            # バッチサイズを小さく設定（大きなデータセットでもタイムアウトしないように）
            batch_size = 200
            
            for i in range(0, len(remaining_booth_vectors), batch_size):
                batch_vectors = remaining_booth_vectors[i:i+batch_size]
                print(f"ブースバッチアップロード: {i+1}～{min(i+batch_size, len(remaining_booth_vectors))}/{len(remaining_booth_vectors)}")
                
                try:
                    # 小さなバッチでアップロード
                    qdrant.upload_points(
                        collection_name="booths",
                        points=[
                            models.PointStruct(
                                id=b["id"],
                                vector=b["vector"],
                                payload=b["payload"]
                            ) for b in batch_vectors
                        ]
                    )
                    
                    # アップロード成功したIDを記録
                    for b in batch_vectors:
                        uploaded_booth_ids.add(b["id"])
                    
                    # 途中経過を保存
                    upload_state['uploaded_booth_ids'] = list(uploaded_booth_ids)
                    with open(upload_state_file, 'w') as f:
                        json.dump(upload_state, f)
                    
                    print(f"ブースバッチ {i+1}～{min(i+batch_size, len(remaining_booth_vectors))} アップロード完了")
                except Exception as e:
                    print(f"ブースバッチ {i+1}～{min(i+batch_size, len(remaining_booth_vectors))} アップロードエラー: {e}")
                    # エラーが発生しても続行する（次のバッチを試す）
                    continue
            
            # すべてのブースがアップロードされたかチェック
            if len(uploaded_booth_ids) == len(booth_vectors):
                upload_state['booths_uploaded'] = True
                with open(upload_state_file, 'w') as f:
                    json.dump(upload_state, f)
                print("すべてのブースベクトルをアップロードしました")
            else:
                print(f"{len(uploaded_booth_ids)}/{len(booth_vectors)}のブースベクトルをアップロードしました")
        except Exception as e:
            print(f"ブースベクトルのアップロードエラー: {e}")
            raise
    else:
        print("ブースベクトルは既にアップロード済みです")
    
    # アイテムベクトルのアップロード（まだ完了していなければ）
    if not upload_state.get('items_uploaded', False):
        try:
            print("アイテムベクトルをアップロード中...")
            
            # アップロード済みのIDをロード
            uploaded_item_ids = set(upload_state.get('uploaded_item_ids', []))
            
            # アップロードするベクトルをフィルタリング
            remaining_item_vectors = [i for i in item_vectors if i["id"] not in uploaded_item_ids]
            
            # バッチサイズを小さく設定（大きなデータセットでもタイムアウトしないように）
            batch_size = 200
            
            for i in range(0, len(remaining_item_vectors), batch_size):
                batch_vectors = remaining_item_vectors[i:i+batch_size]
                print(f"アイテムバッチアップロード: {i+1}～{min(i+batch_size, len(remaining_item_vectors))}/{len(remaining_item_vectors)}")
                
                try:
                    # 小さなバッチでアップロード
                    qdrant.upload_points(
                        collection_name="items",
                        points=[
                            models.PointStruct(
                                id=item["id"],
                                vector=item["vector"],
                                payload=item["payload"]
                            ) for item in batch_vectors
                        ]
                    )
                    
                    # アップロード成功したIDを記録
                    for item in batch_vectors:
                        uploaded_item_ids.add(item["id"])
                    
                    # 途中経過を保存
                    upload_state['uploaded_item_ids'] = list(uploaded_item_ids)
                    with open(upload_state_file, 'w') as f:
                        json.dump(upload_state, f)
                    
                    print(f"アイテムバッチ {i+1}～{min(i+batch_size, len(remaining_item_vectors))} アップロード完了")
                except Exception as e:
                    print(f"アイテムバッチ {i+1}～{min(i+batch_size, len(remaining_item_vectors))} アップロードエラー: {e}")
                    # エラーが発生しても続行する（次のバッチを試す）
                    continue
            
            # すべてのアイテムがアップロードされたかチェック
            if len(uploaded_item_ids) == len(item_vectors):
                upload_state['items_uploaded'] = True
                with open(upload_state_file, 'w') as f:
                    json.dump(upload_state, f)
                print("すべてのアイテムベクトルをアップロードしました")
            else:
                print(f"{len(uploaded_item_ids)}/{len(item_vectors)}のアイテムベクトルをアップロードしました")
        except Exception as e:
            print(f"アイテムベクトルのアップロードエラー: {e}")
            raise
    else:
        print("アイテムベクトルは既にアップロード済みです")
    
    print(f"埋め込みモデル: {EMBEDDING_MODEL}, 次元数: {EMBEDDING_DIMENSION}で処理完了")
    
    # 処理が完全に終わったらキャッシュを削除するかどうか（オプション）
    # cleanup_cache = input("キャッシュファイルを削除しますか？ (y/n): ").lower().strip() == 'y'
    # if cleanup_cache:
    #     for file in os.listdir(CACHE_DIR):
    #         try:
    #             os.remove(os.path.join(CACHE_DIR, file))
    #         except Exception as e:
    #             print(f"キャッシュファイル {file} の削除エラー: {e}")
    #     print("キャッシュを削除しました")

def cleanup_cache():
    """キャッシュディレクトリを削除する"""
    import shutil
    if os.path.exists(CACHE_DIR):
        shutil.rmtree(CACHE_DIR)
        print("キャッシュを削除しました")

if __name__ == "__main__":
    upload_vectors() 