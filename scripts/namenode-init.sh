#!/bin/bash
# Script khởi động namenode và tự động tắt safemode

# Khởi động namenode như bình thường
/entrypoint.sh &
NAMENODE_PID=$!

echo "Namenode đang khởi động (PID: $NAMENODE_PID)..."
sleep 15

# Đợi namenode sẵn sàng
echo "Đợi namenode sẵn sàng..."
until hdfs dfsadmin -report &>/dev/null; do
    echo "Chờ namenode..."
    sleep 3
done

echo "Namenode đã sẵn sàng!"

# Tắt safemode
echo "Kiểm tra và tắt safemode..."
SAFEMODE_STATUS=$(hdfs dfsadmin -safemode get)

if [[ $SAFEMODE_STATUS == *"ON"* ]]; then
    echo "Safemode đang ON, đang tắt..."
    hdfs dfsadmin -safemode leave
    echo "✅ Đã tắt safemode"
else
    echo "✅ Safemode đã OFF"
fi

# Giữ container chạy
wait $NAMENODE_PID
