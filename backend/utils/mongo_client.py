"""
MongoDB Client để query prediction results
"""
import logging
import math
from typing import List, Dict, Optional, Any
from pymongo import MongoClient
from datetime import datetime
from .config import settings

logger = logging.getLogger(__name__)

def sanitize_document(doc: Dict) -> Dict:
    """
    Sanitize document để tránh lỗi JSON serialization
    - Chuyển NaN, Infinity thành None
    - Đảm bảo tất cả giá trị đều JSON-compliant
    """
    sanitized = {}
    for key, value in doc.items():
        if value is None:
            sanitized[key] = None
        elif isinstance(value, float):
            if math.isnan(value) or math.isinf(value):
                sanitized[key] = None
            else:
                sanitized[key] = value
        elif isinstance(value, dict):
            sanitized[key] = sanitize_document(value)
        elif isinstance(value, list):
            sanitized[key] = [sanitize_document(item) if isinstance(item, dict) else item for item in value]
        else:
            sanitized[key] = value
    return sanitized

class MongoDBClient:
    def __init__(self):
        self.client = None
        self.db = None
        self.collection = None
        self.patients_collection = None
        
    def connect(self):
        """Kết nối đến MongoDB"""
        try:
            self.client = MongoClient(settings.MONGO_URI)
            self.db = self.client[settings.MONGO_DATABASE]
            self.collection = self.db[settings.MONGO_COLLECTION]
            self.patients_collection = self.db["patients"]
            logger.info(f"Đã kết nối MongoDB: {settings.MONGO_DATABASE}.{settings.MONGO_COLLECTION}")
            return True
        except Exception as e:
            logger.error(f"Lỗi kết nối MongoDB: {e}")
            return False
    
    def check_connection(self) -> bool:
        """Kiểm tra kết nối MongoDB"""
        try:
            if self.client is None:
                self.connect()
            self.client.admin.command('ping')
            return True
        except Exception as e:
            logger.error(f"MongoDB không khả dụng: {e}")
            return False
    
    def get_predictions(self, limit: int = 10, skip: int = 0) -> List[Dict]:
        """
        Lấy danh sách predictions
        
        Args:
            limit: Số lượng records tối đa
            skip: Số records bỏ qua (cho pagination)
            
        Returns:
            List các prediction documents
        """
        try:
            if self.collection is None:
                self.connect()
            
            cursor = self.collection.find().sort('_id', -1).skip(skip).limit(limit)
            results = []
            for doc in cursor:
                # Chuyển ObjectId thành string
                doc['_id'] = str(doc['_id'])
                # Sanitize document
                doc = sanitize_document(doc)
                results.append(doc)
            
            logger.info(f"Truy vấn {len(results)} predictions")
            return results
            
        except Exception as e:
            logger.error(f"Lỗi query MongoDB: {e}")
            return []
    
    def get_by_patient_id(self, patient_id: str) -> List[Dict]:
        """Lấy predictions theo Patient ID"""
        try:
            if self.collection is None:
                self.connect()
            
            cursor = self.collection.find({"Patient ID": patient_id}).sort('_id', -1)
            results = []
            for doc in cursor:
                doc['_id'] = str(doc['_id'])
                # Sanitize document để tránh lỗi JSON serialization
                doc = sanitize_document(doc)
                results.append(doc)
            
            logger.info(f"Tìm thấy {len(results)} predictions cho Patient ID: {patient_id}")
            return results
            
        except Exception as e:
            logger.error(f"Lỗi query patient: {e}")
            return []
    
    def get_by_image_index(self, image_index: str) -> Optional[Dict]:
        """Lấy prediction theo Image Index"""
        try:
            if self.collection is None:
                self.connect()
            
            doc = self.collection.find_one({"Image Index": image_index})
            if doc:
                doc['_id'] = str(doc['_id'])
                doc = sanitize_document(doc)
            
            return doc
            
        except Exception as e:
            logger.error(f"Lỗi query image: {e}")
            return None
    
    def get_high_risk(self, severity_threshold: int = 3, limit: int = 20) -> List[Dict]:
        """
        Lấy các ca high-risk (severity >= threshold)
        
        Args:
            severity_threshold: Ngưỡng severity (mặc định 3 = severe)
            limit: Số lượng tối đa
            
        Returns:
            List các high-risk predictions
        """
        try:
            if self.collection is None:
                self.connect()
            
            # Query với regex để tìm severity >= threshold
            query = {
                "predicted_label": {
                    "$regex": f'"severity_level":\\s*[{severity_threshold}-9]'
                }
            }
            
            cursor = self.collection.find(query).sort('_id', -1).limit(limit)
            results = []
            for doc in cursor:
                doc['_id'] = str(doc['_id'])
                doc = sanitize_document(doc)
                results.append(doc)
            
            logger.info(f"Tìm thấy {len(results)} high-risk cases")
            return results
            
        except Exception as e:
            logger.error(f"Lỗi query high-risk: {e}")
            return []
    
    def count_total(self) -> int:
        """Đếm tổng số documents"""
        try:
            if self.collection is None:
                self.connect()
            return self.collection.count_documents({})
        except Exception as e:
            logger.error(f"Lỗi đếm documents: {e}")
            return 0
    
    def search_by_patient_name(self, name: str) -> List[Dict]:
        """
        Tìm kiếm predictions theo tên bệnh nhân (case-insensitive, partial match)
        
        Tìm kiếm theo 2 cách:
        1. Tìm trực tiếp trong predictions collection (field "Patient Name")
        2. Tìm patient_id từ patients collection, sau đó tìm predictions
        
        Args:
            name: Tên bệnh nhân để tìm
            
        Returns:
            List các prediction documents
        """
        try:
            if self.collection is None or self.patients_collection is None:
                self.connect()
            
            results_dict = {}  # Dùng dict để tránh trùng lặp (key = _id)
            
            # Cách 1: Tìm trực tiếp trong predictions collection qua field "Patient Name"
            # (dùng cho dữ liệu mới được upload sau khi fix schema)
            name_query = {
                "Patient Name": {
                    "$regex": name,
                    "$options": "i"
                }
            }
            
            cursor1 = self.collection.find(name_query).sort('_id', -1)
            for doc in cursor1:
                doc_id = str(doc['_id'])
                doc['_id'] = doc_id
                doc = sanitize_document(doc)
                results_dict[doc_id] = doc
            
            logger.info(f"Tìm thấy {len(results_dict)} predictions qua Patient Name field")
            
            # Cách 2: Tìm patient_id từ patients collection, sau đó tìm predictions
            # (dùng cho dữ liệu đã có sẵn trong patients collection)
            patient_query = {
                "patient_name": {
                    "$regex": name,
                    "$options": "i"
                }
            }
            
            patient_cursor = self.patients_collection.find(patient_query, {"patient_id": 1})
            patient_ids = [p["patient_id"] for p in patient_cursor]
            
            if patient_ids:
                prediction_query = {
                    "Patient ID": {
                        "$in": patient_ids
                    }
                }
                
                cursor2 = self.collection.find(prediction_query).sort('_id', -1)
                for doc in cursor2:
                    doc_id = str(doc['_id'])
                    doc['_id'] = doc_id
                    doc = sanitize_document(doc)
                    # Chỉ thêm nếu chưa có (tránh trùng)
                    if doc_id not in results_dict:
                        results_dict[doc_id] = doc
                
                logger.info(f"Tìm thêm được {len(results_dict) - len(list(results_dict.values())[:len(results_dict)])} predictions qua patients collection")
            
            results = list(results_dict.values())
            # Sort lại theo _id descending
            results.sort(key=lambda x: x['_id'], reverse=True)
            
            logger.info(f"Tổng cộng tìm thấy {len(results)} predictions cho tên: {name}")
            return results
            
        except Exception as e:
            logger.error(f"Lỗi search by name: {e}")
            return []
    
    def find_patient_by_name(self, name: str) -> Optional[str]:
        """
        Tìm patient_id của bệnh nhân đầu tiên khớp với tên trong patients collection
        
        Args:
            name: Tên bệnh nhân
            
        Returns:
            Patient ID hoặc None nếu không tìm thấy
        """
        try:
            if self.patients_collection is None:
                self.connect()
            
            query = {
                "patient_name": {
                    "$regex": f"^{name}$",  # Exact match, case-insensitive
                    "$options": "i"
                }
            }
            
            doc = self.patients_collection.find_one(query, {"patient_id": 1})
            
            if doc and "patient_id" in doc:
                logger.info(f"Tìm thấy patient_id={doc['patient_id']} cho tên '{name}' trong patients collection")
                return doc["patient_id"]
            
            logger.info(f"Không tìm thấy bệnh nhân '{name}' trong patients collection")
            return None
            
        except Exception as e:
            logger.error(f"Lỗi find patient by name: {e}")
            return None
    
    # === PATIENT MANAGEMENT METHODS ===
    
    def get_all_patients(self, limit: int = 50, skip: int = 0, search: Optional[str] = None) -> List[Dict]:
        """
        Lấy danh sách tất cả bệnh nhân
        
        Args:
            limit: Số lượng kết quả
            skip: Pagination offset
            search: Tìm kiếm theo tên (optional)
            
        Returns:
            List các patient documents
        """
        try:
            if self.patients_collection is None:
                self.connect()
            
            query = {}
            if search:
                query = {
                    "patient_name": {
                        "$regex": search,
                        "$options": "i"
                    }
                }
            
            cursor = self.patients_collection.find(query).sort('created_at', -1).skip(skip).limit(limit)
            results = []
            for doc in cursor:
                doc['_id'] = str(doc['_id'])
                # Đếm số predictions của bệnh nhân này
                pred_count = self.collection.count_documents({"Patient ID": doc['patient_id']})
                doc['total_predictions'] = pred_count
                doc = sanitize_document(doc)
                results.append(doc)
            
            logger.info(f"Truy vấn {len(results)} patients")
            return results
            
        except Exception as e:
            logger.error(f"Lỗi get all patients: {e}")
            return []
    
    def count_patients(self, search: Optional[str] = None) -> int:
        """Đếm tổng số patients"""
        try:
            if self.patients_collection is None:
                self.connect()
            
            query = {}
            if search:
                query = {
                    "patient_name": {
                        "$regex": search,
                        "$options": "i"
                    }
                }
            
            return self.patients_collection.count_documents(query)
        except Exception as e:
            logger.error(f"Lỗi count patients: {e}")
            return 0
    
    def create_patient(self, patient_doc: Dict) -> bool:
        """
        Tạo bệnh nhân mới
        
        Args:
            patient_doc: Dictionary chứa thông tin bệnh nhân
            
        Returns:
            True nếu thành công
        """
        try:
            if self.patients_collection is None:
                self.connect()
            
            result = self.patients_collection.insert_one(patient_doc)
            logger.info(f"Đã tạo patient: {patient_doc['patient_id']}")
            return result.inserted_id is not None
            
        except Exception as e:
            logger.error(f"Lỗi create patient: {e}")
            return False
    
    def get_patient_by_id(self, patient_id: str) -> Optional[Dict]:
        """
        Lấy thông tin bệnh nhân theo ID
        
        Args:
            patient_id: ID bệnh nhân
            
        Returns:
            Patient document hoặc None
        """
        try:
            if self.patients_collection is None:
                self.connect()
            
            doc = self.patients_collection.find_one({"patient_id": patient_id})
            if doc:
                doc['_id'] = str(doc['_id'])
                doc = sanitize_document(doc)
            
            return doc
            
        except Exception as e:
            logger.error(f"Lỗi get patient by id: {e}")
            return None
    
    def get_patient_profile(self, patient_id: str) -> Optional[Dict]:
        """
        Lấy profile chi tiết của bệnh nhân (bao gồm lịch sử predictions)
        
        Args:
            patient_id: ID bệnh nhân
            
        Returns:
            Dictionary chứa thông tin bệnh nhân và predictions
        """
        try:
            if self.patients_collection is None or self.collection is None:
                self.connect()
            
            # Lấy thông tin bệnh nhân
            patient = self.patients_collection.find_one({"patient_id": patient_id})
            if not patient:
                return None
            
            patient['_id'] = str(patient['_id'])
            
            # Lấy tất cả predictions của bệnh nhân
            predictions = self.get_by_patient_id(patient_id)
            
            # Kết hợp thông tin
            profile = {
                **patient,
                "total_predictions": len(predictions),
                "predictions": predictions
            }
            
            return profile
            
        except Exception as e:
            logger.error(f"Lỗi get patient profile: {e}")
            return None
    
    def delete_patient(self, patient_id: str) -> int:
        """
        Xóa bệnh nhân
        
        Args:
            patient_id: ID bệnh nhân cần xóa
            
        Returns:
            Số bản ghi đã xóa
        """
        try:
            if self.patients_collection is None:
                self.connect()
            
            result = self.patients_collection.delete_one({"patient_id": patient_id})
            logger.info(f"Đã xóa patient: {patient_id}, deleted_count: {result.deleted_count}")
            return result.deleted_count
            
        except Exception as e:
            logger.error(f"Lỗi delete patient: {e}")
            return 0
    
    def get_priority_statistics(self, date_filter: Dict = None, sort_order: str = "desc", limit: int = 100) -> Dict:
        """
        Thống kê predictions theo mức độ ưu tiên/nghiêm trọng
        
        Args:
            date_filter: Dict với keys 'start' và 'end' (datetime objects)
            sort_order: 'asc' hoặc 'desc'
            limit: Số lượng predictions tối đa trả về
            
        Returns:
            Dict với summary và predictions list (giới hạn theo limit)
        """
        try:
            if self.collection is None:
                self.connect()
            
            # Build MongoDB query
            query = {}
            
            # Add date filter if provided using ObjectId timestamp
            if date_filter:
                from bson import ObjectId
                date_query = {}
                
                # ObjectId chứa timestamp trong 4 bytes đầu
                # Tạo ObjectId từ timestamp để filter
                if 'start' in date_filter:
                    start_oid = ObjectId.from_datetime(date_filter['start'])
                    date_query['$gte'] = start_oid
                    
                if 'end' in date_filter:
                    end_oid = ObjectId.from_datetime(date_filter['end'])
                    date_query['$lte'] = end_oid
                
                if date_query:
                    query['_id'] = date_query
            
            # Lấy tất cả predictions matching query
            cursor = self.collection.find(query)
            all_predictions = []
            
            # Parse severity level từ predicted_label
            severity_counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
            severity_names = {
                0: "Error",
                1: "Bình thường", 
                2: "Trung bình",
                3: "Nặng",
                4: "Rất nặng"
            }
            
            for doc in cursor:
                from bson import ObjectId
                
                # Extract timestamp from ObjectId
                if isinstance(doc['_id'], ObjectId):
                    doc['timestamp'] = doc['_id'].generation_time.isoformat()
                    doc['_id'] = str(doc['_id'])
                else:
                    doc['_id'] = str(doc['_id'])
                    doc['timestamp'] = None
                    
                doc = sanitize_document(doc)
                
                # Parse severity level from predicted_label JSON
                severity_level = 0
                if 'predicted_label' in doc and doc['predicted_label']:
                    try:
                        import json
                        pred_data = json.loads(doc['predicted_label'])
                        severity_level = pred_data.get('severity_level', 0)
                        doc['_parsed_severity'] = severity_level
                        doc['_parsed_disease'] = pred_data.get('disease', 'Unknown')
                        doc['_parsed_probability'] = pred_data.get('probability', 0)
                    except:
                        severity_level = 0
                        doc['_parsed_severity'] = 0
                
                severity_counts[severity_level] += 1
                all_predictions.append(doc)
            
            # Sort predictions by severity level
            reverse = (sort_order == "desc")
            sorted_predictions = sorted(
                all_predictions,
                key=lambda x: x.get('_parsed_severity', 0),
                reverse=reverse
            )
            
            # Limit predictions returned (chỉ trả về limit predictions đầu tiên)
            limited_predictions = sorted_predictions[:limit]
            
            # Build summary
            summary = []
            for level in sorted(severity_counts.keys(), reverse=reverse):
                summary.append({
                    "severity_level": level,
                    "severity_name": severity_names[level],
                    "count": severity_counts[level]
                })
            
            result = {
                "summary": summary,
                "total": len(all_predictions),
                "predictions": limited_predictions,
                "filter_info": {
                    "start_date": date_filter.get('start').isoformat() if date_filter and 'start' in date_filter else None,
                    "end_date": date_filter.get('end').isoformat() if date_filter and 'end' in date_filter else None,
                    "sort_order": sort_order
                }
            }
            
            logger.info(f"Priority statistics: {len(all_predictions)} predictions, sorted {sort_order}")
            return result
            
        except Exception as e:
            logger.error(f"Lỗi get priority statistics: {e}")
            return {
                "summary": [],
                "total": 0,
                "predictions": [],
                "filter_info": {},
                "error": str(e)
            }
    
    def get_predictions_by_severity(self, severity_level: int, limit: int = 50, skip: int = 0) -> Dict:
        """
        Lấy predictions theo mức độ nghiêm trọng cụ thể
        
        Args:
            severity_level: Mức độ (0-4)
            limit: Số lượng kết quả
            skip: Pagination offset
            
        Returns:
            Dict với total và results
        """
        try:
            if self.collection is None:
                self.connect()
            
            # Get all predictions và filter bằng Python vì severity_level trong JSON
            cursor = self.collection.find().sort('_id', -1)
            matching_predictions = []
            
            for doc in cursor:
                doc['_id'] = str(doc['_id'])
                doc = sanitize_document(doc)
                
                # Parse severity level
                if 'predicted_label' in doc and doc['predicted_label']:
                    try:
                        import json
                        pred_data = json.loads(doc['predicted_label'])
                        if pred_data.get('severity_level') == severity_level:
                            doc['_parsed_severity'] = severity_level
                            doc['_parsed_disease'] = pred_data.get('disease', 'Unknown')
                            doc['_parsed_probability'] = pred_data.get('probability', 0)
                            matching_predictions.append(doc)
                    except:
                        pass
            
            # Apply pagination
            total = len(matching_predictions)
            paginated = matching_predictions[skip:skip + limit]
            
            logger.info(f"Found {total} predictions with severity_level={severity_level}")
            return {
                "total": total,
                "results": paginated,
                "severity_level": severity_level
            }
            
        except Exception as e:
            logger.error(f"Lỗi get predictions by severity: {e}")
            return {
                "total": 0,
                "results": [],
                "error": str(e)
            }
    
    def close(self):
        """Đóng connection"""
        if self.client:
            self.client.close()
            logger.info("Đã đóng MongoDB client")

# Singleton instance
mongo_client = MongoDBClient()
