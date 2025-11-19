# Xử Lý Dữ Liệu Y Tế - Genomic Data Processing

**Dự án:** Pipeline xử lý ảnh X-quang ngực sử dụng big-data stack được Docker hóa (HDFS, Spark, Kafka) và mô hình AI (TorchXRayVision) để dự đoán bệnh lý theo bộ dữ liệu NIH ChestX-ray14.

**README này hướng dẫn:** cách thiết lập môi trường, chạy script dự đoán AI cục bộ, và chạy pipeline streaming bằng `docker-compose`.

**Cấu trúc repository (các file/folder quan trọng):**
- `ai/` : Mã nguồn AI và các thư viện Python (`chest-xray.py`, `requirements.txt`).
- `data/` : Các file CSV mẫu và thư mục ảnh (`data.csv`, `patient_subset.csv`, `images/`, `disease_severity.csv`).
- `spark_streaming.py` : Job Spark Structured Streaming đọc metadata từ Kafka, dự đoán bằng AI và ghi kết quả vào HDFS và MongoDB.
- `send_test_metadata.py` : Script hỗ trợ upload ảnh theo batch lên HDFS và publish metadata vào Kafka.
- `docker-compose.yml` : Cấu hình multi-container (HDFS, Spark, Kafka, Zookeeper, Hive và service `spark_streaming`).
- `ai/chest-xray.py` : Module dự đoán; đọc file `disease_severity.csv` và trả về kết quả dự đoán kèm mức độ nghiêm trọng.

**Tổng quan nhanh**
- Pipeline yêu cầu các file ảnh được upload vào HDFS (ví dụ: `/xray/images/batch_XXX/`) và metadata chứa `hdfs_path` được publish vào Kafka topic `xray_metadata`.
- `spark_streaming.py` lắng nghe Kafka, gọi AI predictor, ghi file parquet kết quả vào HDFS và insert records vào MongoDB.

**Yêu cầu hệ thống**
- Docker & Docker Compose (đã test với Docker Compose v3.9)
- (Tùy chọn, cho script AI local) Python 3.8+ và môi trường conda/venv

**Thư viện Python cho AI (xem `ai/requirements.txt`)**
- `torch`
- `torchvision`
- `torchxrayvision`
- `pandas`, `Pillow`, `numpy`

**1) Chạy toàn bộ stack với Docker Compose**
1. Build và khởi động các services (từ thư mục gốc repo):

```bash
docker-compose up --build
```

2. Các services được bao gồm (qua `docker-compose.yml`): HDFS (`namenode`, `datanode*`), Spark (`spark-master`, `spark-worker`), Kafka & Zookeeper, các thành phần Hive, và service `spark_streaming`.

3. Khi các container đã healthy:
   - Upload ảnh vào `./data/images/` (hoặc sử dụng file `data/` có sẵn).
   - Dùng `send_test_metadata.py` để upload ảnh vào HDFS và publish metadata vào Kafka:

```bash
# chạy bên trong container có kết nối mạng với Kafka và HDFS (hoặc chạy local nếu đã cấu hình)
python send_test_metadata.py
```

4. Service `spark_streaming` đọc Kafka topic `xray_metadata`, kích hoạt dự đoán và ghi kết quả vào HDFS path `hdfs://namenode:8020/xray/predictions/` và MongoDB.

**2) Chạy dự đoán AI cục bộ (test nhanh)**
1. Tạo môi trường Python và cài đặt dependencies. Ví dụ với conda:

```bash
conda create -n xray python=3.10 -y
conda activate xray
pip install -r ai/requirements.txt pandas pillow numpy hdfs kafka-python pymongo
```

2. Chạy script dự đoán trên ảnh local (script `ai/chest-xray.py` cung cấp hàm `predict_chest_xray`):

```bash
python ai/chest-xray.py
# Script được thiết lập để chạy một đường dẫn ảnh mẫu khi thực thi trực tiếp.
```

3. Script đọc `data/disease_severity.csv` để ánh xạ bệnh với mức độ nghiêm trọng và trả về các dự đoán đạt ngưỡng xác suất đã cấu hình (mặc định 0.7). Điều chỉnh ngưỡng bằng cách gọi `predict_chest_xray(image_path, threshold=0.6)`.

