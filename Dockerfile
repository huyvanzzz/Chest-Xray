FROM python:3.11-slim

WORKDIR /app

# Copy script batch metadata vào container
COPY send_batch_metadata.py /app/send_batch_metadata.py

# Cài thư viện
RUN pip install --no-cache-dir pandas kafka-python

# Mount data folder từ host (docker-compose.yml sẽ chỉ ra)
# Chạy script khi container start
CMD ["python", "send_batch_metadata.py"]
