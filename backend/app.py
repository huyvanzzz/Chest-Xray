"""
FastAPI Backend cho X-Ray Prediction System
Handles: Upload ảnh, publish Kafka, query results từ MongoDB
"""
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from typing import Optional, List
import uvicorn
import logging
from datetime import datetime
import sys
from pathlib import Path
import io
import subprocess
import asyncio

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

from routers import upload, predictions, patients, priority, websocket
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
app.include_router(websocket.router, prefix="/api", tags=["WebSocket"])

# Stats endpoint for Dashboard
@app.get("/api/stats")
async def get_stats():
    """Lấy thống kê tổng quan cho Dashboard"""
    try:
        stats = mongo_client.get_overall_statistics()
        return stats
    except Exception as e:
        logging.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Image endpoint - Get X-ray image from HDFS by path (query parameter)
@app.get("/api/xray-image/")
async def get_xray_image_by_path(path: str = Query(..., description="HDFS path của ảnh")):
    """Lấy ảnh X-quang từ HDFS theo đường dẫn"""
    try:
        logging.info(f"Getting image from HDFS path: {path}")
        
        # Đọc ảnh từ HDFS
        image_data = hdfs_client.read_file(path)
        
        if not image_data:
            raise HTTPException(status_code=404, detail="Cannot read image from HDFS")
        
        # Extract filename from path
        filename = path.split('/')[-1] if '/' in path else 'image.png'
        
        # Trả về ảnh
        return StreamingResponse(
            io.BytesIO(image_data),
            media_type="image/png",
            headers={"Content-Disposition": f"inline; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting image from {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Image endpoint - Get X-ray image from HDFS by image name (path parameter)
@app.get("/api/xray-image/{image_name}")
async def get_xray_image_by_name(image_name: str):
    """Lấy ảnh X-quang từ HDFS theo tên file (tìm trong MongoDB)"""
    try:
        # Tìm prediction có image_name này để lấy hdfs_path
        prediction = mongo_client.collection.find_one({"Image Index": image_name})
        
        if not prediction:
            raise HTTPException(status_code=404, detail="Image not found")
        
        hdfs_path = prediction.get('hdfs_path')
        if not hdfs_path:
            raise HTTPException(status_code=404, detail="HDFS path not found")
        
        # Đọc ảnh từ HDFS
        image_data = hdfs_client.read_file(hdfs_path)
        
        if not image_data:
            raise HTTPException(status_code=404, detail="Cannot read image from HDFS")
        
        # Trả về ảnh
        return StreamingResponse(
            io.BytesIO(image_data),
            media_type="image/png",
            headers={"Content-Disposition": f"inline; filename={image_name}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

@app.get("/api/spark-logs")
async def get_spark_logs(lines: int = Query(default=100, ge=1, le=1000)):
    """Lấy logs của Spark Streaming container"""
    try:
        # Chạy docker logs command
        result = subprocess.run(
            ["docker", "logs", "--tail", str(lines), "spark_streaming"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        # Kết hợp stdout và stderr
        logs = result.stdout + result.stderr
        
        return {
            "success": True,
            "lines": lines,
            "logs": logs,
            "timestamp": datetime.now().isoformat()
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Docker logs command timeout")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Docker command not found")
    except Exception as e:
        logging.error(f"Error getting spark logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/spark-logs/stream")
async def stream_spark_logs():
    """Stream logs của Spark Streaming container trong real-time"""
    async def log_generator():
        process = None
        try:
            # Start docker logs process
            process = await asyncio.create_subprocess_exec(
                "docker", "logs", "-f", "--tail", "50", "spark_streaming",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            
            # Stream logs line by line
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                # Add newline and flush immediately
                yield line.decode('utf-8', errors='replace')
                await asyncio.sleep(0.01)  # Small delay to prevent overwhelming
                
        except asyncio.CancelledError:
            logging.info("Stream cancelled by client")
            if process:
                process.terminate()
                await process.wait()
            raise
        except Exception as e:
            logging.error(f"Error streaming spark logs: {e}")
            yield f"\nError: {str(e)}\n"
        finally:
            if process:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    process.kill()
    
    return StreamingResponse(
        log_generator(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/plain; charset=utf-8"
        }
    )

if __name__ == "__main__":
    # Chạy server
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload khi code thay đổi (dev only)
        log_level="info"
    )
