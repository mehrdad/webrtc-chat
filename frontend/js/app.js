// Global DOM elements
let localVideo;
let remoteVideo;
let chatInput;
let chatContainer;

// WebRTC variables
let roomId = '';
let signalingServer;
let localStream;
let remoteStream;
let peerConnection;
let chatChannel;
let isInitiator = false;

// ICE servers configuration
const iceServers = {
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ]
        }
    ]
};

// Initialize all DOM elements
function initializeDOMElements() {
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    chatInput = document.getElementById('chat-input');
    chatContainer = document.getElementById('chat-container');

    // Add chat input event listener only after element is found
    if (chatInput) {
        chatInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                sendMessage(chatInput.value);
                chatInput.value = '';
            }
        });
    } else {
        console.error('Chat input element not found');
    }
}

async function initialize() {
    try {
        console.log('Requesting media permissions...');
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        if (localVideo) {
            localVideo.srcObject = localStream;
            console.log('Local video stream set');
        } else {
            console.error('Local video element not found');
        }

        peerConnection = createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    } catch (err) {
        console.error('Error initializing media devices:', err);
        alert('Error accessing camera/microphone. Please check permissions and make sure no other app is using them.');
        throw err;
    }
}

// Rest of your existing code remains the same until the DOMContentLoaded event

// Update the DOMContentLoaded event handler
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    
    // Initialize DOM elements first
    initializeDOMElements();
    
    // Then initialize room and connection
    function initializeRoom() {
      // Check URL for room ID
      const urlParams = new URLSearchParams(window.location.search);
      roomId = urlParams.get('room');
      
      if (!roomId) {
          // Generate a random room ID if none exists
          roomId = Math.random().toString(36).substring(7);
          // Update URL with room ID
          window.history.pushState({}, '', `?room=${roomId}`);
      }
      
      // Display room link
      const roomLink = document.createElement('div');
      roomLink.innerHTML = `
          <div style="margin: 10px; padding: 10px; background: #f0f0f0; border-radius: 5px;">
              Share this link to connect: <br>
              <input type="text" 
                     value="${window.location.href}" 
                     style="width: 100%; margin-top: 5px; padding: 5px;"
                     readonly
                     onclick="this.select();">
          </div>
      `;
      document.body.insertBefore(roomLink, document.body.firstChild);
  }
    initializeRoom();
    
    // Request camera/mic permissions and connect to signaling server
    initialize().then(() => {
        connectSignalingServer();
    }).catch(err => {
        console.error('Failed to initialize:', err);
    });
});

// Add a function to check media permissions
async function checkMediaPermissions() {
    try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        return true;
    } catch (err) {
        console.error('Media permission check failed:', err);
        return false;
    }
}

// Update the connectSignalingServer function
function connectSignalingServer() {
    const isLocal = window.location.hostname === 'localhost';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isLocal 
        ? `${wsProtocol}//localhost:8765?room=${roomId}`
        : `wss://webrtc-chat-yitq.onrender.com?room=${roomId}`;
        
    console.log('Connecting to signaling server at:', wsUrl);
    
    signalingServer = new WebSocket(wsUrl);
    
    signalingServer.onopen = async () => {
        console.log('Connected to signaling server');
        signalingServer.send(JSON.stringify({ 
            type: 'ready',
            room: roomId 
        }));
    };

    // Rest of your existing WebSocket handlers...
}