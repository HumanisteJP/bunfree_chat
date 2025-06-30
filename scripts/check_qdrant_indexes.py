import os
import sqlite3
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models

# 環境変数の読み込み
load_dotenv()

# API KEYの取得
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_URL = os.getenv("QDRANT_URL")

# Qdrantクライアントの初期化
qdrant = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY,
)

def check_collection_indices(collection_name):
    """コレクションのインデックス情報を確認する"""
    try:
        # コレクション情報の取得
        collection_info = qdrant.get_collection(collection_name=collection_name)
        
        print(f"コレクション名: {collection_name}")
        
        # バージョンによってパラメータの構造が異なる可能性がある
        try:
            if hasattr(collection_info.config.params, 'size'):
                print(f"ベクトル次元数: {collection_info.config.params.size}")
            elif hasattr(collection_info.config, 'vectors'):
                print(f"ベクトル次元数: {collection_info.config.vectors.size}")
            else:
                print("ベクトル次元数: 情報が取得できませんでした")
            
            if hasattr(collection_info.config.params, 'distance'):
                print(f"距離関数: {collection_info.config.params.distance}")
            elif hasattr(collection_info.config, 'vectors'):
                print(f"距離関数: {collection_info.config.vectors.distance}")
            else:
                print("距離関数: 情報が取得できませんでした")
        except Exception as e:
            print(f"コレクション情報の解析エラー: {e}")
        
        print("\nペイロードインデックス:")
        
        # 古いバージョンのQdrantはlist_payload_indexesメソッドがないため、
        # インデックス情報はget_collectionから取得
        if hasattr(collection_info, 'payload_schema'):
            for field_name, schema in collection_info.payload_schema.items():
                print(f"\nフィールド: {field_name}")
                print(f"  タイプ: {schema.data_type}")
                if schema.data_type == "text":
                    print("  ※フルテキスト検索に対応（部分一致可能）")
                elif schema.data_type == "keyword":
                    print("  ※キーワード検索のみ対応（完全一致のみ）")
                else:
                    print(f"  ※タイプ: {schema.data_type}")
        else:
            print("インデックス情報を取得できませんでした。")
        
        return collection_info
    except Exception as e:
        print(f"エラー: {e}")
        return None

def check_field_existence(collection_name, field_name):
    """フィールドが実際に存在するか確認する"""
    try:
        # サンプルポイントを取得して確認
        results = qdrant.scroll(
            collection_name=collection_name,
            limit=5
        )
        
        if not results[0]:
            print(f"コレクション {collection_name} にポイントが見つかりません")
            return False
        
        # フィールド名をパース（payload.nameなどの形式を処理）
        field_parts = field_name.split('.')
        actual_field = field_parts[-1] if len(field_parts) > 1 else field_name
        
        # ポイントのペイロードを確認
        field_exists = False
        sample_values = []
        
        for point in results[0]:
            if actual_field in point.payload:
                field_exists = True
                sample_values.append(point.payload[actual_field])
                    
        if field_exists:
            print(f"\nフィールド '{actual_field}' は存在します")
            print(f"サンプル値（最大3件）: {', '.join(str(v) for v in sample_values[:3])}")
            return True
        else:
            print(f"\nフィールド '{actual_field}' は存在しません")
            if results[0][0].payload:
                print(f"存在するフィールド: {', '.join(results[0][0].payload.keys())}")
            else:
                print("ペイロードが存在しません")
            return False
    
    except Exception as e:
        print(f"フィールド確認エラー: {e}")
        return False

def test_partial_match(collection_name, field_name, query):
    """部分一致検索をテストする"""
    try:
        # フィールド名をパース
        field_parts = field_name.split('.')
        actual_field = field_parts[-1] if len(field_parts) > 1 else field_name
        
        # 部分一致検索を試みる
        results = qdrant.scroll(
            collection_name=collection_name,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key=actual_field,  # payload.nameではなくnameを使用
                        match=models.MatchText(text=query)
                    )
                ]
            ),
            limit=5
        )
        
        print(f"\n部分一致検索テスト: '{query}' をフィールド '{actual_field}' で検索")
        
        if results[0]:
            print(f"結果: {len(results[0])}件見つかりました")
            for i, point in enumerate(results[0][:3]):  # 最初の3件だけ表示
                print(f"\n結果 {i+1}:")
                field_value = point.payload.get(actual_field, "値がありません")
                print(f"  {actual_field}: {field_value}")
        else:
            print("検索結果: 0件")
            
        return results[0]
    except Exception as e:
        print(f"検索エラー: {e}")
        return None

def create_text_index(collection_name, field_name):
    """TEXTタイプのインデックスを作成する"""
    # フィールド名をパース
    field_parts = field_name.split('.')
    actual_field = field_parts[-1] if len(field_parts) > 1 else field_name
    
    print(f"フィールド '{actual_field}' にTEXTタイプのインデックスを作成します...")
    
    # 複数の方法を順番に試す
    methods = [
        # 方法1: 詳細なパラメータ指定
        lambda: qdrant.create_payload_index(
            collection_name=collection_name,
            field_name=actual_field,
            field_schema=models.TextIndexParams(
                type="text",
                tokenizer=models.TokenizerType.WORD,
                min_token_len=2,
                max_token_len=15,
                lowercase=True,
            )
        ),
        # 方法2: シンプルな文字列指定
        lambda: qdrant.create_payload_index(
            collection_name=collection_name,
            field_name=actual_field,
            field_schema="text"
        ),
        # 方法3: PayloadSchemaType定数を使用
        lambda: qdrant.create_payload_index(
            collection_name=collection_name,
            field_name=actual_field,
            field_schema=models.PayloadSchemaType.TEXT
        ),
        # 方法4: キーワードタイプでも試す
        lambda: qdrant.create_payload_index(
            collection_name=collection_name,
            field_name=actual_field,
            field_schema="keyword"
        )
    ]
    
    # 各方法を順番に試す
    for i, method in enumerate(methods):
        try:
            print(f"方法{i+1}でインデックス作成を試みます...")
            method()
            print(f"方法{i+1}でインデックス作成に成功しました！")
            return True
        except Exception as e:
            print(f"方法{i+1}のエラー: {e}")
    
    print("すべての方法が失敗しました。")
    return False

