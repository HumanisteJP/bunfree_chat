import sqlite3
import cloudscraper
from bs4 import BeautifulSoup
import time
from qdrant_client import QdrantClient
from qdrant_client import models
import os

class WebsiteURLPatcher:
    def __init__(self):
        # CloudScraperの設定
        self.scraper = cloudscraper.create_scraper()
        self.base_url = "https://c.bunfree.net"
        
        # データベース接続
        self.db_path = 'bunfree.db'
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        
        # Qdrant接続設定
        self.qdrant_host = os.environ.get("QDRANT_HOST", "localhost")
        self.qdrant_port = int(os.environ.get("QDRANT_PORT", 6333))
        self.qdrant = QdrantClient(host=self.qdrant_host, port=self.qdrant_port)
    
    def get_soup(self, url):
        """URLからBeautifulSoupオブジェクトを取得"""
        try:
            response = self.scraper.get(url)
            return BeautifulSoup(response.text, 'html.parser')
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None
    
    def extract_website_url(self, soup):
        """WebサイトURLをhref属性から抽出する"""
        try:
            # .website_url クラスを持つli要素を検索
            website_element = soup.select_one('li.website_url')
            if website_element:
                # その中のaタグを検索
                link = website_element.find('a')
                if link and link.has_attr('href'):
                    return link['href']
            return None
        except Exception as e:
            print(f"Error extracting website URL: {e}")
            return None
    
    def fetch_booths(self):
        """ブースデータをSQLiteから取得"""
        self.cursor.execute("SELECT id, url, website_url FROM booths")
        return self.cursor.fetchall()
    
    def update_booth_website_url(self, booth_id, website_url):
        """ブースのWebサイトURLを更新"""
        try:
            # SQLiteの更新
            self.cursor.execute(
                "UPDATE booths SET website_url = ? WHERE id = ?",
                (website_url, booth_id)
            )
            self.conn.commit()
            
            # Qdrantの更新
            self.qdrant.set_payload(
                collection_name="booths",
                payload={"website_url": website_url},
                points=[booth_id]
            )
            
            return True
        except Exception as e:
            print(f"Error updating booth {booth_id}: {e}")
            return False
    
    def patch_website_urls(self):
        """全ブースのWebサイトURLを修正する"""
        booths = self.fetch_booths()
        print(f"Found {len(booths)} booths to check")
        
        updated_count = 0
        error_count = 0
        
        for i, booth in enumerate(booths):
            booth_id = booth['id']
            booth_url = booth['url']
            current_website_url = booth['website_url']
            
            print(f"Processing booth {i+1}/{len(booths)}: ID={booth_id}")
            
            # ブースページのHTMLを取得
            soup = self.get_soup(booth_url)
            if not soup:
                print(f"Could not fetch booth page for ID={booth_id}")
                error_count += 1
                continue
            
            # WebサイトURLを抽出
            new_website_url = self.extract_website_url(soup)
            
            # URLが変わっていれば更新
            if new_website_url and new_website_url != current_website_url:
                print(f"Updating website URL for booth {booth_id}:")
                print(f"  Old: {current_website_url}")
                print(f"  New: {new_website_url}")
                
                if self.update_booth_website_url(booth_id, new_website_url):
                    updated_count += 1
                else:
                    error_count += 1
            
            # レート制限対策
            if (i + 1) % 10 == 0:
                print(f"Processed {i+1} booths, taking a short break...")
                time.sleep(0.1)
    
        print("\n===== パッチ完了 =====")
        print(f"確認したブース数: {len(booths)}")
        print(f"更新したブース数: {updated_count}")
        print(f"エラーのあったブース数: {error_count}")
    
    def close(self):
        """リソースをクローズ"""
        if self.conn:
            self.conn.close()

def main():
    patcher = WebsiteURLPatcher()
    try:
        patcher.patch_website_urls()
    finally:
        patcher.close()

if __name__ == "__main__":
    main() 