**3) Hướng dẫn sử dụng chi tiết**

### 3.1) Chuẩn bị dữ liệu ảnh X-quang

**Bước 1: Đặt ảnh vào thư mục local**
```bash
# Tạo thư mục chứa ảnh nếu chưa có
mkdir -p data/images

# Copy ảnh X-quang (định dạng PNG/JPG) vào thư mục
cp /path/to/your/xray/*.png data/images/
```

**Bước 2: Chuẩn bị file CSV metadata**
Tạo hoặc chỉnh sửa `data/patient_subset.csv` với các cột:
- `Image Index`: Tên file ảnh (VD: `00000001_000.png`)
- `Patient ID`: ID bệnh nhân
- `Patient Age`: Tuổi
- `Patient Sex`: Giới tính (M/F)
- `Follow-up #`: Số lần theo dõi

Ví dụ:
```csv
Image Index,Follow-up #,Patient ID,Patient Age,Patient Sex
00000001_000.png,0,1,58,M
00000002_000.png,0,2,45,F
```

### 3.2) Upload ảnh lên HDFS

**Cách 1: Sử dụng script tự động (khuyến nghị)**
```bash
# Chạy script upload batch tự động
python send_test_metadata.py
```

Script này sẽ:
- Đọc `data/patient_subset.csv`
- Upload ảnh từ `data/images/` lên HDFS theo batch (`/xray/images/batch_001/`, `/xray/images/batch_002/`, ...)
- Tự động tạo Kafka topic `xray_metadata` nếu chưa có
- Publish metadata (bao gồm `hdfs_path`) vào Kafka

**Cách 2: Upload thủ công bằng HDFS CLI**
```bash
# Vào container namenode
docker exec -it namenode bash

# Tạo thư mục trên HDFS
hdfs dfs -mkdir -p /xray/images/batch_manual

# Upload ảnh từ local vào HDFS
hdfs dfs -put /data/images/*.png /xray/images/batch_manual/

# Kiểm tra ảnh đã upload
hdfs dfs -ls /xray/images/batch_manual/

# Xem nội dung file
hdfs dfs -cat /xray/images/batch_manual/00000001_000.png | head -c 100
```

**Cách 3: Sử dụng Python HDFS client**
```python
from hdfs import InsecureClient

# Kết nối HDFS
client = InsecureClient('http://namenode:9870')

# Upload một ảnh
client.upload('/xray/images/test/image.png', 'data/images/image.png')

# Upload cả thư mục
for file in os.listdir('data/images'):
    local_path = f'data/images/{file}'
    hdfs_path = f'/xray/images/batch_001/{file}'
    client.upload(hdfs_path, local_path, overwrite=True)
```

### 3.3) Làm việc với HDFS

**Các lệnh HDFS thường dùng:**

```bash
# Liệt kê file/thư mục
docker exec namenode hdfs dfs -ls /xray/images/

# Tạo thư mục mới
docker exec namenode hdfs dfs -mkdir -p /xray/images/new_batch

# Xóa file/thư mục
docker exec namenode hdfs dfs -rm /xray/images/batch_001/image.png
docker exec namenode hdfs dfs -rm -r /xray/images/batch_001/

# Download file từ HDFS về local
docker exec namenode hdfs dfs -get /xray/images/batch_001/image.png /tmp/

# Copy file trong HDFS
docker exec namenode hdfs dfs -cp /xray/images/batch_001/image.png /xray/backup/

# Kiểm tra dung lượng
docker exec namenode hdfs dfs -du -h /xray/images/

# Xem thông tin file
docker exec namenode hdfs dfs -stat "%n %b %y" /xray/images/batch_001/image.png

# Đếm số file
docker exec namenode hdfs dfs -count /xray/images/
```

**Cấu trúc thư mục HDFS được khuyến nghị:**
```
/xray/
├── images/              # Ảnh gốc
│   ├── batch_001/
│   ├── batch_002/
│   └── batch_003/
├── predictions/         # Kết quả dự đoán (parquet)
│   └── checkpoints/     # Spark streaming checkpoints
└── backup/              # Backup dữ liệu
```

