#!/usr/bin/env python3
"""
Script to initialize Kafka topics before Spark streaming starts
"""
from kafka.admin import KafkaAdminClient, NewTopic
from kafka.errors import TopicAlreadyExistsError
import time
import sys

KAFKA_BROKER = 'kafka:9092'
TOPICS = ['xray_metadata', 'xray_metadata_priority']

def wait_for_kafka(max_retries=30, retry_interval=2):
    """Wait for Kafka to be ready"""
    print(f"Waiting for Kafka at {KAFKA_BROKER}...")
    for i in range(max_retries):
        try:
            admin = KafkaAdminClient(
                bootstrap_servers=[KAFKA_BROKER],
                client_id='topic_init'
            )
            admin.close()
            print(f"Kafka is ready!")
            return True
        except Exception as e:
            print(f"Attempt {i+1}/{max_retries}: Kafka not ready yet - {e}")
            time.sleep(retry_interval)
    
    print("Failed to connect to Kafka")
    return False

def create_topics():
    """Create Kafka topics if they don't exist"""
    try:
        admin = KafkaAdminClient(
            bootstrap_servers=[KAFKA_BROKER],
            client_id='topic_creator'
        )
        
        existing_topics = admin.list_topics()
        print(f"Existing topics: {existing_topics}")
        
        topics_to_create = []
        for topic_name in TOPICS:
            if topic_name not in existing_topics:
                topics_to_create.append(
                    NewTopic(
                        name=topic_name,
                        num_partitions=1,
                        replication_factor=1
                    )
                )
                print(f"Will create topic: {topic_name}")
            else:
                print(f"Topic already exists: {topic_name}")
        
        if topics_to_create:
            admin.create_topics(new_topics=topics_to_create, validate_only=False)
            print(f"Created {len(topics_to_create)} topics")
        else:
            print("All topics already exist")
        
        admin.close()
        return True
        
    except TopicAlreadyExistsError as e:
        print(f"Topics already exist: {e}")
        return True
    except Exception as e:
        print(f"Error creating topics: {e}")
        return False

if __name__ == "__main__":
    if not wait_for_kafka():
        print("Cannot proceed without Kafka")
        sys.exit(1)
    
    if create_topics():
        print("Kafka topics initialization complete")
        sys.exit(0)
    else:
        print("Failed to initialize topics")
        sys.exit(1)
