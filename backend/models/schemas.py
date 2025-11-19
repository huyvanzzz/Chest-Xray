"""
Pydantic models cho request/response validation
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict
from datetime import datetime

class PatientInfo(BaseModel):
    """Thông tin bệnh nhân"""
    patient_id: str = Field(..., description="ID bệnh nhân")
    patient_age: Optional[int] = Field(None, ge=0, le=150, description="Tuổi bệnh nhân")
    patient_sex: Optional[str] = Field(None, pattern="^[MF]$", description="Giới tính: M hoặc F")
    follow_up: Optional[int] = Field(0, ge=0, description="Số lần theo dõi")
    
    @validator('patient_sex')
    def validate_sex(cls, v):
        if v and v not in ['M', 'F']:
            raise ValueError('patient_sex phải là M hoặc F')
        return v

class UploadResponse(BaseModel):
    """Response sau khi upload thành công"""
    status: str = "success"
    message: str
    image_id: str
    hdfs_path: str
    patient_id: str
    timestamp: str
    
class PredictionResult(BaseModel):
    """Kết quả dự đoán từ MongoDB"""
    image_index: str = Field(..., alias="Image Index")
    patient_id: str = Field(..., alias="Patient ID")
    patient_age: Optional[int] = Field(None, alias="Patient Age")
    patient_sex: Optional[str] = Field(None, alias="Patient Sex")
    hdfs_path: str
    predicted_label: Optional[str] = None
    timestamp: Optional[str] = None
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "Image Index": "00000001_000.png",
                "Patient ID": "12345",
                "Patient Age": 58,
                "Patient Sex": "M",
                "hdfs_path": "hdfs://namenode:9000/xray/images/batch_001/00000001_000.png",
                "predicted_label": '{"disease": "Pneumonia", "probability": 0.85, "severity": 3}',
                "timestamp": "2025-11-19T10:30:00"
            }
        }

class PredictionListResponse(BaseModel):
    """Response cho list predictions"""
    total: int
    results: List[Dict]
    
class ErrorResponse(BaseModel):
    """Error response"""
    status: str = "error"
    message: str
    detail: Optional[str] = None

class HealthResponse(BaseModel):
    """Health check response"""
    api: str
    kafka: str
    mongodb: str
    hdfs: str
    timestamp: str