### 3.4) Đường dẫn HDFS trong hệ thống

**Định dạng đường dẫn HDFS:**
```
hdfs://namenode:9000/xray/images/batch_001/00000001_000.png
```

- **Hostname**: `namenode` (tên container trong docker-compose)
- **Port**: `9000` (HDFS default port) hoặc `8020` (alternative port)
- **Path**: Đường dẫn tuyệt đối trong HDFS

**Truy cập HDFS từ các service khác nhau:**

1. **Từ Spark:**
```python
# Đọc ảnh từ HDFS trong Spark
df = spark.read.format("image").load("hdfs://namenode:9000/xray/images/batch_001/")

# Ghi parquet vào HDFS
df.write.mode("append").parquet("hdfs://namenode:8020/xray/predictions/")
```

2. **Từ Python local (qua HDFS client):**
```python
from hdfs import InsecureClient

client = InsecureClient('http://namenode:9870')  # Web HDFS port
files = client.list('/xray/images/batch_001/')
```

3. **Từ Web UI:**
- Truy cập: `http://localhost:9870`
- Navigate: Utilities → Browse the file system
- Có thể xem, download file trực tiếp

### 3.5) Publish metadata vào Kafka

**Định dạng message Kafka:**
```json
{
  "Image Index": "00000001_000.png",
  "Follow-up #": "0",
  "Patient ID": "1",
  "Patient Age": 58,
  "Patient Sex": "M",
  "hdfs_path": "hdfs://namenode:9000/xray/images/batch_001/00000001_000.png"
}
```

**Publish thủ công:**
```python
from kafka import KafkaProducer
import json

producer = KafkaProducer(
    bootstrap_servers=['localhost:9092'],
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

metadata = {
    "Image Index": "00000001_000.png",
    "Patient ID": "1",
    "Patient Age": 58,
    "Patient Sex": "M",
    "hdfs_path": "hdfs://namenode:9000/xray/images/batch_001/00000001_000.png"
}

producer.send('xray_metadata', metadata)
producer.flush()
```

**Kiểm tra Kafka topic:**
```bash
# Vào container Kafka
docker exec -it kafka bash

# Liệt kê topics
kafka-topics.sh --list --bootstrap-server localhost:9092

# Xem messages trong topic
kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic xray_metadata --from-beginning --max-messages 10
```

**4) Các file dữ liệu**
- `data/data.csv` : CSV chứa id ảnh và nhãn nhị phân (tập con mẫu). Các cột bao gồm 14 nhãn NIH cộng với một số cột đặc thù của dataset.
- `data/disease_severity.csv` : CSV ánh xạ `Disease,Severity_Level,Severity_Name,Description`. Được sử dụng bởi `ai/chest-xray.py` để gán mức độ nghiêm trọng cho các nhãn được phát hiện.
- `data/patient_subset.csv` : CSV chứa metadata bệnh nhân để upload lên HDFS và Kafka.

**5) Chi tiết streaming pipeline**

### 5.1) Luồng xử lý dữ liệu

```
Ảnh X-quang (Local)
    ↓ upload
HDFS (/xray/images/batch_XXX/)
    ↓ metadata (hdfs_path, patient info)
Kafka (topic: xray_metadata)
    ↓ consume
Spark Streaming
    ↓ predict (AI model)
HDFS (/xray/predictions/) + MongoDB
```

### 5.2) Script upload ảnh: `send_test_metadata.py`

**Chức năng:**
- Đọc `patient_subset.csv` để lấy danh sách ảnh cần xử lý
- Upload ảnh từ `./data/images` vào HDFS theo batch (mỗi batch 5 ảnh)
- Tự động tạo Kafka topic `xray_metadata` nếu chưa tồn tại
- Publish metadata JSON (bao gồm `hdfs_path`) vào Kafka
- Delay 10 giây giữa các batch

