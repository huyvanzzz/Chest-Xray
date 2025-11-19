"""
Router cho upload ảnh X-ray
"""
import os
import uuid
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, status
from PIL import Image

from models.schemas import UploadResponse, ErrorResponse, PatientInfo
from utils.config import settings
from utils.hdfs_client import hdfs_client
from utils.kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter()

def validate_image(file: UploadFile) -> tuple[bool, str]:
    """
    Kiểm tra file upload
    
    Returns:
        (is_valid, error_message)
    """
    # Kiểm tra extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        return False, f"Chỉ chấp nhận file {', '.join(settings.ALLOWED_EXTENSIONS)}"
    
    # Kiểm tra content type
    if file.content_type not in ['image/png', 'image/jpeg']:
        return False, "Content type không hợp lệ"
    
    return True, ""

def save_temp_file(file: UploadFile, image_id: str) -> str:
    """
    Lưu file tạm thời
    
    Returns:
        Đường dẫn file local
    """
    # Tạo thư mục temp nếu chưa có
    os.makedirs(settings.TEMP_DIR, exist_ok=True)
    
    # Tạo tên file
    ext = os.path.splitext(file.filename)[1]
    temp_path = os.path.join(settings.TEMP_DIR, f"{image_id}{ext}")
    
    # Lưu file
    with open(temp_path, "wb") as f:
        f.write(file.file.read())
    
    return temp_path

def check_image_size(image_path: str) -> tuple[bool, str]:
    """
    Kiểm tra kích thước ảnh
    
    Returns:
        (is_valid, error_message)
    """
    try:
        img = Image.open(image_path)
        width, height = img.size
        
        min_w, min_h = settings.MIN_IMAGE_SIZE
        if width < min_w or height < min_h:
            return False, f"Ảnh phải có kích thước tối thiểu {min_w}x{min_h}px"
        
        return True, ""
    except Exception as e:
        return False, f"Không thể đọc ảnh: {str(e)}"

