"""
HDFS Client để upload file lên HDFS
"""
import os
import logging
from hdfs import InsecureClient
from .config import settings

logger = logging.getLogger(__name__)

class HDFSClient:
    def __init__(self):
        self.client = None
        self.base_path = settings.HDFS_BASE_PATH
        
    def connect(self):
        """Kết nối đến HDFS"""
        try:
            self.client = InsecureClient(settings.HDFS_URL, user='root')
            logger.info(f"Đã kết nối HDFS tại {settings.HDFS_URL}")
            return True
        except Exception as e:
            logger.error(f"Lỗi kết nối HDFS: {e}")
            return False
    
    def check_connection(self) -> bool:
        """Kiểm tra kết nối HDFS"""
        try:
            if not self.client:
                self.connect()
            self.client.status('/')
            return True
        except Exception as e:
            logger.error(f"HDFS không khả dụng: {e}")
            return False
    
    def upload_file(self, local_path: str, hdfs_path: str) -> str:
        """
        Upload file lên HDFS
        
        Args:
            local_path: Đường dẫn file local
            hdfs_path: Đường dẫn HDFS (relative to base_path)
            
        Returns:
            Full HDFS path (hdfs://namenode:9000/...)
        """
        try:
            if not self.client:
                self.connect()
            
            # Tạo full path
            full_hdfs_path = os.path.join(self.base_path, hdfs_path)
            
            # Tạo thư mục nếu chưa tồn tại
            hdfs_dir = os.path.dirname(full_hdfs_path)
            try:
                self.client.makedirs(hdfs_dir)
            except:
                pass  # Thư mục đã tồn tại
            
            # Upload file
            with open(local_path, 'rb') as f:
                self.client.write(full_hdfs_path, f, overwrite=True)
            
            # Trả về full HDFS URI
            hdfs_uri = f"hdfs://namenode:9000{full_hdfs_path}"
            logger.info(f"Upload thành công: {hdfs_uri}")
            return hdfs_uri
            
        except Exception as e:
            logger.error(f"Lỗi upload HDFS: {e}")
            raise
    
    def list_files(self, hdfs_path: str = None):
        """List files trong thư mục HDFS"""
        try:
            if not self.client:
                self.connect()
            path = os.path.join(self.base_path, hdfs_path) if hdfs_path else self.base_path
            return self.client.list(path)
        except Exception as e:
            logger.error(f"Lỗi list HDFS: {e}")
            return []
    
    def delete_file(self, hdfs_path: str):
        """Xóa file trên HDFS"""
        try:
            if not self.client:
                self.connect()
            full_path = os.path.join(self.base_path, hdfs_path)
            self.client.delete(full_path)
            logger.info(f"Đã xóa: {full_path}")
            return True
        except Exception as e:
            logger.error(f"Lỗi xóa file HDFS: {e}")
            return False
    
    def read_file(self, hdfs_path: str) -> bytes:
        """
        Đọc file từ HDFS
        
        Args:
            hdfs_path: Full HDFS URI (hdfs://namenode:9000/...) hoặc path tương đối
            
        Returns:
            Binary data của file
        """
        try:
            if not self.client:
                self.connect()
            
            # Xử lý HDFS URI nếu có
            if hdfs_path.startswith('hdfs://'):
                # Extract path from URI: hdfs://namenode:9000/path/to/file -> /path/to/file
                path = hdfs_path.split('hdfs://namenode:9000', 1)[1] if 'hdfs://namenode:9000' in hdfs_path else hdfs_path
            else:
                path = hdfs_path
            
            # Đọc file
            with self.client.read(path) as reader:
                data = reader.read()
            
            logger.info(f"Đọc thành công file: {path}, size: {len(data)} bytes")
            return data
            
        except Exception as e:
            logger.error(f"Lỗi đọc file HDFS {hdfs_path}: {e}")
            return None

# Singleton instance
hdfs_client = HDFSClient()
