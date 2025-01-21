import asyncio
import websockets
import json
import logging
import os
from urllib.parse import parse_qs

logging.basicConfig(level=logging.INFO)

# Store clients by room
rooms = {}

async def handler(websocket, path):
    # Parse room from query string
    query_params = parse_qs(websocket.path_name.split('?')[1]) if '?' in websocket.path_name else {}
    room_id = query_params.get('room', [None])[0]
    
    if not room_id:
        logging.warning("No room ID provided")
        return
    
    # Initialize room if it doesn't exist
    if room_id not in rooms:
        rooms[room_id] = set()
    
    # Add client to room
    rooms[room_id].add(websocket)
    logging.info(f"Client joined room {room_id}. Clients in room: {len(rooms[room_id])}")
    
    try:
        async for message in websocket:
            # Relay message to all clients in the same room
            for client in rooms[room_id]:
                if client != websocket:
                    await client.send(message)
    except websockets.ConnectionClosed:
        logging.info(f"Client disconnected from room {room_id}")
    finally:
        # Remove client from room
        rooms[room_id].remove(websocket)
        if not rooms[room_id]:
            del rooms[room_id]
            logging.info(f"Room {room_id} deleted")

async def main():
    port = int(os.environ.get("PORT", 8765))
    
    async with websockets.serve(handler, "0.0.0.0", port, ping_interval=None):
        logging.info(f"WebSocket server running on port {port}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())