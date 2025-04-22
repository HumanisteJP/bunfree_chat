import sqlite3
import os
from qdrant_client import QdrantClient
from qdrant_client import models
import time
from dotenv import load_dotenv

load_dotenv()

class QdrantWebsiteURLUpdater:
    def __init__(self):
        # データベース接続
        self.db_path = 'bunfree.db'
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        
        # Qdrant接続設定 - クラウド版Qdrantに合わせて修正
        self.qdrant_url = os.environ.get("QDRANT_URL")
        self.qdrant_api_key = os.environ.get("QDRANT_API_KEY")
        
        if not self.qdrant_url:
            raise ValueError("QDRANT_URL環境変数が設定されていません")
        
        # Qdrantクライアントの初期化
        self.qdrant = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_api_key,
            timeout=300.0  # タイムアウトを5分に設定
        )
        print(f"Qdrantクライアント初期化: URL={self.qdrant_url}")
    
    def fetch_booths_with_website_urls(self):
        """SQLiteからwebsite_urlが設定されているブースデータを取得"""
        self.cursor.execute("""
            SELECT id, website_url 
            FROM booths 
            WHERE website_url IS NOT NULL AND website_url != ''
        """)
        return self.cursor.fetchall()
    
    def check_qdrant_booth_exists(self, booth_id):
        """QdrantにブースIDが存在するか確認"""
        try:
            result = self.qdrant.retrieve(
                collection_name="booths",
                ids=[booth_id],
                with_payload=True
            )
            return len(result) > 0
        except Exception as e:
            print(f"Error checking if booth exists in Qdrant (ID={booth_id}): {e}")
            return False
    
    def check_qdrant_website_url(self, booth_id):
        """Qdrantからブースのwebsite_urlを取得して返す"""
        try:
            result = self.qdrant.retrieve(
                collection_name="booths",
                ids=[booth_id],
                with_payload=True
            )
            
            if result and len(result) > 0:
                payload = result[0].payload
                if payload and 'website_url' in payload:
                    return payload['website_url']
            return None
        except Exception as e:
            print(f"Error checking Qdrant website_url for booth {booth_id}: {e}")
            return None
    
    def update_qdrant_website_url(self, booth_id, website_url):
        """Qdrantのwebsite_urlを更新"""
        try:
            self.qdrant.set_payload(
                collection_name="booths",
                payload={"website_url": website_url},
                points=[booth_id]
            )
            return True
        except Exception as e:
            print(f"Error updating Qdrant for booth {booth_id}: {e}")
            return False
    
    def check_id_mapping(self):
        """SQLiteとQdrantのIDマッピングを確認"""
        print("SQLiteとQdrantのIDマッピングを確認中...")
        
        # SQLiteからブースIDを取得
        self.cursor.execute("SELECT id FROM booths LIMIT 10")
        sample_ids = [row['id'] for row in self.cursor.fetchall()]
        
        missing_ids = []
        found_ids = []
        
        for booth_id in sample_ids:
            if self.check_qdrant_booth_exists(booth_id):
                found_ids.append(booth_id)
            else:
                missing_ids.append(booth_id)
        
        if missing_ids:
            if not found_ids:
                print(f"警告: サンプルとして確認した{len(sample_ids)}個のIDはすべてQdrantに存在しませんでした。")
                print("Qdrant接続に問題があるか、IDの構造が異なる可能性があります。")
                return False
            else:
                print(f"警告: 以下のIDがQdrantに存在しません: {missing_ids}")
                print(f"ただし、{len(found_ids)}個のIDはQdrantに正常に存在します。")
                return True  # 一部見つかれば続行可能
        else:
            print("IDマッピングの確認OK: サンプルIDはQdrantに存在します")
            return True
    
    def update_all_website_urls(self):
        """すべてのブースのwebsite_urlをSQLiteからQdrantに同期"""
        # 最初にIDマッピングを確認
        id_mapping_ok = self.check_id_mapping()
        if not id_mapping_ok:
            print("IDマッピングに問題があるため処理を中止します。")
            return
        
        booths = self.fetch_booths_with_website_urls()
        print(f"Found {len(booths)} booths with website URLs in SQLite")
        
        updated_count = 0
        error_count = 0
        skipped_count = 0
        not_found_count = 0
        
        for i, booth in enumerate(booths):
            booth_id = booth['id']
            sqlite_website_url = booth['website_url']
            
            print(f"Processing booth {i+1}/{len(booths)}: ID={booth_id}")
            
            # Qdrantにブースが存在するか確認
            if not self.check_qdrant_booth_exists(booth_id):
                print(f"✗ Booth ID={booth_id} not found in Qdrant, skipping")
                not_found_count += 1
                continue
            
            # Qdrantの現在の値を確認
            qdrant_website_url = self.check_qdrant_website_url(booth_id)
            
            # 値が異なる場合は更新
            if qdrant_website_url != sqlite_website_url:
                print(f"Updating website URL for booth {booth_id}:")
                print(f"  SQLite: {sqlite_website_url}")
                print(f"  Qdrant: {qdrant_website_url}")
                
                if self.update_qdrant_website_url(booth_id, sqlite_website_url):
                    updated_count += 1
                    print(f"✓ Success: Updated website URL for booth {booth_id}")
                else:
                    error_count += 1
                    print(f"✗ Failed: Could not update website URL for booth {booth_id}")
            else:
                skipped_count += 1
                print(f"- Skipped: website URL already matches for booth {booth_id}")
            
            # 10件ごとに少し待機
            if (i + 1) % 10 == 0:
                print(f"Processed {i+1} booths, taking a short break...")
                time.sleep(0.1)
        
        print("\n===== 同期完了 =====")
        print(f"確認したブース数: {len(booths)}")
        print(f"更新したブース数: {updated_count}")
        print(f"スキップしたブース数: {skipped_count}")
        print(f"Qdrantに存在しないブース数: {not_found_count}")
        print(f"エラーのあったブース数: {error_count}")
    
    def close(self):
        """リソースをクローズ"""
        if self.conn:
            self.conn.close()

def main():
    try:
        updater = QdrantWebsiteURLUpdater()
        updater.update_all_website_urls()
    except ValueError as e:
        print(f"エラー: {e}")
        print("環境変数QDRANT_URLとQDRANT_API_KEYが正しく設定されているか確認してください。")
    except Exception as e:
        print(f"予期せぬエラーが発生しました: {e}")
    finally:
        try:
            updater.close()
        except:
            pass

if __name__ == "__main__":
    main() 