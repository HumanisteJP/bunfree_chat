import sqlite3
import cloudscraper
from bs4 import BeautifulSoup
import time
import re
from urllib.parse import urljoin
import os
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models
import voyageai
from tqdm import tqdm

# 環境変数の読み込み
load_dotenv()

class ItemUpdater:
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
        self.qdrant_url = os.environ.get("QDRANT_URL")
        self.qdrant_api_key = os.environ.get("QDRANT_API_KEY")
        self.qdrant = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_api_key,
            timeout=300.0  # タイムアウトを5分に設定
        )
        
        # VoyageAI設定
        self.voyage_api_key = os.environ.get("VOYAGE_API_KEY")
        self.voyage = voyageai.Client(api_key=self.voyage_api_key)
        
        # 埋め込みモデル設定
        self.embedding_model = "voyage-3-large"
        self.embedding_dimension = 2048
    
    def get_soup(self, url):
        """URLからBeautifulSoupオブジェクトを取得"""
        try:
            response = self.scraper.get(url)
            return BeautifulSoup(response.text, 'html.parser')
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None
    
    def extract_text(self, soup, selector, get_next=False):
        """セレクタから要素のテキストを抽出"""
        found = soup.select_one(selector)
        if not found:
            return None
        if get_next:
            next_element = found.next_sibling
            return next_element.strip() if next_element and next_element.string else None
        return found.get_text(strip=True)
    
    def extract_parent_text(self, soup, selector):
        """セレクタの親要素のテキストから、セレクタのテキストを除いた部分を抽出"""
        element = soup.select_one(selector)
        if not element:
            return None
        parent = element.parent
        if parent:
            # 親要素のテキスト全体から対象要素のテキストを除去
            parent_text = parent.get_text(strip=True)
            element_text = element.get_text(strip=True)
            return parent_text.replace(element_text, '').strip()
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
    
    def get_item_links(self, booth_soup):
        """ブースページから商品リンクを取得"""
        item_links = []
        for link in booth_soup.find_all('a', href=True):
            href = link['href']
            if '/p/tokyo' in href:  # 商品ページへのリンクをフィルタリング
                full_url = urljoin(self.base_url, href)
                item_links.append(full_url)
        return list(set(item_links))
    
    def fetch_booths(self):
        """すべてのブースデータをSQLiteから取得"""
        self.cursor.execute("SELECT id, url FROM booths")
        return self.cursor.fetchall()
    
    def fetch_existing_items_for_booth(self, booth_id):
        """ブースのすべての既存アイテムのURLと名前を取得"""
        self.cursor.execute("SELECT page_url, name FROM items WHERE booth_id = ?", (booth_id,))
        results = self.cursor.fetchall()
        # URL→名前のマッピングを辞書で返す
        return {row['page_url']: row['name'] for row in results}
    
    def parse_item_page(self, url, booth_id):
        """商品ページの情報を解析"""
        soup = self.get_soup(url)
        if not soup:
            return None
        
        # h3タグの取得
        h3_tag = soup.select_one('h3')
        name = h3_tag.get_text(strip=True) if h3_tag else None
        
        # 読みの取得 - title="読み"属性を持つ要素の次のテキストから取得
        yomi = None
        yomi_element = soup.select_one('[title="読み"]')
        if yomi_element:
            # 要素の直後のテキストノードを取得
            next_sibling = yomi_element.next_sibling
            if next_sibling and isinstance(next_sibling, str):
                yomi = next_sibling.strip()

        # 各フィールドの親要素テキストを取得
        genre = self.extract_parent_text(soup, '[title="ブース"]')
        
        # 著者の取得
        author = None
        author_element = soup.select_one('[title="著者"]')
        if author_element:
            parent = author_element.parent
            if parent:
                author = parent.get_text().replace(author_element.get_text(), '').strip()
        
        item_type = self.extract_parent_text(soup, '[title="種別"]')
        
        # ページ数から数字のみを抽出
        page_count_text = self.extract_parent_text(soup, '[title="ページ数"]')
        page_count = None
        if page_count_text:
            page_match = re.search(r'(\d+)ページ', page_count_text)
            if page_match:
                page_count = int(page_match.group(1))
        
        # 発行日からフォーマットを整える
        release_date = self.extract_parent_text(soup, '[title="発行日"]')
        if release_date:
            # 発行日文字列から日付部分のみ抽出
            release_date = re.sub(r'発行$', '', release_date).strip()
        
        # 価格から数字のみを抽出
        price_text = self.extract_parent_text(soup, '[title="価格"]')
        price = None
        if price_text:
            price_match = re.search(r'(\d+)円', price_text)
            if price_match:
                price = int(price_match.group(1))
        
        # URLの取得
        url_element = soup.select_one('[title="Webサイト"]')
        item_url = None
        if url_element:
            link_element = url_element.find_parent('li').find('a')
            if link_element:
                item_url = link_element.get('href')
        
        # 説明文の取得
        description = self.extract_text(soup, '.wysihtml5')
        
        item_data = {
            'booth_id': booth_id,
            'name': name,
            'yomi': yomi,
            'genre': genre,
            'author': author,
            'item_type': item_type,
            'page_count': page_count,
            'release_date': release_date,
            'price': price,
            'item_url': item_url,
            'page_url': url,
            'description': description
        }
        
        return item_data
    
    def save_item(self, item_data):
        """商品情報をデータベースに保存して、IDを返す。
        戻り値は (item_id, is_new_item) のタプル。is_new_itemは新規追加ならTrue、更新ならFalse"""
        # page_urlが一致するアイテムを検索
        self.cursor.execute('SELECT id FROM items WHERE page_url = ?', (item_data['page_url'],))
        existing_item = self.cursor.fetchone()
        
        if existing_item:
            # 既存アイテムがある場合は更新
            self.cursor.execute('''
                UPDATE items SET
                booth_id = ?, name = ?, yomi = ?, genre = ?, author = ?, item_type = ?,
                page_count = ?, release_date = ?, price = ?, url = ?, description = ?
                WHERE id = ?
            ''', (
                item_data['booth_id'], item_data['name'], item_data['yomi'],
                item_data['genre'], item_data['author'], item_data['item_type'],
                item_data['page_count'], item_data['release_date'], item_data['price'],
                item_data['item_url'], item_data['description'], existing_item['id']
            ))
            self.conn.commit()
            return (existing_item['id'], False)  # 既存アイテムの更新
        else:
            # 新規アイテムの場合は挿入
            self.cursor.execute('''
                INSERT INTO items 
                (booth_id, name, yomi, genre, author, item_type, page_count, release_date, price, url, page_url, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                item_data['booth_id'], item_data['name'], item_data['yomi'],
                item_data['genre'], item_data['author'], item_data['item_type'],
                item_data['page_count'], item_data['release_date'], item_data['price'],
                item_data['item_url'], item_data['page_url'], item_data['description']
            ))
            self.conn.commit()
            return (self.cursor.lastrowid, True)  # 新規アイテムの追加
    
    def get_booth_details(self, booth_id):
        """ブースの詳細情報を取得"""
        self.cursor.execute("SELECT * FROM booths WHERE id = ?", (booth_id,))
        return dict(self.cursor.fetchone()) if self.cursor.rowcount != 0 else None
    
    def generate_item_embedding(self, item_data):
        """アイテムのテキストからベクトル埋め込みを生成"""
        # ベクトル化するテキストを作成
        text = f"アイテム名: {item_data['name'] or ''}\n"
        text += f"読み: {item_data['yomi'] or ''}\n"
        text += f"ジャンル: {item_data['genre'] or ''}\n"
        text += f"著者: {item_data['author'] or ''}\n"
        text += f"アイテムタイプ: {item_data['item_type'] or ''}\n"
        
        # 説明文は長くなりがちなので、適度に切り詰める
        description = item_data['description'] or ''
        if len(description) > 500:  # 長すぎる説明文は切り詰める
            description = description[:500] + "..."
        text += f"説明: {description}\n"
        
        # ブース情報を追加
        booth = self.get_booth_details(item_data['booth_id'])
        if booth:
            text += f"ブース名: {booth['name'] or ''}\n"
        
        # Voyage AIでベクトル化
        try:
            embedding = self.voyage.embed(
                texts=[text], 
                model=self.embedding_model,
                output_dimension=self.embedding_dimension,
                truncation=True
            ).embeddings[0]
            return embedding
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return None
    
    def upload_item_to_qdrant(self, item_id, item_data, vector):
        """アイテムをQdrantにアップロード"""
        # アイテムが所属するブースの情報を取得
        booth = self.get_booth_details(item_data['booth_id'])
        
        # ペイロードにブース情報を追加
        item_with_booth = item_data.copy()
        if booth:
            item_with_booth['booth_details'] = booth
        
        try:
            self.qdrant.upload_points(
                collection_name="items",
                points=[
                    models.PointStruct(
                        id=item_id,
                        vector=vector,
                        payload=item_with_booth
                    )
                ]
            )
            return True
        except Exception as e:
            print(f"Error uploading to Qdrant: {e}")
            return False
    
    def check_and_update_items(self):
        """すべてのブースをチェックして新しいアイテムを更新"""
        booths = self.fetch_booths()
        print(f"{len(booths)}件のブースを確認します")
        
        new_items_total = 0
        error_count = 0
        
        # すべての既存の商品URLを一度だけ取得
        self.cursor.execute("SELECT page_url FROM items")
        all_existing_urls = set(row[0] for row in self.cursor.fetchall())
        print(f"現在のDBには{len(all_existing_urls)}件のアイテムURLが登録されています")
        
        # プログレスバーの設定
        progress_bar = tqdm(total=len(booths), desc="ブース処理中")
        
        for booth in booths:
            booth_id = booth['id']
            booth_url = booth['url']
            
            try:
                # ブースページの取得
                soup = self.get_soup(booth_url)
                if not soup:
                    print(f"ブースページの取得に失敗: ID={booth_id}")
                    error_count += 1
                    progress_bar.update(1)
                    continue
                
                # 現在の商品リンクを取得
                current_item_links = self.get_item_links(soup)
                
                # ブースの既存の商品URLと名前を取得（名前による重複チェック用）
                existing_items = self.fetch_existing_items_for_booth(booth_id)
                
                # 新しい商品リンクの初期リスト
                new_item_links = []
                
                # 各商品リンクを処理
                for item_url in current_item_links:
                    # 全体のURLリストで確認
                    if item_url not in all_existing_urls:
                        new_item_links.append(item_url)
                        continue
                    
                    # 既に処理済みのURLなら次へ
                
                if new_item_links:
                    print(f"\nブースID={booth_id}に{len(new_item_links)}件の新しいアイテムを発見:")
                    
                    for item_url in new_item_links:
                        try:
                            # 商品ページの解析
                            item_data = self.parse_item_page(item_url, booth_id)
                            if not item_data:
                                print(f"  - アイテムの解析に失敗: {item_url}")
                                error_count += 1
                                continue
                            
                            # 名前による二重チェック - 同じ商品名があれば処理しない
                            item_name = item_data['name']
                            if item_name and item_name in existing_items.values():
                                print(f"  - 同名の商品が既に存在します: 「{item_name}」")
                                continue
                            
                            # データベースに保存
                            item_id, is_new_item = self.save_item(item_data)
                            
                            print(f"  + アイテム「{item_data['name']}」をDBに{('追加' if is_new_item else '更新')}しました")
                            
                            # 新規アイテムの場合のみ埋め込みとQdrantアップロードを実行
                            if is_new_item:
                                # ベクトル埋め込みの生成
                                vector = self.generate_item_embedding(item_data)
                                if not vector:
                                    print(f"  - ベクトル生成に失敗: {item_url}")
                                    error_count += 1
                                    continue
                                
                                # Qdrantにアップロード
                                if self.upload_item_to_qdrant(item_id, item_data, vector):
                                    print(f"  + アイテム「{item_data['name']}」をQdrantに追加しました")
                                    new_items_total += 1
                                else:
                                    print(f"  - Qdrantへのアップロードに失敗: {item_url}")
                                    error_count += 1
                            else:
                                print(f"  * アイテム「{item_data['name']}」は既存アイテムの更新のため、ベクトル処理はスキップします")
                            
                        except Exception as e:
                            print(f"  - アイテム処理でエラー: {item_url} - {e}")
                            error_count += 1

            except Exception as e:
                print(f"ブース処理でエラー: ID={booth_id} - {e}")
                error_count += 1
            
            # プログレスバーを更新
            progress_bar.update(1)
        
        # プログレスバーを閉じる
        progress_bar.close()
        
        print("\n===== 更新完了 =====")
        print(f"確認したブース数: {len(booths)}")
        print(f"追加した新しいアイテム数: {new_items_total}")
        print(f"エラーの発生数: {error_count}")
    
    def close(self):
        """リソースをクローズ"""
        if self.conn:
            self.conn.close()

def main():
    updater = ItemUpdater()
    try:
        updater.check_and_update_items()
    finally:
        updater.close()

if __name__ == "__main__":
    main() 