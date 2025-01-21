import asyncio
import websockets
import os
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)

clients = set()

async def handler(websocket, path):
    clients.add(websocket)
    logging.info(f"New client connected. Total clients: {len(clients)}")
    try:
        async for message in websocket:
            logging.info(f"Received message: {message[:100]}...")  # Log first 100 chars
            for client in clients:
                if client != websocket:
                    await client.send(message)
    except websockets.ConnectionClosed:
        logging.info("Client disconnected")
    finally:
        clients.remove(websocket)
        logging.info(f"Client removed. Total clients: {len(clients)}")

async def main():
    # Get port from environment variable (Render will provide this)
    port = int(os.environ.get("PORT", 8765))
    
    logging.info(f"Starting server on port {port}")
    async with websockets.serve(
        handler,
        "0.0.0.0",
        port,
        ping_interval=None  # Disable ping/pong for Render
    ):
        logging.info("WebSocket server is running")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())