**Cấu hình trong script:**
```python
KAFKA_SERVER = 'kafka:9092'           # Kafka broker
TOPIC = 'xray_metadata'                # Topic name
HDFS_URL = 'http://namenode:9870'     # HDFS Web UI
HDFS_BASE_DIR = "/xray/images"        # Thư mục gốc trên HDFS
LOCAL_IMAGES_DIR = "/app/data/images" # Thư mục ảnh local
BATCH_SIZE = 5                         # Số ảnh mỗi batch
INTERVAL_SEC = 10                      # Delay giữa các batch
```

**Chạy script:**
```bash
# Trong container spark_streaming
docker exec -it spark_streaming python send_test_metadata.py

# Hoặc từ local (nếu đã config network)
python send_test_metadata.py
```

**Output mẫu:**
```
[DEBUG] Topic xray_metadata đã tồn tại
[DEBUG] Folder HDFS /xray/images đã tồn tại
[DEBUG] Batch 001 - preparing 5 images
[DEBUG] Upload /app/data/images/00000001_000.png -> /xray/images/batch_001/00000001_000.png
[DEBUG] Sent metadata to Kafka: 00000001_000.png
[INFO] Batch 001: 5 ảnh -> HDFS, metadata gửi Kafka
```

### 5.3) Spark Streaming job: `spark_streaming.py`

**Chức năng:**
- Consume messages từ Kafka topic `xray_metadata`
- Parse JSON metadata
- Gọi AI predictor (via UDF) với `hdfs_path`
- Ghi kết quả dự đoán vào:
  - HDFS: `/xray/predictions/` (định dạng Parquet)
  - MongoDB: collection `xray.predictions`

**Schema dữ liệu xử lý:**
```python
schema = StructType([
    StructField("Image Index", StringType()),
    StructField("Patient ID", StringType()),
    StructField("Patient Age", IntegerType()),
    StructField("Patient Sex", StringType()),
    StructField("hdfs_path", StringType())
])
```

**Kết quả dự đoán:**
- Cột mới: `predicted_label` (string chứa JSON kết quả)
- Format: `{"disease": "Pneumonia", "probability": 0.85, "severity": 3}`

**Checkpoint location:**
- HDFS: `hdfs://namenode:8020/xray/predictions/checkpoints/`
- MongoDB: `hdfs://namenode:8020/xray/predictions/checkpoints_mongo/`

**Xem logs:**
```bash
# Xem logs Spark Streaming
docker logs -f spark_streaming

# Hoặc xem trong Spark UI
# Truy cập: http://localhost:8080
```

### 5.4) Xem kết quả dự đoán

**Từ HDFS (Parquet files):**
```bash
# Liệt kê các file parquet
docker exec namenode hdfs dfs -ls /xray/predictions/

# Đọc parquet bằng Python
from pyspark.sql import SparkSession
spark = SparkSession.builder.getOrCreate()
df = spark.read.parquet("hdfs://namenode:8020/xray/predictions/")
df.show(10)
```

**Từ MongoDB:**
```python
from pymongo import MongoClient

# Kết nối MongoDB
client = MongoClient("mongodb+srv://Bigdata:<password>@clusterxray.ahgkigy.mongodb.net/")
db = client["xray"]
collection = db["predictions"]

# Query kết quả
for doc in collection.find().limit(10):
    print(doc)

# Query theo điều kiện
high_risk = collection.find({"predicted_label": {"$regex": "severity.*4"}})
```

**Từ Web UI HDFS:**
- Truy cập: `http://localhost:9870/explorer.html#/xray/predictions`
- Download parquet files để phân tích offline

Lưu ý:
- Khi chạy Spark jobs import các hàm Python sử dụng thư viện ML nặng (PyTorch), đảm bảo worker environment có cùng dependencies hoặc đóng gói hàm thành service nhỏ; việc nhúng các thư viện native lớn vào Spark UDFs có thể rất nặng.

**6) Quản lý và giám sát hệ thống**

### 6.1) Web UI các services

| Service | URL | Mô tả |
|---------|-----|-------|
| HDFS NameNode | http://localhost:9870 | Quản lý file system, xem dung lượng, browse files |
| Spark Master | http://localhost:8080 | Giám sát Spark cluster, workers, applications |
| Spark Worker | http://localhost:8081 | Chi tiết worker node, tasks đang chạy |
| Kafka Manager | Cần cài thêm | Quản lý topics, consumers, partitions |

