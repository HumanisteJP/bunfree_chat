# Google Compute Engine での定期実行設定手順

GCP上でitem_updater.pyスクリプトを定期実行するための設定手順だよ！データベースファイルのアクセスや長時間実行が必要なので、Compute Engineが最適👍

## 1. Compute Engine インスタンスの作成（最小コスト版）

```bash
gcloud compute instances create item-updater-vm \
    --machine-type=e2-small \
    --zone=asia-northeast1-a \
    --image-family=debian-11 \
    --image-project=debian-cloud \
    --boot-disk-size=20GB \
    --scopes=cloud-platform \
    --preemptible
```

💡 **ポイント**:
- `e2-small`（2vCPU、2GB RAM）は最小コストで運用可能！月額約$12程度
- `--preemptible`フラグでスポットVMとして作成すれば、さらに約70%コスト削減
- メモリが足りない場合は`e2-medium`（2vCPU、4GB RAM）にアップグレード
- `asia-northeast1-a`は東京リージョン。レイテンシー低くしたいならこれがおすすめ

## 2. インスタンスへの接続とセットアップ

```bash
# SSHでインスタンスに接続
gcloud compute ssh item-updater-vm --zone=asia-northeast1-a

# 必要なパッケージのインストール
sudo apt-get update
sudo apt-get install -y git python3-pip python3-dev build-essential libxml2-dev libxslt1-dev

# リポジトリのクローン（GitHubなどに保存している場合）
git clone https://github.com/yourusername/bunfree_chat.git
cd bunfree_chat

# 依存関係のインストール
pip3 install cloudscraper bs4 tqdm qdrant-client voyageai python-dotenv
```

## 3. バックアップ設定とデータ転送

```bash
# ローカルから既存のbunfree.dbをアップロード（別のターミナルで実行）
gcloud compute scp bunfree.db item-updater-vm:~/bunfree_chat/bunfree.db --zone=asia-northeast1-a

# バックアップスクリプトの作成
cat > backup.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d%H%M%S)
BACKUP_DIR=~/backups
mkdir -p $BACKUP_DIR
cp ~/bunfree_chat/bunfree.db $BACKUP_DIR/bunfree.db.$TIMESTAMP
# 30日以上前のバックアップを削除
find $BACKUP_DIR -name "bunfree.db.*" -mtime +30 -delete
EOF

chmod +x backup.sh
```

## 4. 環境変数の設定

```bash
# 環境変数の設定
cat > .env << EOF
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
VOYAGE_API_KEY=your_voyage_api_key
EOF
```

## 5. 12時間ごとの定期実行設定

```bash
# cronジョブの設定 (12時間ごとに実行：0時と12時)
(crontab -l 2>/dev/null; echo "0 0,12 * * * cd /home/$USER/bunfree_chat && ./backup.sh && python3 scripts/item_updater.py >> /home/$USER/item_updater.log 2>&1") | crontab -

# バックアップを取らない一時間ごとの実行
(crontab -l 2>/dev/null; echo "0 * * * * cd /home/$USER/bunfree_chat && python3 scripts/item_updater.py >> /home/$USER/item_updater.log 2>&1") | crontab -

# crontabをリセットするコマンド
# crontab -r

# 設定確認
crontab -l
```


## 6. 実行スクリプトの作成（コスト削減版）

```bash
# 実行スクリプトの作成
cat > run_updater.sh << 'EOF'
#!/bin/bash
cd /home/$USER/bunfree_chat

# バックアップを実行
./backup.sh

# 開始時刻を記録
echo "===== 実行開始: $(date) =====" >> /home/$USER/item_updater.log

# スクリプト実行
python3 scripts/item_updater.py >> /home/$USER/item_updater.log 2>&1

# 終了時刻を記録
echo "===== 実行終了: $(date) =====" >> /home/$USER/item_updater.log

# スクリプト終了後にインスタンスを停止
sudo shutdown -h now
EOF

chmod +x run_updater.sh
```

## 7. インスタンススケジュールによる自動起動（公式機能使用）

GCPには便利なインスタンススケジュール機能があるよ！これを使うと簡単に自動起動と停止がセットアップできるよ！

```bash
# インスタンススケジュールの作成（12時間ごとの起動）
gcloud compute resource-policies create instance-schedule item-updater-schedule \
    --description="12時間ごとにitem-updaterを実行" \
    --vm-start-schedule="0 0,12 * * *" \
    --timezone=Asia/Tokyo \
    --region=asia-northeast1

# インスタンスにスケジュールを適用
gcloud compute instances add-resource-policies item-updater-vm \
    --resource-policies=item-updater-schedule \
    --zone=asia-northeast1-a

# 停止スケジュールの追加
gcloud compute resource-policies update instance-schedule item-updater-schedule \
  --region=asia-northeast1 \
  --vm-stop-schedule="0 1,13 * * *"

gcloud compute resource-policies describe item-updater-schedule --region=asia-northeast1
```

スケジュールを変更したい場合：
```bash
# インスタンススケジュールの削除（必要な場合）
gcloud compute instances remove-resource-policies item-updater-vm \
    --resource-policies=item-updater-schedule \
    --zone=asia-northeast1-a

gcloud compute resource-policies delete item-updater-schedule \
    --region=asia-northeast1
```

## 8. 自動停止設定※使わない

スクリプト完了後に自動停止するために、cronジョブを以下のように変更:

```bash
# run_updater.shを使って実行と停止を自動化
(crontab -l | grep -v "item_updater.py"; echo "5 0,12 * * * cd /home/$USER/bunfree_chat && ./run_updater.sh") | crontab -
```

💡 **ポイント**:
- インスタンススケジュールで0時と12時ちょうどに起動
- cronジョブは5分後の「0時5分」と「12時5分」に実行（起動完了までの余裕を持たせる）
- スクリプト完了後は自動的にシャットダウン
- こうすることで、実行時間分（1〜2時間程度）のみ課金されて大幅にコスト削減！

## 9. ログと監視

実行状況を確認するには:

```bash
# ログの確認
tail -f ~/item_updater.log

# データベースの確認
sqlite3 ~/bunfree_chat/bunfree.db "SELECT COUNT(*) FROM items;"
```

## 10. コスト最適化のヒント

- **最小インスタンス**: SQLiteのみの処理なら`e2-small`（月額$12程度）で十分
- **スポットVMの活用**: プリエンプティブルVM（スポットVM）を使用すれば70%以上安くなる
- **自動起動/停止**: 実行時間帯のみVMを起動することで、月に数時間（数十円）程度の課金に抑えられる
- **永続ディスクの最適化**: 標準HDDを使用することで、ストレージコストも削減可能
- **実行頻度の調整**: アイテム更新頻度に応じて、12時間→1日1回などに調整も可能

## 11. 想定コスト（アジアリージョン）

| 設定 | 月額コスト（概算） |
|-----|------------|
| e2-small (2GB) + 常時起動 | $16.41 |
| e2-small (2GB) + スポットVM + 常時起動 | $4.93 |
| e2-small (2GB) + スポットVM + 1日2時間稼働 | $0.41 |
| e2-small (2GB) + スポットVM + 1日4時間稼働 | $0.82 |
| e2-medium (4GB) + スポットVM + 1日2時間稼働 | $0.61 |

※ スポットVMは中断されるリスクがあるので、重要なバックアップなどは別途考慮してね 