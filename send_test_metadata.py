import os
import pandas as pd
import time
from hdfs import InsecureClient
from kafka import KafkaProducer
from kafka.admin import KafkaAdminClient, NewTopic
import json

# ---------- Kafka config ----------
KAFKA_SERVER = 'kafka:9092'
TOPIC = 'xray_metadata'

admin_client = KafkaAdminClient(bootstrap_servers=KAFKA_SERVER, client_id='setup')
if TOPIC not in admin_client.list_topics():
    topic = NewTopic(name=TOPIC, num_partitions=1, replication_factor=1)
    admin_client.create_topics([topic])
    print(f"[DEBUG] Đã tạo topic {TOPIC} tự động")
else:
    print(f"[DEBUG] Topic {TOPIC} đã tồn tại")
admin_client.close()

producer = KafkaProducer(
    bootstrap_servers=[KAFKA_SERVER],
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

# ---------- HDFS config ----------
HDFS_URL = 'http://namenode:9870'
HDFS_BASE_DIR = "/xray/images"
hdfs_client = InsecureClient(HDFS_URL)

if not hdfs_client.status(HDFS_BASE_DIR, strict=False):
    hdfs_client.makedirs(HDFS_BASE_DIR)
    print(f"[DEBUG] Tạo folder HDFS: {HDFS_BASE_DIR}")
else:
    print(f"[DEBUG] Folder HDFS {HDFS_BASE_DIR} đã tồn tại")

# ---------- Local data ----------
LOCAL_IMAGES_DIR = "/app/data/images"
PATIENT_CSV = "/app/data/patient_subset.csv"
BATCH_SIZE = 1
INTERVAL_SEC = 0.5

# ---------- Load CSV ----------
print("[DEBUG] Đang load CSV...")
patient_csv = pd.read_csv(PATIENT_CSV)
print(f"[DEBUG] patient_csv: {len(patient_csv)} rows")

# Chuẩn bị id (bỏ đuôi .png)
patient_csv['id'] = patient_csv['Image Index']

# Danh sách ảnh từ patient_csv
image_list = patient_csv['id'].tolist()
num_images = len(image_list)
batch_num = 1

# ---------- Gửi batch ----------
for start_idx in range(0, num_images, BATCH_SIZE):
    end_idx = min(start_idx + BATCH_SIZE, num_images)
    batch_images = image_list[start_idx:end_idx]
    print(f"[DEBUG] Batch {batch_num:03d} - preparing {len(batch_images)} images")

    # Tạo folder batch trên HDFS
    hdfs_batch_dir = f"{HDFS_BASE_DIR}/batch_{batch_num:03d}"
    if not hdfs_client.status(hdfs_batch_dir, strict=False):
        hdfs_client.makedirs(hdfs_batch_dir)
        print(f"[DEBUG] Tạo folder batch HDFS: {hdfs_batch_dir}")
    else:
        print(f"[DEBUG] Folder batch HDFS đã tồn tại: {hdfs_batch_dir}")

    # Upload ảnh vào HDFS và track những ảnh upload thành công
    uploaded_images = []
    for img_name in batch_images:
        local_path = os.path.join(LOCAL_IMAGES_DIR, img_name)
        if not os.path.exists(local_path):
            print(f"[WARN] Ảnh {local_path} không tồn tại, bỏ qua")
            continue
        try:
            hdfs_path = f"{hdfs_batch_dir}/{img_name}"
            hdfs_client.upload(hdfs_path, local_path, overwrite=True)
            uploaded_images.append(img_name)
            print(f"[DEBUG] Upload {local_path} -> {hdfs_path}")
        except Exception as e:
            print(f"[ERROR] Upload failed for {img_name}: {e}")

    # Chỉ gửi metadata của những ảnh đã upload thành công
    if not uploaded_images:
        print(f"[WARN] Batch {batch_num:03d}: Không có ảnh nào được upload, bỏ qua batch")
        batch_num += 1
        continue

    # Lấy metadata từ patient_csv - chỉ những ảnh đã upload
    batch_meta = patient_csv[patient_csv['id'].isin(uploaded_images)].copy()

    HDFS_PREFIX = "hdfs://namenode:9000"

    # Thêm HDFS_PREFIX vào hdfs_path
    batch_meta['hdfs_path'] = batch_meta['id'].apply(
        lambda x: f"{HDFS_PREFIX}{hdfs_batch_dir}/{x}"
    )


    # Gửi metadata vào Kafka
    meta_list = batch_meta.to_dict(orient='records')
    for record in meta_list:
        producer.send(TOPIC, record)
        print(f"[DEBUG] Sent metadata to Kafka: {record['id']}")

    producer.flush()
    print(f"[INFO] Batch {batch_num:03d}: {len(uploaded_images)} ảnh -> HDFS, metadata gửi Kafka")

    batch_num += 1
    if end_idx < num_images:
        time.sleep(INTERVAL_SEC)
    if end_idx < num_images:
        time.sleep(INTERVAL_SEC)

print("[INFO] Hoàn tất gửi tất cả batch ảnh và metadata vào HDFS và Kafka!")
