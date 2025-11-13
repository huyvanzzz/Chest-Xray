import pandas as pd
from kafka import KafkaProducer
import json
import time
import os
import sys

# -----------------------------
# Cấu hình
# -----------------------------
folder_hdfs = '/xray/test/'          # path HDFS tham chiếu trong metadata
kafka_topic = 'xray_metadata_test'   # topic Kafka
kafka_server = 'kafka:9092'          # Kafka server
sleep_time = 30                       # giây giữa các ảnh

# -----------------------------
# Thư mục dữ liệu CSV trong Docker
# -----------------------------
data_folder = '/app/data'

# -----------------------------
# Load CSV
# -----------------------------
try:
    captions = pd.read_csv(os.path.join(data_folder, 'test_captions.csv'))
    concepts_manual = pd.read_csv(os.path.join(data_folder, 'test_concepts_manual.csv'))
    license_info = pd.read_csv(os.path.join(data_folder, 'license_information.csv'))
    cui_map = pd.read_csv(os.path.join(data_folder, 'cui_mapping.csv'))
except Exception as e:
    print(f"[Error] Không load được CSV: {e}")
    sys.exit(1)

# Strip khoảng trắng ở tên cột
captions.columns = captions.columns.str.strip()
concepts_manual.columns = concepts_manual.columns.str.strip()
license_info.columns = license_info.columns.str.strip()
cui_map.columns = cui_map.columns.str.strip()

# Lọc chỉ test
captions_test = captions[captions['ID'].str.startswith('ROCOv2_2023_test')]

# -----------------------------
# Tạo Kafka producer
# -----------------------------
try:
    producer = KafkaProducer(
        bootstrap_servers=kafka_server,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
except Exception as e:
    print(f"[Error] Không kết nối Kafka: {e}")
    sys.exit(1)

# -----------------------------
# Gửi metadata
# -----------------------------
uploaded = set()  # track ảnh đã gửi

for idx, row in captions_test.iterrows():
    try:
        image_id = row['ID']
        if image_id in uploaded:
            continue

        # Caption
        caption_text = row['Caption']

        # License
        license_row = license_info[license_info['ID'] == image_id]
        if license_row.empty:
            license_text = "Unknown"
            link = ""
            print(f"[Warning] Không tìm thấy license cho {image_id}", flush=True)
        else:
            license_text = license_row.iloc[0]['Attribution']
            link = license_row.iloc[0]['Link']

        # Concepts manual
        concept_row = concepts_manual[concepts_manual['ID'] == image_id]
        concepts_list = []

        if concept_row.empty:
            print(f"[Warning] Không tìm thấy concept cho {image_id}", flush=True)
        else:
            # tách nhiều CUI nếu có
            cui_str = concept_row.iloc[0]['CUIs']
            cui_list = [c.strip() for c in str(cui_str).split(';') if c.strip()]
            for cui in cui_list:
                name_series = cui_map[cui_map['CUI'] == cui]['Canonical name']
                name = name_series.values[0] if not name_series.empty else "Unknown"
                if name == "Unknown":
                    print(f"[Warning] Không tìm thấy CUI trong map: {cui}", flush=True)
                concepts_list.append({"CUI": cui, "name": name})

        # Metadata
        metadata = {
            "image_id": image_id,
            "hdfs_path": f"{folder_hdfs}{image_id}.dcm",
            "caption": caption_text,
            "concepts": concepts_list,
            "license": license_text,
            "link": link,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }

        # Gửi Kafka
        producer.send(kafka_topic, metadata)
        producer.flush()
        uploaded.add(image_id)
        print(f"[Info] Đã gửi metadata cho {image_id}", flush=True)

        # Delay giữa các ảnh
        time.sleep(sleep_time)

    except Exception as e:
        print(f"[Error] Lỗi khi xử lý {row.get('ID', 'Unknown')}: {e}", flush=True)

print("[Info] Đã gửi hết tất cả metadata test.")
