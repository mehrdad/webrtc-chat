// Add room functionality at the start of app.js
let roomId = '';

// Function to generate or join a room
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

// Initialize room before setting up WebSocket
initializeRoom();

// Update WebSocket connection to include room info
const isLocal = window.location.hostname === 'localhost';
const signalingServer = new WebSocket(
    isLocal 
        ? `ws://localhost:8765?room=${roomId}`
        : `wss://webrtc-chat-yitq.onrender.com?room=${roomId}`
);

signalingServer.onopen = () => {
    console.log('Connected to signaling server');
    // Send room join message
    signalingServer.send(JSON.stringify({
        type: 'join',
        room: roomId
    }));
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');

let localStream;
let remoteStream;
let peerConnection;
let chatChannel;
let isInitiator = false;

// ICE servers configuration
const iceServers = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302'
    ]
  }
];

function createPeerConnection() {
  peerConnection = new RTCPeerConnection({ iceServers });

  // Log connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', peerConnection.iceConnectionState);
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      signalingServer.send(JSON.stringify({
        type: 'ice-candidate',
        candidate: event.candidate
      }));
    }
  };

  peerConnection.ontrack = event => {
    console.log('Received remote track');
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.ondatachannel = event => {
    console.log('Received remote data channel');
    chatChannel = event.channel;
    setupChatChannel(chatChannel);
  };

  return peerConnection;
}

// Initialize media stream and start the process
async function initialize() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    localVideo.srcObject = localStream;

    peerConnection = createPeerConnection();
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Set up as initiator if first to connect
    signalingServer.send(JSON.stringify({ type: 'ready' }));
  } catch (err) {
    console.error('Error initializing media devices:', err);
    alert('Error accessing camera/microphone. Please check permissions.');
  }
}

// Handle signaling server messages
signalingServer.onopen = () => {
  console.log('Connected to signaling server');
  initialize();
};

signalingServer.onmessage = async message => {
  try {
    const data = JSON.parse(message.data);
    console.log('Received message:', data.type);

    switch (data.type) {
      case 'ready':
        if (!isInitiator) {
          isInitiator = true;
          startCall();
        }
        break;

      case 'offer':
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        signalingServer.send(JSON.stringify({
          type: 'answer',
          answer
        }));
        break;

      case 'answer':
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        break;

      case 'ice-candidate':
        if (data.candidate) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        }
        break;

      case 'chat-message':
        displayChatMessage('Remote', data.message);
        break;
    }
  } catch (err) {
    console.error('Error handling message:', err);
  }
};

// Create offer and data channel
async function startCall() {
  try {
    chatChannel = peerConnection.createDataChannel('chat');
    setupChatChannel(chatChannel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signalingServer.send(JSON.stringify({
      type: 'offer',
      offer
    }));
  } catch (err) {
    console.error('Error starting call:', err);
  }
}

function setupChatChannel(channel) {
  channel.onmessage = event => {
    displayChatMessage('Remote', event.data);
  };

  channel.onopen = () => {
    console.log('Chat channel opened');
    chatInput.disabled = false;
  };

  channel.onclose = () => {
    console.log('Chat channel closed');
    chatInput.disabled = true;
  };
}

function sendMessage(message) {
  if (!message.trim()) return;

  if (chatChannel && chatChannel.readyState === 'open') {
    chatChannel.send(message);
    displayChatMessage('You', message);
  } else {
    signalingServer.send(JSON.stringify({
      type: 'chat-message',
      message
    }));
  }
}

function displayChatMessage(sender, message) {
  const messageElement = document.createElement('div');
  messageElement.textContent = `${sender}: ${message}`;
  chatContainer.appendChild(messageElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

chatInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    sendMessage(chatInput.value);
    chatInput.value = '';
  }
});