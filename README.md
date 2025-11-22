# X-Ray Prediction System - Hệ thống Phân tích Ảnh X-quang Phổi

Hệ thống phân tích ảnh X-quang ngực tự động sử dụng Deep Learning và Big Data để phát hiện 14 loại bệnh lý phổi phổ biến, với khả năng xử lý streaming real-time và quản lý hàng đợi ưu tiên dựa trên mức độ nguy hiểm.

## Mục lục

- [Quick Start](#-quick-start)
- [Kiến trúc Hệ thống](#-kiến-trúc-hệ-thống)
- [Pipeline Xử lý](#-pipeline-xử-lý)
- [Chi tiết Components](#-chi-tiết-components)
- [Giao diện Web](#-giao-diện-web)
- [API Documentation](#-api-documentation)

---

## Quick Start

### Yêu cầu hệ thống

- Docker & Docker Compose
- Tối thiểu 8GB RAM
- 20GB dung lượng trống

### Khởi động hệ thống

```bash
# 1. Clone repository
git clone <repository-url>
cd Genomic-Data-Processing

# 2. Khởi động toàn bộ hệ thống
docker compose up -d --build

# 3. Chờ các services khởi động (khoảng 1-2 phút)
docker compose ps

# 4. Truy cập giao diện web
# Frontend: http://localhost:3000
# HDFS NameNode UI: http://localhost:9870
# Spark Master UI: http://localhost:8080
# Backend API: http://localhost:8000/docs
```

### Kiểm tra trạng thái

```bash
# Xem logs của từng service
docker logs xray-backend
docker logs spark_streaming
docker logs namenode

# Kiểm tra health của API
curl http://localhost:8000/health
```

### Dừng hệ thống

```bash
docker compose down
```

### Dừng và xóa tất cả dữ liệu

```bash
docker compose down -v
```

---

## Kiến trúc Hệ thống

```
┌─────────────────────────────────────────────────────────────────────┐
│                          React Frontend (Port 3000)                  │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬────────┐ │
│  │Dashboard │ Upload   │ Priority │ Patients │ Results  │ Logs   │ │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴────────┘ │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP/WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Port 8000)                       │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬────────┐ │
│  │ Upload   │ Query    │ Priority │ WebSocket│ Image    │ Logs   │ │
│  │ Router   │ Router   │ Router   │ Router   │ Serving  │ Stream │ │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴────────┘ │
└───┬──────────────────────┬──────────────────────┬──────────────────┘
    │                      │                      │
    │ Produce              │ Query                │ Read Images
    ▼                      ▼                      ▼
┌──────────┐          ┌──────────┐          ┌──────────────────┐
│  Kafka   │          │ MongoDB  │          │  HDFS Cluster    │
│  Broker  │          │ Database │          │  (NameNode +     │
│          │          │          │          │   3 DataNodes)   │
└────┬─────┘          └────▲─────┘          └────▲─────────────┘
     │ Topic:              │ Write               │ Write
     │ xray_metadata       │ Results             │ Images
     │                     │                     │
     └─────────────────────┴─────────────────────┘
                           │
                           ▼
     ┌──────────────────────────────────────────────────────┐
     │         Spark Streaming (spark_streaming.py)         │
     │  ┌────────────────────────────────────────────────┐  │
     │  │ 1. Consume from Kafka                          │  │
     │  │ 2. Read X-ray image from HDFS                  │  │
     │  │ 3. Run AI prediction (DenseNet121)             │  │
     │  │ 4. Calculate severity & priority               │  │
     │  │ 5. Write to MongoDB + HDFS (Parquet)           │  │
     │  └────────────────────────────────────────────────┘  │
     └──────────────────────────────────────────────────────┘
```

---

## Pipeline Xử lý

### 1. Upload & Ingestion Phase

```
User Upload Image (Frontend)
         │
         ▼
[Backend: Upload Router]
         │
         ├─> Validate image (format, size, dimensions)
         │
         ├─> Save to HDFS (/xray/images/<uuid>.png)
         │
         ├─> Create metadata JSON
         │   {
         │     "Image Index": "<uuid>.png",
         │     "Patient ID": "...",
         │     "Patient Name": "...",
         │     "hdfs_path": "hdfs://namenode:9000/xray/images/<uuid>.png"
         │   }
         │
         └─> Publish to Kafka topic: "xray_metadata"
```

**Vai trò các component:**
- **FastAPI Backend**: Xử lý upload, validation, lưu HDFS, publish Kafka
- **HDFS**: Lưu trữ ảnh X-ray với replication factor = 3
- **Kafka**: Message queue để decouple upload và processing

### 2. Streaming Processing Phase

```
[Spark Streaming Job - Chạy 24/7]
         │
         ├─> Read Stream from Kafka
         │   (auto offset management)
         │
         ├─> Parse JSON metadata
         │
         ├─> For each message:
         │   │
         │   ├─> Read image from HDFS (WebHDFS API)
         │   │
         │   ├─> AI Prediction (TorchXRayVision DenseNet121)
         │   │   - Input: 224x224 grayscale image
         │   │   - Output: Probabilities for 14 diseases
         │   │   - Filter: Keep predictions > 0.65 threshold
         │   │
         │   ├─> Enrich với disease severity
         │   │   (từ disease_severity.csv)
         │   │   - Level 0-4: Bình thường → Cấp cứu
         │   │   - Description tiếng Việt
         │   │
         │   ├─> Sort by severity (high → low)
         │   │
         │   └─> Create prediction result JSON
         │       {
         │         "Image Index": "...",
         │         "Patient ID": "...",
         │         "predicted_label": [
         │           {
         │             "disease": "Pneumonia",
         │             "probability": 0.89,
         │             "severity_level": 3,
         │             "severity_name": "Nghiêm trọng",
         │             "description": "Viêm phổi..."
         │           },
         │           ...
         │         ],
         │         "timestamp": "...",
         │         "hdfs_path": "..."
         │       }
         │
         ├─> Write to MongoDB (collection: predictions)
         │   - For real-time query
         │   - Indexed by Patient ID, Image Index
         │
         └─> Write to HDFS Parquet (backup/analytics)
             - Path: /xray/predictions/*.parquet
             - With checkpointing for fault tolerance
```

**Vai trò các component:**
- **Spark Streaming**: Engine xử lý streaming với micro-batch
- **AI Model**: DenseNet121 pretrained trên NIH ChestX-ray14 dataset
- **MongoDB**: NoSQL database cho query nhanh
- **HDFS Parquet**: Long-term storage, analytics

### 3. Query & Display Phase

```
[Frontend Request]
         │
         ├─> Dashboard Stats
         │   GET /api/stats
         │   └─> MongoDB aggregate: count by severity
         │
         ├─> Priority Queue
         │   GET /api/priority/statistics
         │   └─> MongoDB query với priority_score
         │       = (severity_level * 10) + (waiting_hours * 0.5)
         │       Sort DESC → Ưu tiên bệnh nặng + chờ lâu
         │
         ├─> Search Patient
         │   GET /api/search-by-name?name=...
         │   └─> MongoDB text search trên Patient Name
         │
         ├─> View X-ray Image
         │   GET /api/xray-image/<image_name>
         │   └─> Read từ HDFS → Stream to browser
         │
         └─> Real-time Updates
             WebSocket /api/ws/stats
             └─> Push mới nhất về stats mỗi 5s
```

**Vai trò các component:**
- **FastAPI Backend**: REST API + WebSocket server
- **MongoDB**: Fast queries với indexing
- **HDFS**: Serve images qua StreamingResponse

---

## Chi tiết Components

### 1. HDFS (Hadoop Distributed File System)

**Purpose**: Lưu trữ phân tán, fault-tolerant cho ảnh X-ray và kết quả

**Architecture**:
- **NameNode** (Port 9870): Quản lý metadata, namespace
- **DataNode 1,2,3** (Ports 9864-9866): Lưu trữ data blocks
- **Replication Factor**: 3 (mỗi file được copy 3 lần)

**Data Layout**:
```
/xray/
├── images/           # Ảnh X-ray upload từ users
│   ├── <uuid1>.png
│   ├── <uuid2>.png
│   └── ...
└── predictions/      # Kết quả dự đoán (Parquet format)
    ├── part-00000-*.parquet
    ├── part-00001-*.parquet
    └── checkpoints/  # Spark streaming checkpoints
```

**Connections**:
- Backend → HDFS: Upload images via WebHDFS REST API
- Spark → HDFS: Read/Write via `hdfs://` protocol
- Frontend → Backend → HDFS: Serve images

### 2. Kafka

**Purpose**: Message queue để decouple upload và processing

**Architecture**:
- **Zookeeper** (Port 2181): Coordination service
- **Kafka Broker** (Port 9092): Message broker

**Topics**:
```
xray_metadata:
  - Partitions: 1
  - Replication: 1
  - Producer: FastAPI Backend
  - Consumer: Spark Streaming
  - Message Format: JSON với patient info + hdfs_path
```

**Message Flow**:
```
Producer (Backend) → Kafka Topic → Consumer (Spark)
                   ↓ Persistent Log
                   ↓ Fault Tolerant
                   ↓ High Throughput
```

### 3. MongoDB

**Purpose**: NoSQL database cho query nhanh prediction results

**Schema**:
```javascript
// Collection: predictions
{
  "_id": ObjectId("..."),
  "Image Index": "27591426-1685-407a-8b31-d15e2c0b1f8f.png",
  "Patient ID": "P86325115308",
  "Patient Name": "Nguyễn Văn A",
  "Patient Age": 45,
  "Patient Sex": "M",
  "Follow-up #": "0",
  "hdfs_path": "hdfs://namenode:9000/xray/images/...",
  "predicted_label": "[{disease: ..., probability: ..., severity_level: ...}]",
  "timestamp": "2025-11-22T10:30:00Z",
  "examined": false,
  "examined_at": null,
  "_parsed_severity": 3,      // Computed field
  "_parsed_disease": "Pneumonia",
  "_parsed_probability": 0.89,
  "_priority_score": 32.5,    // (3*10) + (2.5*0.5)
  "_hours_waiting": 2.5
}
```

**Indexes**:
- `Patient ID` (unique)
- `Image Index` (unique)
- `timestamp` (for time-based queries)
- `_priority_score` (DESC, for priority queue)

### 4. Spark Streaming

**Purpose**: Real-time processing engine

**Configuration**:
- **Trigger**: Micro-batch (default: 500ms)
- **Checkpoint**: HDFS-based for fault tolerance
- **Memory**: Xử lý in-memory, spill to disk nếu cần

**Micro-batch Processing**:
```
Batch 1 (0-500ms)  → Process 10 messages → Write to sinks
Batch 2 (500ms-1s) → Process 5 messages  → Write to sinks
Batch 3 (1-1.5s)   → Process 0 messages  → Idle (wait)
...
```

**Fault Tolerance**:
- Checkpoint metadata sau mỗi batch
- Nếu crash → Restart từ checkpoint
- Kafka offset auto-commit sau khi xử lý xong

### 5. FastAPI Backend

**Purpose**: API Gateway + Business Logic

**Key Routes**:
```python
POST   /api/upload              # Upload X-ray image
GET    /api/predictions         # Get all predictions
GET    /api/predictions/{id}    # Get single prediction
GET    /api/patients            # List all patients
GET    /api/patients/{id}       # Get patient details
GET    /api/search-by-name      # Search by patient name
GET    /api/priority/statistics # Priority queue stats
GET    /api/priority/by-severity # Filter by severity
POST   /api/priority/mark-examined # Mark patient as examined
GET    /api/xray-image/{name}   # Serve X-ray image from HDFS
GET    /api/spark-logs          # Get Spark logs (batch)
GET    /api/spark-logs/stream   # Stream Spark logs (SSE)
WS     /api/ws/stats            # WebSocket for real-time stats
```

**Utilities**:
- `kafka_producer.py`: Publish messages to Kafka
- `mongo_client.py`: MongoDB CRUD + aggregations
- `hdfs_client.py`: HDFS file operations via WebHDFS
- `config.py`: Centralized configuration

### 6. React Frontend

**Purpose**: User interface

**Pages**:
1. **Dashboard** (`/`)
   - Real-time stats: Tổng ca, phân bố theo severity
   - Charts: Bar chart, severity breakdown
   - WebSocket updates mỗi 5s

2. **Upload** (`/upload`)
   - Drag & drop hoặc click để chọn file
   - Preview ảnh trước khi upload
   - Nhập thông tin bệnh nhân (Patient ID, Name, Age, Sex)
   - Upload → Kafka → Spark → Kết quả sau vài giây

3. **Priority Queue** (`/priority`)
   - Danh sách bệnh nhân sort theo priority score
   - Filter theo severity level
   - Filter theo date range
   - Checkbox "Đã khám" để đánh dấu
   - Click vào row → Modal hiển thị chi tiết + ảnh X-ray

4. **Patients** (`/patients`)
   - Danh sách tất cả bệnh nhân
   - Click vào row → Xem tất cả ảnh X-ray của bệnh nhân đó
   - Hiển thị lịch sử khám

5. **Results** (`/results`)
   - Tìm kiếm theo tên bệnh nhân
   - Hiển thị kết quả dự đoán
   - Click vào card → Modal chi tiết + ảnh

6. **Logs** (`/logs`)
   - Xem logs của Spark Streaming container
   - Chọn số dòng (50-1000)
   - Stream real-time logs
   - Download logs
   - Auto-scroll

**Key Features**:
- **Real-time Updates**: WebSocket cho Dashboard
- **Modal Component**: Reusable `PatientDetailModal.tsx`
- **Responsive Design**: TailwindCSS
- **State Management**: React Hooks (useState, useEffect, useRef)

---

## Giao diện Web

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)
- Thống kê tổng quan
- Bar chart phân bố ca bệnh
- Real-time updates qua WebSocket

### Priority Queue
![Priority](docs/screenshots/priority.png)
- Hàng đợi ưu tiên dựa trên severity + thời gian chờ
- Filter theo date, severity
- Đánh dấu đã khám

### Patient Detail Modal
![Modal](docs/screenshots/modal.png)
- Ảnh X-ray từ HDFS
- Thông tin bệnh nhân
- Danh sách bệnh dự đoán với xác suất & mức độ

---

## API Documentation

### Upload Image

```bash
POST /api/upload
Content-Type: multipart/form-data

Form Data:
- file: <image.png>
- patient_id: "P12345"
- patient_name: "Nguyễn Văn A"
- patient_age: 45
- patient_sex: "M"

Response:
{
  "success": true,
  "message": "Uploaded successfully",
  "image_name": "27591426-1685-407a-8b31-d15e2c0b1f8f.png",
  "hdfs_path": "hdfs://namenode:9000/xray/images/..."
}
```

### Get Priority Queue

```bash
GET /api/priority/statistics?sort_order=desc&limit=100

Response:
{
  "summary": [
    {"severity_level": 4, "severity_name": "Cấp cứu", "count": 5},
    {"severity_level": 3, "severity_name": "Nghiêm trọng", "count": 12},
    ...
  ],
  "total": 50,
  "predictions": [
    {
      "_id": "...",
      "Patient Name": "Nguyễn Văn A",
      "_priority_score": 42.5,
      "_hours_waiting": 2.5,
      "_parsed_severity": 4,
      ...
    }
  ]
}
```

### Stream Spark Logs

```bash
GET /api/spark-logs/stream

# Server-Sent Events (SSE)
# Continuous stream of log lines
```

---

## Cơ chế Priority Score

```python
priority_score = (severity_level * 10) + (hours_waiting * 0.5)
```

**Ví dụ**:
- Bệnh nhân A: Severity 4 (Cấp cứu), đợi 2 giờ
  → Score = 4*10 + 2*0.5 = **41.0**

- Bệnh nhân B: Severity 3 (Nghiêm trọng), đợi 5 giờ
  → Score = 3*10 + 5*0.5 = **32.5**

- Bệnh nhân C: Severity 2 (Trung bình), đợi 10 giờ
  → Score = 2*10 + 10*0.5 = **25.0**

→ **Thứ tự ưu tiên**: A > B > C

**Logic**:
- Bệnh nặng luôn được ưu tiên (weight = 10)
- Thời gian chờ cũng ảnh hưởng nhưng nhỏ hơn (weight = 0.5)
- Tránh trường hợp bệnh nhẹ nhưng chờ quá lâu bị bỏ quên

---

## Troubleshooting

### HDFS Safemode

```bash
# Nếu HDFS bị stuck ở safemode
docker exec -it namenode bash
hdfs dfsadmin -safemode leave
```

### Kafka không nhận message

```bash
# Kiểm tra Kafka topics
docker exec -it kafka bash
kafka-topics.sh --list --bootstrap-server localhost:9092

# Xem messages trong topic
kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic xray_metadata --from-beginning
```

### Spark Streaming bị crash

```bash
# Xem logs
docker logs spark_streaming

# Restart
docker restart spark_streaming

# Clear checkpoints (cẩn thận!)
docker exec -it namenode bash
hdfs dfs -rm -r /xray/predictions/checkpoints_mongo
hdfs dfs -rm -r /xray/predictions/checkpoints
```

### MongoDB connection issues

```bash
# Test connection
docker exec -it mongodb mongosh -u admin -p admin123

# Xem collections
use xray
db.predictions.countDocuments()
db.predictions.find().limit(5)
```

---

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend | React + TypeScript | 19.2.0 |
| UI Framework | TailwindCSS | 3.4.18 |
| Backend | FastAPI | 0.109.0 |
| Web Server | Nginx | Alpine |
| Streaming | Apache Spark | 3.2.1 |
| Message Queue | Apache Kafka | Latest |
| Storage | HDFS (Hadoop) | 3.2.1 |
| Database | MongoDB | 7.0 |
| AI Model | TorchXRayVision | Latest |
| Deep Learning | PyTorch | Latest |
| Container | Docker + Docker Compose | Latest |

---

## License

This project is licensed under the MIT License.

---

## Contributors

- **Big Daddy** - Đại học Công nghệ - Đại học Quốc gia Hà Nội

---

## Acknowledgments

- **NIH ChestX-ray14 Dataset**: Training data cho AI model
- **TorchXRayVision**: Pretrained models
- **Apache Spark**: Streaming processing framework
- **FastAPI**: Modern Python web framework

