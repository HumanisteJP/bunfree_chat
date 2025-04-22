#!/bin/bash

# 環境変数の設定
PROJECT_ID=$(gcloud config get-value project)
REGION="asia-northeast1"  # 東京リージョン
TOPIC_NAME="bunfree-item-updater-topic"
FUNCTION_NAME="bunfree-item-updater"
SCHEDULER_JOB_NAME="bunfree-item-updater-job"
SCHEDULE="0 */12 * * *"  # 12時間ごとに実行 (0時と12時)
MESSAGE_BODY='{"action": "update_items"}'
SERVICE_ACCOUNT="${FUNCTION_NAME}-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "===== 必要なAPIの有効化 ====="
gcloud services enable cloudfunctions.googleapis.com \
    pubsub.googleapis.com \
    cloudscheduler.googleapis.com \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com

echo "===== サービスアカウントの作成 ====="
# サービスアカウントが存在するか確認
if gcloud iam service-accounts describe ${SERVICE_ACCOUNT} &>/dev/null; then
    echo "サービスアカウント ${SERVICE_ACCOUNT} は既に存在します"
else
    echo "サービスアカウント ${SERVICE_ACCOUNT} を作成します"
    gcloud iam service-accounts create "${FUNCTION_NAME}-sa" \
        --display-name "Service Account for ${FUNCTION_NAME}"
fi

# 必要な権限を付与
echo "サービスアカウントに必要な権限を付与します"
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudfunctions.invoker"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/pubsub.publisher"

echo "===== Pub/Subトピックの作成 ====="
# トピックが存在するか確認
if gcloud pubsub topics describe ${TOPIC_NAME} &>/dev/null; then
    echo "トピック ${TOPIC_NAME} は既に存在します"
else
    echo "トピック ${TOPIC_NAME} を作成します"
    gcloud pubsub topics create ${TOPIC_NAME}
fi

echo "===== Cloud Functionsのデプロイ準備 ====="
# requirements.txtの作成
cat > requirements.txt << EOL
cloudscraper
beautifulsoup4
tqdm
python-dotenv
qdrant_client
voyageai
EOL

# main.pyの作成（item_updater.pyを呼び出す）
cat > main.py << EOL
import base64
import json
import logging
from item_updater import main as updater_main

def process_pubsub_message(event, context):
    """Cloud Pub/Sub からのメッセージを処理します
    
    Args:
        event (dict): イベントペイロード
        context (google.cloud.functions.Context): メタデータ
    """
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            logging.info(f"受信したメッセージ: {pubsub_message}")
            
            # JSONの場合はパース
            try:
                message_data = json.loads(pubsub_message)
                logging.info(f"メッセージ内容: {message_data}")
            except:
                logging.info("JSONでないメッセージを受信")
        
        # item_updater.pyのmain関数を実行
        logging.info("item_updater.pyのメイン処理を開始します")
        updater_main()
        
        return "処理が完了しました"
    except Exception as e:
        logging.error(f"エラーが発生しました: {e}")
        raise
EOL

# item_updater.pyをコピー
cp ../scripts/item_updater.py .

echo "===== Cloud Functionsのデプロイ ====="
gcloud functions deploy ${FUNCTION_NAME} \
    --gen2 \
    --runtime=python39 \
    --region=${REGION} \
    --source=. \
    --entry-point=process_pubsub_message \
    --trigger-topic=${TOPIC_NAME} \
    --service-account=${SERVICE_ACCOUNT} \
    --timeout=540s \
    --memory=1024MB

echo "===== Cloud Schedulerジョブの作成 ====="
# ジョブが既に存在するか確認
if gcloud scheduler jobs describe ${SCHEDULER_JOB_NAME} --location=${REGION} &>/dev/null; then
    echo "スケジューラジョブ ${SCHEDULER_JOB_NAME} は既に存在します。更新します。"
    gcloud scheduler jobs update pubsub ${SCHEDULER_JOB_NAME} \
        --location=${REGION} \
        --schedule="${SCHEDULE}" \
        --topic=${TOPIC_NAME} \
        --message-body="${MESSAGE_BODY}" \
        --time-zone="Asia/Tokyo"
else
    echo "スケジューラジョブ ${SCHEDULER_JOB_NAME} を作成します"
    gcloud scheduler jobs create pubsub ${SCHEDULER_JOB_NAME} \
        --location=${REGION} \
        --schedule="${SCHEDULE}" \
        --topic=${TOPIC_NAME} \
        --message-body="${MESSAGE_BODY}" \
        --time-zone="Asia/Tokyo"
fi

echo "===== セットアップ完了 ====="
echo "Cloud Functions名: ${FUNCTION_NAME}"
echo "Pub/Subトピック名: ${TOPIC_NAME}"
echo "Cloud Schedulerジョブ名: ${SCHEDULER_JOB_NAME}"
echo "スケジュール: ${SCHEDULE} (Asia/Tokyo)"
echo ""
echo "手動で実行するには以下のコマンドを実行してください:"
echo "gcloud scheduler jobs run ${SCHEDULER_JOB_NAME} --location=${REGION}" 