FROM node:lts-alpine

WORKDIR /app

# ソースファイルをコピー
COPY package*.json ./
RUN npm ci

# アプリケーションソースをコピー
COPY . .

# アプリをビルド
RUN npm run build

# 環境変数を設定
ENV PORT=8080
EXPOSE 8080

# 直接node commandでサーバーを起動
CMD ["node", "dist-server/index.js"]