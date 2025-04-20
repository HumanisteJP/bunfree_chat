import sqlite3

def create_database():
    # データベースに接続（ない場合は作成される）
    conn = sqlite3.connect('bunfree.db')
    cursor = conn.cursor()

    # ブーステーブルの作成
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS booths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        yomi TEXT,
        category TEXT,
        area TEXT,
        area_number TEXT,
        members TEXT,
        twitter TEXT,
        instagram TEXT,
        website_url TEXT,
        description TEXT,
        map_number INTEGER,
        position_top REAL,
        position_left REAL,
        url TEXT UNIQUE
    )
    ''')

    # アイテムテーブルの作成
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booth_id INTEGER,
        name TEXT NOT NULL,
        yomi TEXT,
        genre TEXT,
        author TEXT,
        item_type TEXT,
        page_count INTEGER,
        release_date TEXT,
        price INTEGER,
        url TEXT,
        page_url TEXT UNIQUE,
        description TEXT,
        FOREIGN KEY (booth_id) REFERENCES booths (id)
    )
    ''')

    # 変更を保存
    conn.commit()
    conn.close()

if __name__ == "__main__":
    create_database() 