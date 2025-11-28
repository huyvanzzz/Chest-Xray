"""
Router cho query predictions từ MongoDB
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from models.schemas import PredictionResult, PredictionListResponse, ErrorResponse
from utils.mongo_client import mongo_client

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get(
    "/recent",
    response_model=PredictionListResponse,
    responses={500: {"model": ErrorResponse}}
)
async def get_recent_predictions(
    limit: int = Query(10, ge=1, le=100, description="Số lượng kết quả"),
    skip: int = Query(0, ge=0, description="Bỏ qua n kết quả (pagination)")
):
    """
    Lấy danh sách predictions gần đây
    
    ## Parameters
    - **limit**: Số lượng kết quả trả về (1-100, mặc định 10)
    - **skip**: Bỏ qua n kết quả đầu tiên (cho pagination)
    
    ## Returns
    - **total**: Tổng số predictions trong DB
    - **results**: List các prediction objects
    """
    try:
        results = mongo_client.get_predictions(limit=limit, skip=skip)
        total = mongo_client.count_total()
        
        return PredictionListResponse(
            total=total,
            results=results
        )
        
    except Exception as e:
        logger.error(f"Lỗi query recent predictions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể truy vấn database: {str(e)}"
        )

@router.get(
    "/patient/{patient_id}",
    response_model=PredictionListResponse,
    responses={
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def get_predictions_by_patient(
    patient_id: str
):
    """
    Lấy tất cả predictions của một bệnh nhân
    
    ## Parameters
    - **patient_id**: ID bệnh nhân
    
    ## Returns
    - **total**: Số lượng predictions của bệnh nhân này
    - **results**: List các prediction objects
    """
    try:
        results = mongo_client.get_by_patient_id(patient_id)
        
        if not results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy data cho Patient ID: {patient_id}"
            )
        
        return PredictionListResponse(
            total=len(results),
            results=results
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi query patient predictions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể truy vấn database: {str(e)}"
        )

@router.get(
    "/image/{image_index}",
    responses={
        200: {"model": PredictionResult},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def get_prediction_by_image(
    image_index: str
):
    """
    Lấy prediction theo Image Index
    
    ## Parameters
    - **image_index**: Tên file ảnh (ví dụ: 00000001_000.png)
    
    ## Returns
    - Prediction object
    """
    try:
        result = mongo_client.get_by_image_index(image_index)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy prediction cho Image Index: {image_index}"
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi query image prediction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể truy vấn database: {str(e)}"
        )

@router.get(
    "/high-risk",
    response_model=PredictionListResponse,
    responses={500: {"model": ErrorResponse}}
)
async def get_high_risk_predictions(
    severity: int = Query(3, ge=1, le=4, description="Ngưỡng severity (1-4)"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng kết quả")
):
    """
    Lấy các ca high-risk (severity cao)
    
    ## Parameters
    - **severity**: Ngưỡng severity (1=mild, 2=moderate, 3=severe, 4=very severe)
    - **limit**: Số lượng kết quả tối đa
    
    ## Returns
    - **total**: Số lượng high-risk cases tìm thấy
    - **results**: List các prediction objects có severity >= ngưỡng
    
    ## Notes
    - Severity levels:
      - 0: Normal / No Finding
      - 1: Mild (nhẹ)
      - 2: Moderate (trung bình)
      - 3: Severe (nặng)
      - 4: Very Severe (rất nặng)
    """
    try:
        results = mongo_client.get_high_risk(
            severity_threshold=severity,
            limit=limit
        )
        
        return PredictionListResponse(
            total=len(results),
            results=results
        )
        
    except Exception as e:
        logger.error(f"Lỗi query high-risk predictions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể truy vấn database: {str(e)}"
        )

@router.get(
    "/search-by-name",
    response_model=PredictionListResponse,
    responses={500: {"model": ErrorResponse}}
)
async def search_predictions_by_name(
    name: str = Query(..., description="Tên bệnh nhân để tìm kiếm")
):
    """
    Tìm kiếm predictions theo tên bệnh nhân
    
    ## Parameters
    - **name**: Tên bệnh nhân (tìm kiếm không phân biệt hoa thường)
    
    ## Returns
    - **total**: Số lượng kết quả tìm thấy
    - **results**: List các prediction objects
    """
    try:
        results = mongo_client.search_by_patient_name(name)
        
        return PredictionListResponse(
            total=len(results),
            results=results
        )
        
    except Exception as e:
        logger.error(f"Lỗi search by name: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể tìm kiếm: {str(e)}"
        )

@router.get(
    "/stats",
    responses={500: {"model": ErrorResponse}}
)
async def get_statistics():
    """
    Lấy thống kê tổng quan và phân tích dữ liệu (với demographics)
    
    ## Returns
    - **total_predictions**: Tổng số predictions
    - **by_severity**: Phân bố theo severity level (0-4)
    - **by_disease**: Phân bố theo loại bệnh
    - **severity_by_disease**: Ma trận severity theo từng bệnh
    - **by_gender**: Phân bố theo giới tính
    - **by_age_group**: Phân bố theo nhóm tuổi
    - **age_disease_correlation**: Tương quan tuổi-bệnh
    - **high_risk_count**: Số ca severity >= 3
    - **recent_count**: Số ca gần đây
    """
    try:
        stats = mongo_client.get_overall_statistics()
        return stats
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể truy vấn statistics: {str(e)}"
        )
