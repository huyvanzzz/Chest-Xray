"""
FastAPI Backend cho X-Ray Prediction System
Handles: Upload ảnh, publish Kafka, query results từ MongoDB
"""
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, List
import uvicorn
import logging
from datetime import datetime
import sys
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# Add backend directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from routers import upload, predictions, patients, priority
from utils.config import settings
from utils.kafka_producer import kafka_producer
from utils.mongo_client import mongo_client
from utils.hdfs_client import hdfs_client

# Khởi tạo FastAPI app
app = FastAPI(
    title="X-Ray Prediction System API",
    description="Backend API cho hệ thống dự đoán bệnh lý từ ảnh X-quang",
    version="1.0.0"
)

# CORS middleware để frontend có thể gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Production: chỉ định domain cụ thể
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(predictions.router, prefix="/api", tags=["Predictions"])
app.include_router(patients.router, prefix="/api", tags=["Patients"])
app.include_router(priority.router, prefix="/api", tags=["Priority"])

# Health check endpoint
@app.get("/")
async def root():
    """Root endpoint - health check"""
    return {
        "status": "ok",
        "message": "X-Ray Prediction System API is running",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
async def health_check():
    """Kiểm tra health của các services"""
    health_status = {
        "api": "ok",
        "kafka": "checking...",
        "mongodb": "checking...",
        "hdfs": "checking...",
        "timestamp": datetime.now().isoformat()
    }
    
    try:
        health_status["kafka"] = "ok" if kafka_producer.check_connection() else "error"
    except Exception as e:
        health_status["kafka"] = f"error: {str(e)}"
    
    try:
        health_status["mongodb"] = "ok" if mongo_client.check_connection() else "error"
    except Exception as e:
        health_status["mongodb"] = f"error: {str(e)}"
    
    try:
        health_status["hdfs"] = "ok" if hdfs_client.check_connection() else "error"
    except Exception as e:
        health_status["hdfs"] = f"error: {str(e)}"
    
    # Nếu có service nào error, trả về 503
    if any(status != "ok" for key, status in health_status.items() if key != "timestamp"):
        return JSONResponse(status_code=503, content=health_status)
    
    return health_status

if __name__ == "__main__":
    # Chạy server
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload khi code thay đổi (dev only)
        log_level="info"
    )