### 6.2) Giám sát HDFS

```bash
# Kiểm tra HDFS health
docker exec namenode hdfs dfsadmin -report

# Xem dung lượng sử dụng
docker exec namenode hdfs dfs -df -h

# Kiểm tra replication
docker exec namenode hdfs fsck /xray -files -blocks -locations
```

### 6.3) Giám sát Kafka

```bash
# Xem danh sách consumer groups
docker exec kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# Xem lag của consumer
docker exec kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group spark-streaming-group --describe

# Xem số messages trong topic
docker exec kafka kafka-run-class.sh kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 --topic xray_metadata
```

### 6.4) Giám sát Spark

```bash
# Xem applications đang chạy
docker exec spark-master /spark/bin/spark-submit --status

# Xem logs của worker
docker logs -f spark-worker

# Kill application
docker exec spark-master /spark/bin/spark-submit --kill <app-id>
```

### 6.5) Backup và phục hồi

**Backup HDFS:**
```bash
# Backup thư mục images
docker exec namenode hdfs dfs -get /xray/images /backup/images_backup

# Hoặc dùng distcp cho large datasets
docker exec namenode hadoop distcp /xray/images /backup/images_backup
```

**Backup MongoDB:**
```bash
# Export collection
mongodump --uri="mongodb+srv://..." --db=xray --collection=predictions --out=/backup/
```

**Restore:**
```bash
# Restore HDFS
docker exec namenode hdfs dfs -put /backup/images_backup/* /xray/images/

# Restore MongoDB
mongorestore --uri="mongodb+srv://..." --db=xray /backup/xray/
```

**7) MongoDB**
- Thông tin kết nối có trong `spark_streaming.py` và `mongodb.py`. Cập nhật `MONGO_URI` / thông tin đăng nhập trước khi sử dụng remote MongoDB Atlas cluster.
- Database: `xray`
- Collection: `predictions` (chứa kết quả dự đoán từ Spark Streaming)
- Indexes được khuyến nghị: `{"Image Index": 1}`, `{"Patient ID": 1}`, `{"predicted_label": 1}`

**8) Khắc phục sự cố**

### 8.1) Lỗi thường gặp

**Lỗi 1: HDFS SafeMode**
```
org.apache.hadoop.hdfs.server.namenode.SafeModeException
```
**Giải pháp:**
```bash
# Thoát safe mode
docker exec namenode hdfs dfsadmin -safemode leave

# Kiểm tra trạng thái
docker exec namenode hdfs dfsadmin -safemode get
```

**Lỗi 2: Kafka Connection Refused**
```
kafka.errors.NoBrokersAvailable
```
**Giải pháp:**
```bash
# Kiểm tra Kafka đang chạy
docker ps | grep kafka

# Restart Kafka
docker-compose restart kafka zookeeper

# Kiểm tra logs
docker logs kafka
```

**Lỗi 3: Model Download Failed**
```
urllib.error.URLError: <urlopen error [Errno -2] Name or service not known>
```
**Giải pháp:**
```bash
# Download model thủ công
wget https://github.com/mlmed/torchxrayvision/releases/download/v1/nih-densenet121-d121-tw-lr001-rot45-tr15-sc15-seed0-best.pt \
  -O ~/.torchxrayvision/models_data/nih-densenet121-d121-tw-lr001-rot45-tr15-sc15-seed0-best.pt
```

**Lỗi 4: Out of Memory (Spark)**
```
java.lang.OutOfMemoryError: Java heap space
```
**Giải pháp:**
Tăng memory cho Spark trong `docker-compose.yml`:
```yaml
spark-worker:
  environment:
    - SPARK_WORKER_MEMORY=4g
    - SPARK_EXECUTOR_MEMORY=2g
```

**Lỗi 5: Permission Denied (HDFS)**
```
Permission denied: user=root, access=WRITE
```
**Giải pháp:**
```bash
# Thay đổi quyền truy cập
docker exec namenode hdfs dfs -chmod -R 777 /xray/

# Hoặc thay đổi owner
docker exec namenode hdfs dfs -chown -R root:supergroup /xray/
```

