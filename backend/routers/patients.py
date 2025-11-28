"""
Router cho quản lý bệnh nhân
"""
import logging
from typing import Dict, Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from models.schemas import ErrorResponse
from utils.mongo_client import mongo_client

logger = logging.getLogger(__name__)
router = APIRouter()

class PatientCreate(BaseModel):
    """Schema để tạo bệnh nhân mới"""
    patient_id: str = Field(..., description="ID bệnh nhân (unique)")
    patient_name: str = Field(..., description="Tên bệnh nhân")
    patient_age: Optional[int] = Field(None, ge=0, le=150, description="Tuổi")
    patient_sex: Optional[str] = Field(None, description="Giới tính: M hoặc F")
    phone: Optional[str] = Field(None, description="Số điện thoại")
    address: Optional[str] = Field(None, description="Địa chỉ")
    notes: Optional[str] = Field(None, description="Ghi chú")

class PatientResponse(BaseModel):
    """Schema response cho thông tin bệnh nhân"""
    patient_id: str
    patient_name: str
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    total_predictions: int = 0

class PatientProfileResponse(BaseModel):
    """Schema response cho profile bệnh nhân chi tiết"""
    patient_id: str
    patient_name: str
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    total_predictions: int
    predictions: List[dict]

@router.get(
    "/patients",
    responses={500: {"model": ErrorResponse}}
)
async def get_all_patients(
    limit: int = Query(50, ge=1, le=200, description="Số lượng kết quả"),
    skip: int = Query(0, ge=0, description="Bỏ qua n kết quả"),
    search: Optional[str] = Query(None, description="Tìm kiếm theo tên")
):
    """
    Lấy danh sách tất cả bệnh nhân
    
    ## Parameters
    - **limit**: Số lượng kết quả (1-200, mặc định 50)
    - **skip**: Pagination offset
    - **search**: Tìm kiếm theo tên (optional)
    
    ## Returns
    - **total**: Tổng số bệnh nhân
    - **results**: List bệnh nhân
    """
    try:
        patients = mongo_client.get_all_patients(limit=limit, skip=skip, search=search)
        total = mongo_client.count_patients(search=search)
        
        return {
            "total": total,
            "results": patients
        }
        
    except Exception as e:
        logger.error(f"Lỗi get patients: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể lấy danh sách bệnh nhân: {str(e)}"
        )

@router.post(
    "/patients",
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}}
)
async def create_patient(patient: PatientCreate):
    """
    Tạo bệnh nhân mới
    
    ## Parameters
    - **patient_id**: ID bệnh nhân (unique, bắt buộc)
    - **patient_name**: Tên bệnh nhân (bắt buộc)
    - **patient_age**: Tuổi (optional)
    - **patient_sex**: Giới tính M/F (optional)
    - **phone**: Số điện thoại (optional)
    - **address**: Địa chỉ (optional)
    - **notes**: Ghi chú (optional)
    
    ## Returns
    - **message**: Thông báo thành công
    - **patient_id**: ID của bệnh nhân vừa tạo
    """
    try:
        # Validate patient_sex
        if patient.patient_sex and patient.patient_sex not in ['M', 'F']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patient_sex phải là 'M' hoặc 'F'"
            )
        
        # Kiểm tra patient_id đã tồn tại chưa
        existing = mongo_client.get_patient_by_id(patient.patient_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Patient ID '{patient.patient_id}' đã tồn tại"
            )
        
        # Tạo patient document
        patient_doc = {
            "patient_id": patient.patient_id,
            "patient_name": patient.patient_name,
            "patient_age": patient.patient_age,
            "patient_sex": patient.patient_sex,
            "phone": patient.phone,
            "address": patient.address,
            "notes": patient.notes,
            "created_at": datetime.now().isoformat()
        }
        
        result = mongo_client.create_patient(patient_doc)
        
        if result:
            return {
                "message": "Tạo bệnh nhân thành công",
                "patient_id": patient.patient_id
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Không thể tạo bệnh nhân"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi create patient: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi tạo bệnh nhân: {str(e)}"
        )

@router.get(
    "/patients/{patient_id}",
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}}
)
async def get_patient_profile(patient_id: str):
    """
    Lấy profile chi tiết của bệnh nhân (bao gồm lịch sử predictions)
    
    ## Parameters
    - **patient_id**: ID bệnh nhân
    
    ## Returns
    - **patient_id**: ID bệnh nhân
    - **patient_name**: Tên
    - **patient_age, patient_sex, phone, address, notes**: Thông tin cá nhân
    - **created_at**: Ngày tạo
    - **total_predictions**: Tổng số lần chụp
    - **predictions**: List các prediction records
    """
    try:
        profile = mongo_client.get_patient_profile(patient_id)
        
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy bệnh nhân với ID: {patient_id}"
            )
        
        return profile
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi get patient profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể lấy profile bệnh nhân: {str(e)}"
        )

@router.delete(
    "/patients/{patient_id}",
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}}
)
async def delete_patient(patient_id: str):
    """
    Xóa bệnh nhân (chỉ xóa thông tin bệnh nhân, không xóa predictions)
    
    ## Parameters
    - **patient_id**: ID bệnh nhân cần xóa
    
    ## Returns
    - **message**: Thông báo thành công
    - **deleted_count**: Số bản ghi đã xóa
    """
    try:
        result = mongo_client.delete_patient(patient_id)
        
        if result == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy bệnh nhân với ID: {patient_id}"
            )
        
        return {
            "message": "Xóa bệnh nhân thành công",
            "deleted_count": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi delete patient: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể xóa bệnh nhân: {str(e)}"
        )

@router.post("/patients/edit-patient-info/{patient_id}")
async def edit_patient_info(patient_id: str, update_fields: Dict):
    """
    Chỉnh sửa thông tin bệnh nhân, lưu ý không thêm trường _id vaò update_fields
    
    ## Parameters
    - **patient_id**: ID bệnh nhân cần chỉnh sửa
    - **update_fields**: Dict các trường cần cập nhật
    
    ## Returns
    - **message**: Thông báo thành công
    """
    try:
        (result, mess ) = mongo_client.edit_patient(patient_id, update_fields)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=mess
            )
        
        return {
            "message": mess
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi edit patient info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể cập nhật thông tin bệnh nhân: {str(e)}"
        )