@router.post(
    "/upload",
    response_model=UploadResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def upload_xray(
    file: UploadFile = File(..., description="File ảnh X-ray (.png, .jpg, .jpeg)"),
    patient_id: Optional[str] = Form(None, description="ID bệnh nhân (tự động tạo nếu không có)"),
    patient_name: Optional[str] = Form(None, description="Tên bệnh nhân"),
    patient_age: Optional[int] = Form(None, ge=0, le=150, description="Tuổi bệnh nhân"),
    patient_sex: Optional[str] = Form(None, description="Giới tính: M hoặc F"),
    follow_up: Optional[int] = Form(0, ge=0, description="Số lần follow-up")
):
    """
    Upload ảnh X-ray và publish metadata lên Kafka
    
    ## Parameters
    - **file**: File ảnh X-ray (PNG, JPG, JPEG)
    - **patient_id**: ID định danh bệnh nhân (optional, tự động tạo nếu không có)
    - **patient_name**: Tên bệnh nhân (required nếu không có patient_id)
    - **patient_age**: Tuổi bệnh nhân (optional, 0-150)
    - **patient_sex**: Giới tính M (Male) hoặc F (Female) (optional)
    - **follow_up**: Số lần khám lại (optional, mặc định 0)
    
    ## Returns
    - **image_id**: ID của ảnh (UUID)
    - **hdfs_path**: Đường dẫn ảnh trên HDFS
    - **patient_id**: ID bệnh nhân
    - **timestamp**: Thời gian upload
    
    ## Errors
    - 400: File không hợp lệ (kích thước, định dạng, dimensions)
    - 500: Lỗi server (HDFS, Kafka)
    """
    from utils.mongo_client import mongo_client
    
    try:
        # Validate: phải có patient_id hoặc patient_name
        if not patient_id and not patient_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phải cung cấp patient_id hoặc patient_name"
            )
        
        # Nếu chỉ có patient_name, tìm hoặc tạo patient_id
        if not patient_id and patient_name:
            # Tìm patient_id từ tên trong patients collection
            existing_patient_id = mongo_client.find_patient_by_name(patient_name)
            if existing_patient_id:
                patient_id = existing_patient_id
                logger.info(f"Tìm thấy Patient ID: {patient_id} cho tên: {patient_name}")
            else:
                # Tạo patient_id mới theo format P + timestamp + random
                timestamp = str(int(datetime.now().timestamp() * 1000))[-8:]
                random_suffix = str(uuid.uuid4().int)[:3]
                patient_id = f"P{timestamp}{random_suffix}"
                
                # Lưu bệnh nhân mới vào patients collection
                patient_doc = {
                    "patient_id": patient_id,
                    "patient_name": patient_name,
                    "patient_age": patient_age,
                    "patient_sex": patient_sex or "",
                    "phone": "",
                    "address": "",
                    "notes": "Tự động tạo khi upload",
                    "created_at": datetime.now().isoformat()
                }
                mongo_client.create_patient(patient_doc)
                logger.info(f"Tạo Patient ID mới: {patient_id} cho tên: {patient_name} và lưu vào patients collection")
        
        # Validate patient_sex
        if patient_sex and patient_sex not in ['M', 'F']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patient_sex phải là 'M' hoặc 'F'"
            )
        
        # Kiểm tra file size
        file.file.seek(0, 2)  # Seek to end
        file_size = file.file.tell()
        file.file.seek(0)  # Reset
        
        if file_size > settings.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File quá lớn. Tối đa {settings.MAX_FILE_SIZE / (1024*1024):.0f}MB"
            )
        
        # Validate image format
        is_valid, error_msg = validate_image(file)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
        
        # Tạo image ID
        image_id = str(uuid.uuid4())
        image_index = f"{image_id}{os.path.splitext(file.filename)[1]}"
        
        # Lưu file tạm
        temp_path = save_temp_file(file, image_id)
        logger.info(f"Đã lưu file tạm: {temp_path}")
        
        # Kiểm tra kích thước ảnh
        is_valid, error_msg = check_image_size(temp_path)
        if not is_valid:
            os.remove(temp_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
        
        # Upload lên HDFS
        try:
            # Tạo batch folder theo timestamp
            batch_name = datetime.now().strftime("batch_%Y%m%d_%H%M%S")
            hdfs_relative_path = f"{batch_name}/{image_index}"
            hdfs_full_path = hdfs_client.upload_file(temp_path, hdfs_relative_path)
            logger.info(f"Upload HDFS thành công: {hdfs_full_path}")
        except Exception as e:
            os.remove(temp_path)
            logger.error(f"Lỗi upload HDFS: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Không thể upload lên HDFS: {str(e)}"
            )
        
        # Publish metadata lên Kafka
        metadata = {
            "Image Index": image_index,
            "Patient ID": patient_id,
            "Patient Name": patient_name,
            "Patient Age": patient_age,
            "Patient Sex": patient_sex,
            "Follow-up #": follow_up,
            "hdfs_path": hdfs_full_path,
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            # Đảm bảo producer đã kết nối
            if not kafka_producer.producer:
                logger.info("Kafka producer chưa connect, đang kết nối...")
                kafka_producer.connect()
            
            logger.info(f"Đang publish metadata: {metadata}")
            success = kafka_producer.send_metadata(metadata)
            if not success:
                raise Exception("Kafka send failed")
            logger.info(f"✓ Đã publish metadata cho {image_index}")
        except Exception as e:
            logger.error(f"✗ Lỗi publish Kafka: {e}")
            # Không raise exception - ảnh đã lên HDFS rồi
            logger.warning("⚠ Metadata chưa được publish, cần retry thủ công")
        
        # Xóa file tạm
        try:
            os.remove(temp_path)
        except:
            pass
        
        return UploadResponse(
            message="Upload thành công",
            image_id=image_id,
            hdfs_path=hdfs_full_path,
            patient_id=patient_id,
            timestamp=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi upload: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi server: {str(e)}"
        )
