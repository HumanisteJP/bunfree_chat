FROM python:3.9-slim

WORKDIR /app

# 必要なパッケージをインストール
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Pythonパッケージのインストール
RUN pip install --no-cache-dir \
    cloudscraper \
    beautifulsoup4 \
    python-dotenv \
    qdrant-client \
    voyageai \
    tqdm

# プロジェクトファイルをコピー
COPY scripts/ /app/scripts/
COPY bunfree.db /app/
COPY .env /app/

# データベースファイルをコピー（既存のDBがある場合）
# COPY bunfree.db .

# データディレクトリを作成
RUN mkdir -p cache

# 環境変数の設定
ENV PYTHONUNBUFFERED=1

# エントリポイント（Compute Engineでの実行用）
CMD ["python", "scripts/item_updater.py"] 