"""
Configuration settings cho backend
"""
import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings"""
    
    # API Settings
    API_TITLE: str = "X-Ray Prediction System API"
    API_VERSION: str = "1.0.0"
    
    # Kafka Settings
    KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    KAFKA_TOPIC: str = os.getenv("KAFKA_TOPIC", "xray_metadata")
    
    # HDFS Settings
    HDFS_URL: str = os.getenv("HDFS_URL", "http://namenode:9870")
    HDFS_BASE_PATH: str = os.getenv("HDFS_BASE_PATH", "/xray/images")
    HDFS_USER: str = os.getenv("HDFS_USER", "root")
    
    # MongoDB Configuration
    MONGO_URI: str = "mongodb://admin:admin123@mongodb:27017/"
    MONGO_DATABASE: str = "xray"
    MONGO_COLLECTION: str = "predictions"
    
    # Upload Settings
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    ALLOWED_EXTENSIONS: list = [".png", ".jpg", ".jpeg"]
    MIN_IMAGE_SIZE: tuple = (224, 224)  # Min width, height
    
    # Temp directory for file uploads
    TEMP_DIR: str = "/tmp/xray_uploads"
    
    class Config:
        case_sensitive = True

# Singleton instance
settings = Settings()

# Tạo temp directory nếu chưa có
os.makedirs(settings.TEMP_DIR, exist_ok=True)
