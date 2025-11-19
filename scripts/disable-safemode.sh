#!/bin/bash
# Script để tự động tắt HDFS safemode

echo "Đợi HDFS namenode khởi động..."
sleep 10

# Kiểm tra và tắt safemode
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "Kiểm tra safemode (lần thử $((RETRY_COUNT + 1))/$MAX_RETRIES)..."
    
    # Kiểm tra trạng thái safemode
    SAFEMODE_STATUS=$(hdfs dfsadmin -safemode get 2>/dev/null)
    
    if [[ $SAFEMODE_STATUS == *"OFF"* ]]; then
        echo "✅ HDFS safemode đã OFF"
        exit 0
    elif [[ $SAFEMODE_STATUS == *"ON"* ]]; then
        echo "⚠️  HDFS đang ở safemode, đang tắt..."
        hdfs dfsadmin -safemode leave 2>/dev/null
        sleep 2
        
        # Kiểm tra lại
        SAFEMODE_STATUS=$(hdfs dfsadmin -safemode get 2>/dev/null)
        if [[ $SAFEMODE_STATUS == *"OFF"* ]]; then
            echo "✅ Đã tắt safemode thành công!"
            exit 0
        fi
    else
        echo "⏳ HDFS chưa sẵn sàng, đợi thêm..."
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 5
done

echo "❌ Không thể tắt safemode sau $MAX_RETRIES lần thử"
exit 1
