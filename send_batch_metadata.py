import pandas as pd
import json
import os
import time

data_folder = 'data'
output_json_lines = os.path.join(data_folder, 'metadata_test_lines.json')
folder_hdfs = '/xray/test/'

# Load CSV
captions = pd.read_csv(os.path.join(data_folder, 'test_captions.csv')).rename(columns=str.strip)
concepts_manual = pd.read_csv(os.path.join(data_folder, 'test_concepts_manual.csv')).rename(columns=str.strip)
license_info = pd.read_csv(os.path.join(data_folder, 'license_information.csv')).rename(columns=str.strip)
cui_map = pd.read_csv(os.path.join(data_folder, 'cui_mapping.csv')).rename(columns=str.strip)

captions_test = captions[captions['ID'].str.startswith('ROCOv2_2023_test')]

metadata_list = []

for idx, row in captions_test.iterrows():
    image_id = row['ID']
    caption_text = row['Caption']

    # License
    license_row = license_info[license_info['ID'] == image_id]
    license_text = license_row.iloc[0]['Attribution'] if not license_row.empty else "Unknown"
    link = license_row.iloc[0]['Link'] if not license_row.empty else ""

    # Concepts
    concept_row = concepts_manual[concepts_manual['ID'] == image_id]
    concepts_list = []
    if not concept_row.empty:
        cui_str = concept_row.iloc[0]['CUIs']
        cui_list = [c.strip() for c in str(cui_str).split(';')]
        for cui in cui_list:
            name_series = cui_map[cui_map['CUI'] == cui]['Canonical name']
            name = name_series.values[0] if not name_series.empty else "Unknown"
            concepts_list.append({"CUI": cui, "name": name})

    metadata = {
        "image_id": image_id,
        "hdfs_path": f"{folder_hdfs}{image_id}.jpg",
        "caption": caption_text,
        "concepts": concepts_list,
        "license": license_text,
        "link": link,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    metadata_list.append(metadata)

# Lưu ra JSON Lines
with open(output_json_lines, 'w', encoding='utf-8') as f:
    for item in metadata_list:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")

print(f"Đã tạo file JSON Lines metadata cho {len(metadata_list)} ảnh tại {output_json_lines}")
