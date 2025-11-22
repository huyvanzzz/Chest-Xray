# 1. Base image
FROM python:3.11-slim-bullseye

# 2. Cài Java 17
RUN apt-get update && \
    apt-get install -y openjdk-17-jdk bash curl && \
    rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"
COPY ai/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 3. Cài Python packages
RUN pip install --no-cache-dir \
    hdfs \
    pandas \
    pyspark==3.5.0 \
    pillow \
    torch \
    numpy \
    kafka-python \
    pymongo

# 4. Copy code
WORKDIR /app
COPY spark_streaming.py ./ 
COPY send_test_metadata.py ./
COPY init_kafka_topics.py ./
COPY ai/ ./ai/
COPY data/ ./data/

# 5. Pre-download model to avoid issues in distributed Spark
RUN python -c "import torchxrayvision as xrv; print('Downloading model...'); model = xrv.models.DenseNet(weights='densenet121-res224-nih'); print('Model downloaded!')"

# 6. CMD: Initialize Kafka topics -> Run test data sender -> Run Spark Streaming
CMD ["bash", "-c", "python init_kafka_topics.py && python send_test_metadata.py > /tmp/test_data.log 2>&1 & sleep 10 && spark-submit --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 spark_streaming.py"]