def test_keyword_match(collection_name, field_name, query):
    """キーワード検索（完全一致）をテストする"""
    try:
        # フィールド名をパース
        field_parts = field_name.split('.')
        actual_field = field_parts[-1] if len(field_parts) > 1 else field_name
        
        # キーワード検索を試みる
        results = qdrant.scroll(
            collection_name=collection_name,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key=actual_field,  # payload.nameではなくnameを使用
                        match=models.MatchValue(value=query)
                    )
                ]
            ),
            limit=5
        )
        
        print(f"\nキーワード検索テスト: '{query}' をフィールド '{actual_field}' で完全一致検索")
        
        if results[0]:
            print(f"結果: {len(results[0])}件見つかりました")
            for i, point in enumerate(results[0][:3]):  # 最初の3件だけ表示
                print(f"\n結果 {i+1}:")
                field_value = point.payload.get(actual_field, "値がありません")
                print(f"  {actual_field}: {field_value}")
        else:
            print("検索結果: 0件")
            
        return results[0]
    except Exception as e:
        print(f"検索エラー: {e}")
        return None

def list_available_fields(collection_name):
    """コレクション内の利用可能なフィールドを一覧表示する"""
    try:
        # サンプルポイントを取得
        results = qdrant.scroll(
            collection_name=collection_name,
            limit=5
        )
        
        if not results[0]:
            print(f"コレクション {collection_name} にポイントが見つかりません")
            return []
        
        # 一意のフィールド名を収集
        all_fields = set()
        
        for point in results[0]:
            if point.payload:
                for field in point.payload.keys():
                    all_fields.add(field)
        
        # フィールド一覧を表示
        print(f"\nコレクション '{collection_name}' の利用可能なフィールド:")
        for field in sorted(all_fields):
            # サンプル値を取得
            sample_values = []
            for point in results[0]:
                if field in point.payload:
                    sample_values.append(str(point.payload[field]))
                    if len(sample_values) >= 2:
                        break
            
            sample_str = f"サンプル: {', '.join(sample_values[:2])}" if sample_values else "(値なし)"
            print(f"- {field} ({sample_str})")
        
        return list(all_fields)
    
    except Exception as e:
        print(f"フィールド一覧取得エラー: {e}")
        return []

if __name__ == "__main__":
    # ブースコレクションのみをチェック
    collection = "booths"
    original_field_name = "payload.name"
    test_query = "点滅社"  # 特定のブース名を検索
    
    print(f"\n{'='*50}")
    print(f"コレクション: {collection}")
    print(f"{'='*50}")
    
    # 現在のインデックス情報を確認
    indices = check_collection_indices(collection)
    
    # 利用可能なフィールドを一覧表示
    available_fields = list_available_fields(collection)
    
    # フィールド名をpayload.nameからnameに変換
    field_parts = original_field_name.split('.')
    field_name = field_parts[-1] if len(field_parts) > 1 else original_field_name
    
    print(f"\n検索フィールドを '{original_field_name}' から '{field_name}' に変更します")
    
    # フィールドが存在するか確認
    field_exists = check_field_existence(collection, field_name)
    
    if not field_exists and available_fields:
        print(f"\n指定されたフィールド '{field_name}' が存在しません。")
        print("代わりに利用可能なフィールドから選んでください。")
        
        # 利用可能なフィールドから最も有望なものを選ぶ
        candidates = ["name", "title", "description", "text"]
        for candidate in candidates:
            if candidate in available_fields:
                field_name = candidate
                print(f"フィールド '{field_name}' を代わりに使用します。")
                field_exists = True
                break
        
        if not field_exists:
            # 最初のフィールドを使用
            field_name = available_fields[0]
            print(f"フィールド '{field_name}' を代わりに使用します。")
            field_exists = True
    
    # 通常のキーワード検索をテスト（現在のインデックスがKEYWORDタイプの場合）
    keyword_results = test_keyword_match(collection, field_name, test_query)
    
    # 部分一致検索をテスト
    partial_results = test_partial_match(collection, field_name, test_query)
    
    # 検索結果がなければ、TEXTインデックスを自動的に作成
    if not keyword_results and not partial_results:
        print(f"\n'{test_query}'が見つかりませんでした。インデックスを作成します。")
        
        # フィールドが存在する場合のみインデックスを作成
        if field_exists:
            create_text_index(collection, field_name)
            
            # インデックス作成後に再度テスト
            print("\nインデックス作成後のテスト:")
            test_partial_match(collection, field_name, test_query)
    else:
        print(f"\n'{test_query}'が見つかりました。インデックス作成は不要です。") 