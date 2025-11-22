"""
Router cho trang ưu tiên - thống kê theo mức độ nghiêm trọng
"""
import logging
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query, status, Body
from pydantic import BaseModel

from utils.mongo_client import mongo_client

logger = logging.getLogger(__name__)
router = APIRouter()

class UpdateExaminedRequest(BaseModel):
    prediction_id: str
    examined: bool

@router.get(
    "/priority/statistics",
    responses={500: {"model": dict}}
)
async def get_priority_statistics(
    start_date: Optional[str] = Query(None, description="Ngày bắt đầu (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Ngày kết thúc (YYYY-MM-DD)"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sắp xếp: asc (thấp->cao) hoặc desc (cao->thấp)"),
    limit: int = Query(100, ge=1, le=500, description="Số lượng predictions trả về")
):
    """
    Thống kê predictions theo mức độ ưu tiên/nghiêm trọng
    
    ## Parameters
    - **start_date**: Lọc từ ngày (format: YYYY-MM-DD)
    - **end_date**: Lọc đến ngày (format: YYYY-MM-DD)
    - **sort_order**: Sắp xếp theo mức độ (asc: thấp đến cao, desc: cao đến thấp)
    - **limit**: Số lượng predictions tối đa trả về (mặc định 100)
    
    ## Returns
    - **summary**: Tổng số theo từng mức độ
    - **predictions**: Danh sách predictions đã sắp xếp (giới hạn theo limit)
    - **filter_info**: Thông tin về bộ lọc đã áp dụng
    """
    try:
        # Parse dates if provided
        # Timezone Việt Nam (UTC+7)
        vietnam_tz = timezone(timedelta(hours=7))
        
        date_filter = {}
        if start_date:
            try:
                # Parse date và set timezone Việt Nam, bắt đầu từ 00:00:00
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                start_dt = start_dt.replace(tzinfo=vietnam_tz)
                # Convert sang UTC để so sánh với ObjectId
                date_filter['start'] = start_dt.astimezone(timezone.utc).replace(tzinfo=None)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="start_date phải có format YYYY-MM-DD"
                )
        
        if end_date:
            try:
                # Parse date và set timezone Việt Nam, kết thúc lúc 23:59:59
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                end_dt = end_dt.replace(hour=23, minute=59, second=59, tzinfo=vietnam_tz)
                # Convert sang UTC để so sánh với ObjectId
                date_filter['end'] = end_dt.astimezone(timezone.utc).replace(tzinfo=None)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="end_date phải có format YYYY-MM-DD"
                )
        
        # Get priority statistics from MongoDB
        result = mongo_client.get_priority_statistics(
            date_filter=date_filter,
            sort_order=sort_order,
            limit=limit
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi get priority statistics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể lấy thống kê: {str(e)}"
        )

@router.get(
    "/priority/by-severity",
    responses={500: {"model": dict}}
)
async def get_by_severity_level(
    severity_level: int = Query(..., ge=0, le=4, description="Mức độ nghiêm trọng (0-4)"),
    limit: int = Query(50, ge=1, le=200, description="Số lượng kết quả"),
    skip: int = Query(0, ge=0, description="Bỏ qua n kết quả")
):
    """
    Lấy danh sách predictions theo mức độ nghiêm trọng cụ thể
    
    ## Parameters
    - **severity_level**: Mức độ (0: Error, 1: Bình thường, 2: Trung bình, 3: Nặng, 4: Rất nặng)
    - **limit**: Số lượng kết quả
    - **skip**: Bỏ qua n kết quả (pagination)
    
    ## Returns
    - **total**: Tổng số predictions với mức độ này
    - **results**: Danh sách predictions
    """
    try:
        results = mongo_client.get_predictions_by_severity(
            severity_level=severity_level,
            limit=limit,
            skip=skip
        )
        
        return results
        
    except Exception as e:
        logger.error(f"Lỗi get by severity level: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể truy vấn: {str(e)}"
        )

@router.post(
    "/priority/mark-examined",
    responses={200: {"model": dict}, 400: {"model": dict}, 500: {"model": dict}}
)
async def mark_prediction_examined(request: UpdateExaminedRequest = Body(...)):
    """
    Đánh dấu prediction đã khám hoặc chưa khám
    
    ## Parameters
    - **prediction_id**: ID của prediction
    - **examined**: True = đã khám, False = chưa khám
    
    ## Returns
    - **success**: True/False
    - **message**: Thông báo kết quả
    """
    try:
        result = mongo_client.update_prediction_examined_status(
            prediction_id=request.prediction_id,
            examined=request.examined
        )
        
        if result:
            return {
                "success": True,
                "message": f"Đã cập nhật trạng thái {'đã khám' if request.examined else 'chưa khám'}"
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không tìm thấy prediction hoặc không thể cập nhật"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi mark examined: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể cập nhật: {str(e)}"
        )
