import cloudscraper
from bs4 import BeautifulSoup
import sqlite3
import time
import re
from urllib.parse import urljoin
import os
from tqdm import tqdm

class PatchCrawler:
    def __init__(self):
        self.scraper = cloudscraper.create_scraper()
        self.base_url = "https://c.bunfree.net"
        self.db_path = 'bunfree.db'
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        
    def get_soup(self, url):
        """URLからBeautifulSoupオブジェクトを取得"""
        response = self.scraper.get(url)
        return BeautifulSoup(response.text, 'html.parser')

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

    def extract_booth_number(self, soup):
        """ブース番号情報を直接タグから取得する改善版"""
        # 'title="ブース"' 属性を持つ要素を検索
        booth_element = soup.find('div', attrs={'title': 'ブース'})
        
        if booth_element:
            # この要素の直後のテキストノードを取得 (通常これがブース番号)
            booth_number = None
            next_node = booth_element.next_sibling
            if next_node and isinstance(next_node, str) and next_node.strip():
                booth_number = next_node.strip()
            return booth_number
        return None

    def get_booth_links(self, list_url):
        """ブース一覧ページからすべてのブースのリンクを取得"""
        soup = self.get_soup(list_url)
        booth_links = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/c/tokyo' in href:  # ブースページへのリンクをフィルタリング
                full_url = urljoin(self.base_url, href)
                booth_links.append(full_url)
        return list(set(booth_links))  # 重複を除去

    def get_item_links(self, booth_soup):
        """ブースページから商品リンクを取得"""
        item_links = []
        for link in booth_soup.find_all('a', href=True):
            href = link['href']
            if '/p/tokyo' in href:  # 商品ページへのリンクをフィルタリング
                full_url = urljoin(self.base_url, href)
                item_links.append(full_url)
        return list(set(item_links))

    def parse_booth_page(self, url):
        """ブースページの情報を解析"""
        soup = self.get_soup(url)
        
        # 各フィールドを取得
        name = self.extract_text(soup, '.name')
        if not name:
            print(f"Warning: Booth name not found for {url}")
            name = "未取得のブース"  # 名前がない場合のデフォルト値を設定
        
        # 読みの取得 - title="読み"属性を持つ要素の次のテキストから取得
        yomi = None
        yomi_element = soup.select_one('[title="読み"]')
        if yomi_element:
            # 要素の直後のテキストノードを取得
            next_sibling = yomi_element.next_sibling
            if next_sibling and isinstance(next_sibling, str):
                yomi = next_sibling.strip()
        
        category = self.extract_text(soup, '.category')
        
        # ブース番号を取得してエリアと番号に分離
        booth_number_text = self.extract_booth_number(soup)
        if not booth_number_text:
            # 旧方式でも試す
            booth_number_text = self.extract_parent_text(soup, '[title="ブース"]')
        
        area = None
        area_number = None
        
        if booth_number_text:
            # 例: A-03〜04 or い-85 -> area=A or い, area_number=03 or 85
            # 正規表現パターンを修正して日本語文字も対応
            match = re.search(r'([A-Za-z\u3040-\u309F\u30A0-\u30FF]+)-(\d+)(?:〜(\d+))?', booth_number_text)
            if match:
                area = match.group(1)
                # 範囲指定されている場合は小さい方を取得
                if match.group(3):
                    first_num = int(match.group(2))
                    second_num = int(match.group(3))
                    area_number = str(min(first_num, second_num)).zfill(2)
                else:
                    area_number = match.group(2)
        
        # メンバー情報の取得 - title="著者"属性を持つ要素の親要素から取得
        members = None
        members_element = soup.select_one('[title="著者"]')
        if members_element:
            parent = members_element.parent
            if parent:
                members = parent.get_text().replace(members_element.get_text(), '').strip()
        
        twitter = self.extract_text(soup, '.twitter')
        instagram = self.extract_text(soup, '.instagram')
        website_url = self.extract_text(soup, '.website_url')
        description = self.extract_text(soup, '.note')
        
        # 地図上の位置情報（デフォルトではNone）
        map_number = None
        position_top = None
        position_left = None
        
        booth_data = {
            'name': name,
            'yomi': yomi,
            'category': category,
            'area': area,
            'area_number': area_number,
            'members': members,
            'twitter': twitter,
            'instagram': instagram,
            'website_url': website_url,
            'description': description,
            'map_number': map_number,
            'position_top': position_top,
            'position_left': position_left,
            'url': url
        }
        
        return booth_data

    def parse_item_page(self, url, booth_id):
        """商品ページの情報を解析"""
        soup = self.get_soup(url)
        
        # h3タグの取得
        h3_tag = soup.select_one('h3')
        name = h3_tag.get_text(strip=True) if h3_tag else "未取得のアイテム"  # デフォルト値を設定
        
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

    def save_booth(self, booth_data):
        """ブース情報をデータベースに保存"""
        self.cursor.execute('''
            INSERT OR REPLACE INTO booths 
            (name, yomi, category, area, area_number, members, twitter, instagram, website_url, description, map_number, position_top, position_left, url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            booth_data['name'], booth_data['yomi'], booth_data['category'],
            booth_data['area'], booth_data['area_number'], booth_data['members'], 
            booth_data['twitter'], booth_data['instagram'], booth_data['website_url'], 
            booth_data['description'], booth_data['map_number'], booth_data['position_top'], 
            booth_data['position_left'], booth_data['url']
        ))
        self.conn.commit()
        return self.cursor.lastrowid

    def save_item(self, item_data):
        """商品情報をデータベースに保存"""
        self.cursor.execute('''
            INSERT OR REPLACE INTO items 
            (booth_id, name, yomi, genre, author, item_type, page_count, release_date, price, url, page_url, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            item_data['booth_id'], item_data['name'], item_data['yomi'],
            item_data['genre'], item_data['author'], item_data['item_type'],
            item_data['page_count'], item_data['release_date'], item_data['price'],
            item_data['item_url'], item_data['page_url'], item_data['description']
        ))
        self.conn.commit()

    def find_missing_booths(self, all_booth_urls):
        """DBに保存されていないブースのURLを取得"""
        self.cursor.execute("SELECT url FROM booths")
        saved_urls = set(url[0] for url in self.cursor.fetchall())
        return [url for url in all_booth_urls if url not in saved_urls]

    def find_saved_booth_id(self, booth_url):
        """保存済みのブースIDを取得"""
        self.cursor.execute("SELECT id FROM booths WHERE url = ?", (booth_url,))
        result = self.cursor.fetchone()
        if result:
            return result[0]
        return None

    def find_missing_items(self, booth_id, all_item_urls):
        """DBに保存されていないアイテムのURLを取得"""
        self.cursor.execute("SELECT page_url FROM items WHERE booth_id = ?", (booth_id,))
        saved_urls = set(url[0] for url in self.cursor.fetchall())
        return [url for url in all_item_urls if url not in saved_urls]

    def crawl_missing_data(self):
        """欠けているデータを収集"""
        print("=== 欠けているデータの収集を開始 ===")
        
        # 全てのブースURLを取得
        print("全てのブースリンクを取得中...")
        all_booth_urls = self.get_booth_links("https://c.bunfree.net/c/tokyo40/all/booth")
        total_booths = len(all_booth_urls)
        print(f"合計 {total_booths} ブースを発見")
        
        # 保存されていないブースURLを取得
        missing_booths = self.find_missing_booths(all_booth_urls)
        print(f"未保存のブース: {len(missing_booths)} / {total_booths}")
        
        # 欠けているブースを処理
        if missing_booths:
            print("欠けているブースを処理中...")
            for booth_url in tqdm(missing_booths, desc="Processing missing booths"):
                try:
                    # ブース情報を取得して保存
                    booth_data = self.parse_booth_page(booth_url)
                    booth_id = self.save_booth(booth_data)
                    
                    # ブースページから全アイテムリンクを取得
                    booth_soup = self.get_soup(booth_url)
                    item_links = self.get_item_links(booth_soup)
                    
                    # 各アイテムを処理
                    for item_url in item_links:
                        try:
                            item_data = self.parse_item_page(item_url, booth_id)
                            self.save_item(item_data)
                            time.sleep(0.5)  # レート制限を避けるための待機
                        except Exception as e:
                            print(f"Error processing item {item_url}: {e}")
                    
                    print(f"✓ 追加: {booth_data['name']} - {len(item_links)} アイテム")
                    
                except Exception as e:
                    print(f"Error processing booth {booth_url}: {e}")
                
                time.sleep(1)  # レート制限を避けるための待機
        
        # 保存されているが、アイテムが欠けているブースをチェック
        print("\n保存済みブースの欠けているアイテムをチェック中...")
        items_added = 0
        
        for booth_url in tqdm(all_booth_urls, desc="Checking saved booths for missing items"):
            # ブースIDを取得
            booth_id = self.find_saved_booth_id(booth_url)
            if not booth_id:
                continue  # 何らかの理由でブースがDBに保存されていない
            
            try:
                # ブースページから全アイテムリンクを取得
                booth_soup = self.get_soup(booth_url)
                all_item_urls = self.get_item_links(booth_soup)
                
                # 保存されていないアイテムを取得
                missing_items = self.find_missing_items(booth_id, all_item_urls)
                
                if missing_items:
                    # 欠けているアイテムを処理
                    for item_url in missing_items:
                        try:
                            item_data = self.parse_item_page(item_url, booth_id)
                            self.save_item(item_data)
                            items_added += 1
                            time.sleep(0.5)  # レート制限を避けるための待機
                        except Exception as e:
                            print(f"Error processing item {item_url}: {e}")
                    
                    # このブースのサークル名を取得して表示
                    self.cursor.execute("SELECT name FROM booths WHERE id = ?", (booth_id,))
                    booth_name = self.cursor.fetchone()[0]
                    print(f"✓ アイテム追加: {booth_name} - {len(missing_items)} アイテム")
            
            except Exception as e:
                print(f"Error checking booth {booth_url} for missing items: {e}")
            
            time.sleep(0.5)  # レート制限を避けるための待機
        
        print("\n=== パッチ処理完了 ===")
        print(f"追加されたブース: {len(missing_booths)}")
        print(f"追加されたアイテム: {items_added}")
        
        # 最終的なデータ数を表示
        self.cursor.execute("SELECT COUNT(*) FROM booths")
        total_booths_db = self.cursor.fetchone()[0]
        self.cursor.execute("SELECT COUNT(*) FROM items")
        total_items_db = self.cursor.fetchone()[0]
        
        print(f"\n最終的なデータ数:")
        print(f"ブース数: {total_booths_db}")
        print(f"アイテム数: {total_items_db}")

    def close(self):
        """データベース接続を閉じる"""
        self.conn.close()

def main():
    # パッチクローラーの実行
    crawler = PatchCrawler()
    try:
        crawler.crawl_missing_data()
    finally:
        crawler.close()

if __name__ == "__main__":
    main() 