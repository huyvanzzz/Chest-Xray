# HDFS Safemode Auto-Disable

## Vấn đề

HDFS namenode thường khởi động ở chế độ safemode và cần phải tắt thủ công:
```bash
hdfs dfsadmin -safemode leave
```

## Giải pháp

### 1. Cấu hình Namenode (docker-compose.yml)

Thêm các biến môi trường để giảm threshold safemode:

```yaml
environment:
  - HDFS_CONF_dfs_safemode_threshold_pct=0.001      # Chỉ cần 0.1% datanodes
  - HDFS_CONF_dfs_namenode_safemode_min_datanodes=1  # Chỉ cần 1 datanode
```

### 2. Service Tự động Tắt Safemode

Thêm service `hdfs-safemode-disabler` trong docker-compose:

```yaml
hdfs-safemode-disabler:
  image: bde2020/hadoop-namenode:2.0.0-hadoop3.2.1-java8
  container_name: hdfs-safemode-disabler
  entrypoint: ["/scripts/disable-safemode.sh"]
  volumes:
    - ./scripts:/scripts
  networks:
    - genome_hadoop_net
  depends_on:
    namenode:
      condition: service_started
  restart: "no"
```

### 3. Script disable-safemode.sh

Script tự động kiểm tra và tắt safemode:

```bash
#!/bin/bash
# Đợi namenode khởi động
sleep 10

# Thử 30 lần, mỗi lần đợi 5s
for i in {1..30}; do
    STATUS=$(hdfs dfsadmin -safemode get 2>/dev/null)
    
    if [[ $STATUS == *"OFF"* ]]; then
        echo "✅ Safemode đã OFF"
        exit 0
    elif [[ $STATUS == *"ON"* ]]; then
        echo "Tắt safemode (lần $i)..."
        hdfs dfsadmin -safemode leave
        sleep 2
    fi
    
    sleep 5
done
```

## Cách sử dụng

### Khởi động hệ thống:

```bash
docker compose up -d
```

Service `hdfs-safemode-disabler` sẽ tự động:
1. Đợi namenode khởi động
2. Kiểm tra safemode
3. Tắt safemode nếu đang ON
4. Thoát khi hoàn thành

### Kiểm tra logs:

```bash
docker logs hdfs-safemode-disabler
```

Output mong đợi:
```
Đợi HDFS namenode khởi động...
Kiểm tra safemode (lần thử 1/30)...
⚠️  HDFS đang ở safemode, đang tắt...
✅ Đã tắt safemode thành công!
```

### Kiểm tra trạng thái HDFS:

```bash
docker exec namenode hdfs dfsadmin -safemode get
```

Kết quả mong đợi:
```
Safe mode is OFF
```

### Tắt safemode thủ công (nếu cần):

```bash
docker exec namenode hdfs dfsadmin -safemode leave
```

## Troubleshooting

### Service disabler không chạy:

```bash
# Xem logs
docker logs hdfs-safemode-disabler

# Chạy lại
docker compose up -d hdfs-safemode-disabler
```

### Safemode vẫn ON sau vài phút:

```bash
# Kiểm tra datanode
docker ps | grep datanode

# Kiểm tra report
docker exec namenode hdfs dfsadmin -report

# Tắt thủ công
docker exec namenode hdfs dfsadmin -safemode leave
```

### Script không có quyền thực thi:

```bash
chmod +x scripts/disable-safemode.sh
chmod +x scripts/namenode-init.sh
```

## Các phương pháp khác

### Phương pháp 1: Chỉnh sửa namenode entrypoint

Thay đổi entrypoint của namenode container để tự động tắt safemode khi khởi động.

### Phương pháp 2: Init script trong namenode

Mount script vào namenode và chạy trong background.

### Phương pháp 3: Cron job

Tạo cron job kiểm tra và tắt safemode định kỳ.

## Best Practices

1. **Development**: Dùng service tự động tắt safemode
2. **Production**: Cấu hình threshold thấp + health check
3. **Monitoring**: Theo dõi logs của disabler service
4. **Backup**: Giữ script thủ công để emergency

## Health Check

Namenode health check đã được cập nhật:

```yaml
healthcheck:
  test: ["CMD", "bash", "-c", "hdfs dfsadmin -safemode get | grep -q OFF"]
  interval: 10s
  retries: 20
  timeout: 10s
  start_period: 30s
```

Điều này đảm bảo:
- Namenode chỉ healthy khi safemode OFF
- Services phụ thuộc sẽ đợi đến khi safemode OFF
- Tự động retry trong 200s (20 retries × 10s)

## Kết quả

✅ Safemode tự động tắt khi khởi động
✅ Không cần can thiệp thủ công
✅ Services khác đợi đến khi HDFS sẵn sàng
✅ Dễ debug qua logs
