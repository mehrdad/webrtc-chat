import asyncio
import websockets
import json
import logging
import os
from urllib.parse import parse_qs

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Store clients by room
rooms = {}

async def handler(websocket, path):
    try:
        # Parse room from query string
        query_string = path.split('?')[1] if '?' in path else ''
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
        
        # Notify first client they are the initiator
        if len(rooms[room_id]) == 1:
            await websocket.send(json.dumps({
                'type': 'ready',
                'isInitiator': True,
                'room': room_id
            }))
        elif len(rooms[room_id]) > 1:
            # Notify second client they are not the initiator
            for client in rooms[room_id]:
                if client != websocket:
                    await client.send(json.dumps({
                        'type': 'ready',
                        'isInitiator': False,
                        'room': room_id
                    }))
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    
                    # Validate message structure
                    if not isinstance(data, dict):
                        logging.warning("Invalid message format")
                        continue
                    
                    # Add room to message if not present
                    data['room'] = room_id
                    
                    logging.info(f"Received message type '{data.get('type')}' in room {room_id}")
                    
                    # Relay message to all other clients in the same room
                    for client in rooms[room_id]:
                        if client != websocket and not client.closed:
                            try:
                                await client.send(json.dumps(data))
                            except Exception as relay_err:
                                logging.error(f"Error relaying message: {relay_err}")
                    
                except json.JSONDecodeError:
                    logging.error("Invalid JSON message received")
                    continue
                
        except websockets.ConnectionClosed:
            logging.info(f"Client disconnected from room {room_id}")
        finally:
            # Remove client from room
            if websocket in rooms[room_id]:
                rooms[room_id].remove(websocket)
            if not rooms[room_id]:
                del rooms[room_id]
                logging.info(f"Room {room_id} deleted")
                
    except Exception as e:
        logging.error(f"Error in handler: {str(e)}")
        await websocket.close(1011, "Internal server error")

async def main():
    # Get port from environment variable (Render.com sets this)
    port = int(os.environ.get("PORT", 10000))
    
    # Log startup
    logging.info(f"Starting WebSocket server on port {port}")
    
    server = await websockets.serve(
        handler, 
        "0.0.0.0",  # Listen on all available interfaces
        port,
        ping_interval=20,
        ping_timeout=60
    )
    
    logging.info(f"WebSocket server is running on port {port}")
    await server.wait_closed()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Server stopped by user")
    except Exception as e:
        logging.error(f"Server error: {str(e)}")