### 8.2) Debug tips

**Kiểm tra kết nối giữa containers:**
```bash
# Ping từ spark_streaming tới namenode
docker exec spark_streaming ping namenode

# Ping tới kafka
docker exec spark_streaming ping kafka

# Kiểm tra port
docker exec spark_streaming nc -zv namenode 9000
docker exec spark_streaming nc -zv kafka 9092
```

**Xem logs chi tiết:**
```bash
# Tất cả containers
docker-compose logs -f

# Một container cụ thể
docker logs -f spark_streaming --tail 100

# Grep error
docker logs spark_streaming 2>&1 | grep -i error
```

**Restart services:**
```bash
# Restart một service
docker-compose restart spark_streaming

# Restart tất cả
docker-compose restart

# Rebuild và restart
docker-compose up -d --build spark_streaming
```

**Clean up và reset:**
```bash
# Xóa containers và volumes
docker-compose down -v

# Xóa images
docker rmi $(docker images -q genomic-data-processing*)

# Start lại từ đầu
docker-compose up --build
```

**9) Workflow hoàn chỉnh - Ví dụ từ đầu đến cuối**

### Bước 1: Khởi động hệ thống
```bash
# Clone repo
git clone https://github.com/huyvanzzz/Genomic-Data-Processing.git
cd Genomic-Data-Processing

# Khởi động stack
docker-compose up -d --build

# Đợi các services healthy (2-3 phút)
docker-compose ps
```

### Bước 2: Chuẩn bị dữ liệu
```bash
# Đặt ảnh X-quang vào thư mục
cp /path/to/xray/images/*.png data/images/

# Kiểm tra file CSV
cat data/patient_subset.csv
```

### Bước 3: Upload dữ liệu
```bash
# Chạy script upload
docker exec spark_streaming python send_test_metadata.py

# Hoặc upload thủ công
docker exec namenode hdfs dfs -put /data/images/00000001_000.png /xray/images/manual/
```

### Bước 4: Kiểm tra dữ liệu đã upload
```bash
# Xem trên HDFS
docker exec namenode hdfs dfs -ls /xray/images/batch_001/

# Xem messages Kafka
docker exec kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic xray_metadata --from-beginning --max-messages 5
```

### Bước 5: Giám sát Spark Streaming
```bash
# Xem logs real-time
docker logs -f spark_streaming

# Hoặc qua Web UI
# Mở browser: http://localhost:8080
```

### Bước 6: Xem kết quả
```bash
# Xem file parquet trên HDFS
docker exec namenode hdfs dfs -ls /xray/predictions/

# Query MongoDB
docker exec spark_streaming python -c "
from pymongo import MongoClient
client = MongoClient('mongodb+srv://...')
for doc in client.xray.predictions.find().limit(5):
    print(doc)
"
```

### Bước 7: Download kết quả về local
```bash
# Download parquet files
docker exec namenode hdfs dfs -get /xray/predictions/*.parquet ./results/

# Đọc bằng pandas
python -c "
import pandas as pd
df = pd.read_parquet('results/part-00000-*.parquet')
print(df.head())
"
```

**10) Các bước tiếp theo / Gợi ý**
- Thêm Flask/FastAPI wrapper nhẹ cho predictor để tránh import thư viện ML nặng vào Spark executors.
- Thêm unit tests và script nhỏ để validate kết nối HDFS/Kafka.
- Thêm `requirements-dev.txt` và `Makefile` hoặc shell scripts để đơn giản hóa các tác vụ thường gặp.
- Cài đặt monitoring với Prometheus + Grafana để giám sát real-time.
- Implement data validation và quality checks trước khi xử lý.
- Thêm retry logic và error handling cho production.

---
**Cần hỗ trợ thêm?** Tôi có thể: 1) tạo helper scripts để khởi động stack và upload dữ liệu mẫu, 2) thêm REST wrapper nhỏ cho predictor, hoặc 3) chuẩn bị CI/packaging.
