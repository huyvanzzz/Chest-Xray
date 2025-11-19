"""
Kafka Producer để publish metadata lên topic
"""
import json
import logging
from kafka import KafkaProducer
from kafka.errors import KafkaError
from .config import settings

logger = logging.getLogger(__name__)

class KafkaMetadataProducer:
    def __init__(self):
        self.producer = None
        self.topic = settings.KAFKA_TOPIC
        
    def connect(self):
        """Kết nối đến Kafka"""
        try:
            self.producer = KafkaProducer(
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8'),
                api_version=(0, 10, 1)
            )
            logger.info(f"Đã kết nối Kafka: {settings.KAFKA_BOOTSTRAP_SERVERS}")
            return True
        except Exception as e:
            logger.error(f"Lỗi kết nối Kafka: {e}")
            return False
    
    def check_connection(self) -> bool:
        """Kiểm tra kết nối Kafka"""
        try:
            if not self.producer:
                self.connect()
            # Bootstrap test
            self.producer.bootstrap_connected()
            return True
        except Exception as e:
            logger.error(f"Kafka không khả dụng: {e}")
            return False
    
    def send_metadata(self, metadata: dict) -> bool:
        """
        Publish metadata lên Kafka topic
        
        Args:
            metadata: Dictionary chứa thông tin metadata
            
        Returns:
            True nếu thành công, False nếu thất bại
        """
        try:
            if not self.producer:
                self.connect()
            
            future = self.producer.send(self.topic, value=metadata)
            
            # Đợi xác nhận
            record_metadata = future.get(timeout=10)
            
            logger.info(
                f"Đã publish metadata: topic={record_metadata.topic}, "
                f"partition={record_metadata.partition}, offset={record_metadata.offset}"
            )
            return True
            
        except KafkaError as e:
            logger.error(f"Lỗi Kafka: {e}")
            return False
        except Exception as e:
            logger.error(f"Lỗi publish metadata: {e}")
            return False
    
    def send_batch(self, metadata_list: list) -> int:
        """
        Publish nhiều metadata cùng lúc
        
        Args:
            metadata_list: List các metadata dictionaries
            
        Returns:
            Số message được publish thành công
        """
        success_count = 0
        for metadata in metadata_list:
            if self.send_metadata(metadata):
                success_count += 1
        return success_count
    
    def close(self):
        """Đóng producer"""
        if self.producer:
            self.producer.flush()
            self.producer.close()
            logger.info("Đã đóng Kafka producer")

# Singleton instance
kafka_producer = KafkaMetadataProducer()
