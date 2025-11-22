"""
WebSocket router for real-time data updates
"""
import logging
import asyncio
import json
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from utils.mongo_client import mongo_client

logger = logging.getLogger(__name__)
router = APIRouter()

# Store active connections
active_connections: Set[WebSocket] = set()

async def broadcast_stats():
    """Broadcast statistics to all connected clients"""
    if not active_connections:
        return
    
    try:
        stats = mongo_client.get_overall_statistics()
        message = json.dumps({
            "type": "stats_update",
            "data": stats
        })
        
        # Send to all connected clients
        disconnected = set()
        for connection in active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error sending to client: {e}")
                disconnected.add(connection)
        
        # Remove disconnected clients
        active_connections.difference_update(disconnected)
        
    except Exception as e:
        logger.error(f"Error broadcasting stats: {e}")

@router.websocket("/ws/stats")
async def websocket_stats(websocket: WebSocket):
    """
    WebSocket endpoint for real-time statistics updates
    Sends stats every 5 seconds
    """
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"New WebSocket connection. Total: {len(active_connections)}")
    
    try:
        # Send initial stats immediately
        stats = mongo_client.get_overall_statistics()
        await websocket.send_json({
            "type": "stats_update",
            "data": stats
        })
        
        # Keep connection alive and send periodic updates
        while True:
            # Wait for 5 seconds
            await asyncio.sleep(5)
            
            # Broadcast to all clients
            await broadcast_stats()
            
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        active_connections.discard(websocket)
        logger.info(f"Connection removed. Total: {len(active_connections)}")
