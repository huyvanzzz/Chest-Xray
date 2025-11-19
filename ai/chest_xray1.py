# ai/chest_xray_hdfs.py
import torch
import torchxrayvision as xrv
from PIL import Image
import numpy as np
import pandas as pd
import json
from hdfs import InsecureClient
import io

# ------------------------------
# Biến toàn cục để load 1 lần
# ------------------------------
_model = None
_severity_data = None
_hdfs_client = None

# ------------------------------
# HDFS config
# ------------------------------
HDFS_HTTP = "http://namenode:9870"  # WebHDFS endpoint
HDFS_USER = "hdfs"                  # user HDFS
HDFS_PREFIX = "hdfs://namenode:9000"

def get_hdfs_client():
    global _hdfs_client
    if _hdfs_client is None:
        _hdfs_client = InsecureClient(HDFS_HTTP, user=HDFS_USER)
    return _hdfs_client

# ------------------------------
# Load model / severity CSV
# ------------------------------
def load_model_once():
    global _model
    if _model is None:
        print(">>> Loading DenseNet model (1 lần)")
        _model = xrv.models.DenseNet(weights="densenet121-res224-nih")
        _model.eval()
    return _model

def load_severity_once(csv_path="data/disease_severity.csv"):
    global _severity_data
    if _severity_data is None:
        df = pd.read_csv(csv_path)
        _severity_data = {
            row['Disease']: {
                'level': int(row['Severity_Level']),
                'name': row['Severity_Name'],
                'description': row['Description']
            }
            for _, row in df.iterrows()
        }
    return _severity_data

# ------------------------------
# Đọc ảnh từ HDFS
# ------------------------------
def read_image(image_path):
    client = get_hdfs_client()
    # Xóa prefix hdfs:// để WebHDFS đọc
    webhdfs_path = image_path.replace(HDFS_PREFIX, "")
    with client.read(webhdfs_path) as reader:
        img_bytes = reader.read()
    img = Image.open(io.BytesIO(img_bytes)).convert("L")
    return img

# ------------------------------
# Predict bệnh nặng nhất từ HDFS
# ------------------------------
def predict_chest_xray(image_path, severity_csv="data/disease_severity.csv"):
    try:
        model = load_model_once()
        severity_data = load_severity_once(severity_csv)

        # Load ảnh từ HDFS
        img = read_image(image_path)
        img = img.resize((224, 224))
        img = np.array(img).astype(np.float32)
        img = xrv.utils.normalize(img, 255, 0)
        img = img[np.newaxis, :, :]
        x = torch.from_numpy(img).unsqueeze(0)

        # Predict
        with torch.no_grad():
            logits = model(x)
            probs = torch.sigmoid(logits)[0]

        # Chọn bệnh có probability cao nhất
        max_idx = torch.argmax(probs).item()
        disease_name = model.pathologies[max_idx]
        prob = float(probs[max_idx])
        sev_info = severity_data.get(disease_name, {'level':0,'name':'Không xác định','description':''})

        result = {
            'disease': disease_name,
            'probability': prob,
            'severity_level': sev_info['level'],
            'severity_name': sev_info['name'],
            'description': sev_info['description']
        }

        return json.dumps(result, ensure_ascii=False)
        
    except Exception as e:
        # File not found hoặc lỗi khác - trả về result với error
        print(f"[ERROR] predict_chest_xray failed for {image_path}: {str(e)}")
        error_result = {
            'disease': 'No Finding',
            'probability': 0.0,
            'severity_level': 0,
            'severity_name': 'Error',
            'description': f'Cannot process image: {str(e)[:100]}'
        }
        return json.dumps(error_result, ensure_ascii=False)
