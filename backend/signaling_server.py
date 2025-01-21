import asyncio
import websockets
import os

clients = set()

async def handler(websocket, path):
    clients.add(websocket)
    try:
        async for message in websocket:
            # Relay the message to all connected clients except sender
            for client in clients:
                if client != websocket:
                    await client.send(message)
    except websockets.ConnectionClosed:
        print("Client disconnected")
    finally:
        clients.remove(websocket)

async def main():
    # Get port from environment variable (Render will provide this)
    port = int(os.environ.get("PORT", 8765))
    
    # Allow connections from any origin
    async with websockets.serve(handler, "0.0.0.0", port):
        print(f"WebSocket server started on port {port}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())