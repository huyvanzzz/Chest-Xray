from pyspark.sql import SparkSession
from pyspark.sql.functions import from_json, col, explode, udf
from pyspark.sql.types import *
from ai.chest_xray import predict_chest_xray
from hdfs import InsecureClient
from pymongo import MongoClient
from threading import Thread
import json
#mongodb+srv://Bigdata:huy332005@gmail.com@clusterxray.ahgkigy.mongodb.net/?appName=ClusterXray
# ---------- HDFS config ----------
HDFS_URL = 'http://namenode:9870'
HDFS_BASE_DIR = '/xray/predictions'
CHECKPOINT_DIR = '/xray/predictions/checkpoints'

hdfs_client = InsecureClient(HDFS_URL)
if not hdfs_client.status(HDFS_BASE_DIR, strict=False):
    hdfs_client.makedirs(HDFS_BASE_DIR)
if not hdfs_client.status(CHECKPOINT_DIR, strict=False):
    hdfs_client.makedirs(CHECKPOINT_DIR)

# ---------- Spark session ----------
spark = SparkSession.builder \
    .appName("KafkaToHDFS_Xray_Prediction") \
    .getOrCreate()

# ---------- Kafka config ----------
KAFKA_BROKER = "kafka:9092"
TOPIC = "xray_metadata"

# ---------- Schema giữ nguyên header CSV ----------
schema = StructType([
    StructField("Image Index", StringType()),
    StructField("Follow-up #", StringType()),
    StructField("Patient ID", StringType()),
    StructField("Patient Name", StringType()),
    StructField("Patient Age", IntegerType()),
    StructField("Patient Sex", StringType()),
    StructField("hdfs_path", StringType())
])

# ---------- Đọc stream từ Kafka ----------
df_raw = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", KAFKA_BROKER) \
    .option("subscribe", TOPIC) \
    .option("failOnDataLoss", "false") \
    .option("startingOffsets", "earliest") \
    .load()

# ---------- Parse JSON ----------
df_parsed = df_raw.selectExpr("CAST(value AS STRING) AS json") \
    .select(from_json(col("json"), schema).alias("data")) \
    .select("data.*")

# ---------- Register UDF dự đoán ----------
# Giảm threshold xuống 0.5 và convert kết quả thành JSON string
def predict_wrapper(path):
    try:
        results = predict_chest_xray(path, threshold=0.65)
        
        # Nếu không phát hiện bệnh nào, trả về "No Finding"
        if not results or len(results) == 0:
            return json.dumps([{
                "disease": "No Finding",
                "probability": 1.0,
                "severity_level": 0,
                "severity_name": "Bình thường",
                "description": "Không phát hiện bất thường"
            }], ensure_ascii=False)
        
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        print(f"[ERROR] Prediction failed for {path}: {e}")
        import traceback
        traceback.print_exc()
        return json.dumps([{
            "disease": "Error",
            "probability": 0.0,
            "severity_level": -1,
            "severity_name": "Lỗi",
            "description": f"Không thể phân tích: {str(e)}"
        }], ensure_ascii=False)

predict_udf = udf(predict_wrapper, StringType())

# ---------- Thêm cột dự đoán ----------
df_with_pred = df_parsed.withColumn(
    "predicted_label",
    predict_udf(col("hdfs_path"))
)

# ---------- Ghi sang MongoDB ----------
MONGO_URI = "mongodb://admin:admin123@mongodb:27017/"
checkpoint_path_mongo = "hdfs://namenode:8020/xray/predictions/checkpoints_mongo/"

def write_to_mongo(batch_df, batch_id):
    try:
        records = batch_df.toPandas().to_dict("records")
        if records:
            mongo_client = MongoClient(MONGO_URI)
            mongo_collection = mongo_client["xray"]["predictions"]
            mongo_collection.insert_many(records)
            mongo_client.close()
            print(f"[INFO] Batch {batch_id}: Inserted {len(records)} records into MongoDB")
    except Exception as e:
        print(f"[ERROR] Batch {batch_id} MongoDB insert failed: {e}")


mongo_query = df_with_pred.writeStream \
    .outputMode("append") \
    .foreachBatch(write_to_mongo) \
    .option("checkpointLocation", checkpoint_path_mongo) \
    .start()
# ---------- Ghi ra HDFS ----------
output_path = "hdfs://namenode:8020/xray/predictions/"
checkpoint_path = "hdfs://namenode:8020/xray/predictions/checkpoints/"

hdfs_query = df_with_pred.writeStream \
    .outputMode("append") \
    .format("parquet") \
    .option("path", output_path) \
    .option("checkpointLocation", checkpoint_path) \
    .start()

threads = [
Thread(target=lambda: mongo_query.awaitTermination()),
Thread(target=lambda: hdfs_query.awaitTermination())
]


for t in threads:
    t.start()


for t in threads:
    t.join()