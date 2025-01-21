import asyncio
import websockets
import json
import logging
import os
from urllib.parse import parse_qs

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Store clients by room
rooms = {}

async def handler(websocket, path):
    try:
        # Parse room from query string
        query_string = websocket.path.split('?')[1] if '?' in websocket.path else ''
        query_params = parse_qs(query_string)
        room_id = query_params.get('room', [None])[0]
        
        if not room_id:
            logging.warning("No room ID provided")
            await websocket.close(1002, "No room ID provided")
            return
        
        # Initialize room if it doesn't exist
        if room_id not in rooms:
            rooms[room_id] = set()
        
        # Add client to room
        rooms[room_id].add(websocket)
        logging.info(f"Client joined room {room_id}. Clients in room: {len(rooms[room_id])}")
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    # Add room ID to message if not present
                    if 'room' not in data:
                        data['room'] = room_id
                    
                    logging.info(f"Received message type '{data.get('type')}' in room {room_id}")
                    
                    # Relay message to all clients in the same room
                    for client in rooms[room_id]:
                        if client != websocket and not client.closed:
                            await client.send(json.dumps(data))
                            
                except json.JSONDecodeError:
                    logging.error("Invalid JSON message received")
                    continue
                
        except websockets.ConnectionClosed:
            logging.info(f"Client disconnected from room {room_id}")
        finally:
            # Remove client from room
            if websocket in rooms[room_id]:
                rooms[room_id].remove(websocket)
            if room_id in rooms and not rooms[room_id]:
                del rooms[room_id]
                logging.info(f"Room {room_id} deleted")
                
    except Exception as e:
        logging.error(f"Error in handler: {str(e)}")
        await websocket.close(1011, "Internal server error")

async def main():
    port = int(os.environ.get("PORT", 8765))
    
    async with websockets.serve(
        handler, 
        "0.0.0.0", 
        port,
        ping_interval=20,
        ping_timeout=60
    ):
        logging.info(f"WebSocket server running on port {port}")
        await asyncio.Future()