# Backend API - X-Ray Prediction System

FastAPI REST API cho hệ thống dự đoán bệnh từ ảnh X-ray ngực.

## Tính năng

- **Upload ảnh X-ray**: Nhận file ảnh, validate, lưu lên HDFS, publish metadata lên Kafka
- **Query predictions**: Truy vấn kết quả dự đoán từ MongoDB
- **High-risk detection**: Lọc các ca bệnh nguy hiểm (severity >= 3)
- **Statistics**: Thống kê tổng quan hệ thống

## Cấu trúc thư mục

```
backend/
├── app.py                 # Main FastAPI application
├── requirements.txt       # Python dependencies
├── Dockerfile            # Docker image build
├── .env.example          # Environment variables template
├── models/
│   ├── __init__.py
│   └── schemas.py        # Pydantic models
├── routers/
│   ├── __init__.py
│   ├── upload.py         # Upload endpoints
│   └── predictions.py    # Query endpoints
└── utils/
    ├── __init__.py
    ├── config.py         # Configuration settings
    ├── hdfs_client.py    # HDFS upload client
    ├── kafka_producer.py # Kafka publisher
    └── mongo_client.py   # MongoDB query client
```

## API Endpoints

### Health Check
```
GET /health
```
Kiểm tra trạng thái API và các services (Kafka, MongoDB, HDFS)

### Upload ảnh
```
POST /api/upload
Content-Type: multipart/form-data

Parameters:
- file: File ảnh (.png, .jpg, .jpeg) - max 10MB
- patient_id: ID bệnh nhân (required)
- patient_age: Tuổi (0-150, optional)
- patient_sex: Giới tính M/F (optional)
- follow_up: Số lần follow-up (optional, default 0)

Response:
{
  "status": "success",
  "message": "Upload thành công",
  "image_id": "uuid",
  "hdfs_path": "hdfs://namenode:9000/xray/images/...",
  "patient_id": "12345",
  "timestamp": "2025-01-19T10:30:00"
}
```

### Lấy predictions gần đây
```
GET /api/predictions/recent?limit=10&skip=0

Response:
{
  "total": 100,
  "results": [...]
}
```

### Lấy predictions theo bệnh nhân
```
GET /api/predictions/patient/{patient_id}

Response:
{
  "total": 5,
  "results": [...]
}
```

### Lấy prediction theo ảnh
```
GET /api/predictions/image/{image_index}

Response:
{
  "Image Index": "00000001_000.png",
  "Patient ID": "12345",
  "hdfs_path": "hdfs://...",
  "predicted_label": "{...}",
  ...
}
```

### Lấy ca high-risk
```
GET /api/predictions/high-risk?severity=3&limit=20

Response:
{
  "total": 15,
  "results": [...]
}
```

### Thống kê
```
GET /api/predictions/stats

Response:
{
  "total_predictions": 1000,
  "high_risk_count": 150,
  "high_risk_percentage": 15.0
}
```

## Cài đặt

### 1. Tạo file .env (optional)
```bash
cp .env.example .env
# Mặc định sử dụng MongoDB container trong docker-compose
# Không cần thay đổi MONGO_URI
```

### 2. Cài dependencies (local development)
```bash
pip install -r requirements.txt
```

### 3. Chạy development server
```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 4. Chạy với Docker Compose
```bash
# Từ thư mục gốc project
docker-compose up backend
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| KAFKA_BOOTSTRAP_SERVERS | Kafka broker address | kafka:9092 |
| KAFKA_TOPIC | Topic name | xray_metadata |
| HDFS_URL | HDFS WebHDFS URL | http://namenode:9870 |
| HDFS_BASE_PATH | Base path on HDFS | /xray/images |
| MONGO_URI | MongoDB connection string | mongodb://admin:admin123@mongodb:27017/ |
| MONGO_DATABASE | Database name | xray |
| MONGO_COLLECTION | Collection name | predictions |
| MAX_FILE_SIZE | Max upload size (bytes) | 10485760 (10MB) |
| ALLOWED_EXTENSIONS | Allowed file types | .png,.jpg,.jpeg |
| MIN_IMAGE_SIZE | Min image dimensions | 224,224 |

## Testing

### Test upload
```bash
curl -X POST "http://localhost:8000/api/upload" \
  -F "file=@test_image.png" \
  -F "patient_id=TEST001" \
  -F "patient_age=45" \
  -F "patient_sex=M"
```

### Test query
```bash
curl "http://localhost:8000/api/predictions/recent?limit=5"
curl "http://localhost:8000/api/predictions/patient/TEST001"
```

## Swagger Documentation

Truy cập API docs tại:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Lưu ý

1. **HDFS Connection**: Backend cần kết nối WebHDFS (port 9870) để upload file
2. **Kafka Connection**: Cần Kafka running tại kafka:9092
3. **MongoDB**: Sử dụng MongoDB container trong docker-compose (port 27017)
   - Username: admin
   - Password: admin123
   - Database: xray
4. **File Size**: Giới hạn upload 10MB, có thể tăng trong config.py
5. **Image Validation**: Ảnh phải >= 224x224px (input size của model)

## Troubleshooting

### Lỗi kết nối HDFS
```bash
# Kiểm tra namenode
docker logs namenode
curl http://localhost:9870/webhdfs/v1/?op=GETFILESTATUS
```

### Lỗi kết nối Kafka
```bash
# Kiểm tra Kafka
docker logs kafka
docker exec -it kafka kafka-topics.sh --list --bootstrap-server localhost:9092
```

### Lỗi MongoDB connection
```bash
# Kiểm tra MongoDB container
docker logs mongodb
docker exec -it mongodb mongosh -u admin -p admin123
```

## Development

### Code style
```bash
pip install black flake8
black .
flake8 .
```

### Run tests
```bash
pip install pytest pytest-asyncio httpx
pytest
```
