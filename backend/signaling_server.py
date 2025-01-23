import asyncio
import websockets
import json
import logging
import os
import ssl
from urllib.parse import parse_qs
from typing import Dict, Set

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class WebRTCSignalingServer:
    def __init__(self):
        self.rooms: Dict[str, Set[websockets.WebSocketServerProtocol]] = {}

    async def handler(self, websocket, path):
        room_id = None
        try:
            room_id = self.parse_room_id(path)
            if not room_id:
                await websocket.close(1002, "No room ID")
                return

            await self.manage_room_connection(websocket, room_id)

        except Exception as e:
            logging.error(f"Handler error in room {room_id}: {e}")
            await websocket.close(1011, "Server error")

    def parse_room_id(self, path):
        query_string = path.split('?')[1] if '?' in path else ''
        query_params = parse_qs(query_string)
        return query_params.get('room', [None])[0]

    async def manage_room_connection(self, websocket, room_id):
        if room_id not in self.rooms:
            self.rooms[room_id] = set()

        self.rooms[room_id].add(websocket)
        logging.info(f"Client joined room {room_id}. Clients: {len(self.rooms[room_id])}")

        try:
            await self.handle_room_initiation(websocket, room_id)
            await self.process_client_messages(websocket, room_id)
        finally:
            await self.cleanup_room(websocket, room_id)

    async def handle_room_initiation(self, websocket, room_id):
        room_clients = self.rooms[room_id]
        if len(room_clients) == 1:
            await websocket.send(json.dumps({
                'type': 'ready',
                'isInitiator': True,
                'room': room_id
            }))
        elif len(room_clients) > 1:
            for client in room_clients:
                if client != websocket:
                    await client.send(json.dumps({
                        'type': 'ready',
                        'isInitiator': False,
                        'room': room_id
                    }))

    async def process_client_messages(self, websocket, room_id):
        async for message in websocket:
            try:
                data = json.loads(message)
                data['room'] = room_id
                logging.info(f"Received message type '{data.get('type')}' in {room_id}")
                await self.relay_message(websocket, room_id, data)
            except json.JSONDecodeError:
                logging.error("Invalid JSON message")

    async def relay_message(self, sender, room_id, data):
        for client in list(self.rooms.get(room_id, [])):
            if client != sender and not client.closed:
                try:
                    await client.send(json.dumps(data))
                except Exception as e:
                    logging.error(f"Message relay error: {e}")

    async def cleanup_room(self, websocket, room_id):
        if room_id in self.rooms and websocket in self.rooms[room_id]:
            self.rooms[room_id].remove(websocket)
        
        if room_id in self.rooms and not self.rooms[room_id]:
            del self.rooms[room_id]
            logging.info(f"Room {room_id} deleted")

    async def run_server(self):
        port = int(os.environ.get("PORT", 8765))
        logging.info(f"Starting WebSocket server on port {port}")
        
        # Optional SSL context for HTTPS/WSS
        ssl_context = None
        if os.environ.get('SSL_CERT') and os.environ.get('SSL_KEY'):
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain(
                os.environ.get('SSL_CERT'), 
                os.environ.get('SSL_KEY')
            )

        server = await websockets.serve(
            self.handler, 
            "0.0.0.0", 
            port,
            ping_interval=20,
            ping_timeout=60,
            ssl=ssl_context
        )
        logging.info(f"WebSocket server running on port {port}")
        await server.wait_closed()

def main():
    server = WebRTCSignalingServer()
    try:
        asyncio.run(server.run_server())
    except KeyboardInterrupt:
        logging.info("Server stopped")
    except Exception as e:
        logging.error(f"Server error: {e}")

if __name__ == "__main__":
    main()