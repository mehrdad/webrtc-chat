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

// Send a chat message through the data channel
function sendMessage(message) {
    if (!chatChannel || chatChannel.readyState !== 'open') {
        console.error('Chat channel is not open. Cannot send message.');
        return;
    }

    try {
        chatChannel.send(message);
        console.log('Message sent:', message);

        // Display the sent message in the chat UI
        const sentMessage = document.createElement('div');
        sentMessage.textContent = `You: ${message}`;
        sentMessage.className = 'sent-message'; // Optional CSS styling class
        chatContainer.appendChild(sentMessage);
    } catch (err) {
        console.error('Failed to send message:', err);
    }
}

// Initialize DOM elements
function initializeDOMElements() {
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    chatInput = document.getElementById('chat-input');
    chatContainer = document.getElementById('chat-container');

    // Add chat input event listener
    chatInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && chatInput.value.trim()) {
            sendMessage(chatInput.value.trim());
            chatInput.value = ''; // Clear input box after sending
        }
    });
}

// Create a new RTCPeerConnection
function createPeerConnection() {
    const pc = new RTCPeerConnection(iceServers);

    // Handle remote tracks
    pc.ontrack = event => {
        if (remoteVideo && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    // Handle ICE candidates
    pc.onicecandidate = event => {
        if (event.candidate) {
            signalingServer.send(JSON.stringify({
                type: 'candidate',
                candidate: event.candidate
            }));
        }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log('Connection state changed:', pc.connectionState);
    };

    // Handle data channel for chat
    if (isInitiator) {
        chatChannel = pc.createDataChannel('chat');
        setupChatChannel(chatChannel);
    } else {
        pc.ondatachannel = event => {
            chatChannel = event.channel;
            setupChatChannel(chatChannel);
        };
    }

    return pc;
}

// Set up the chat channel
function setupChatChannel(channel) {
    channel.onopen = () => {
        console.log('Chat channel opened');
        // Enable chat input
        chatInput.disabled = false;
    };
    channel.onclose = () => {
        console.log('Chat channel closed');
        chatInput.disabled = true; // Disable chat input
    };
    channel.onmessage = event => {
        console.log('Chat message received:', event.data);

        // Display received messages in the chat UI
        const receivedMessage = document.createElement('div');
        receivedMessage.textContent = event.data;
        receivedMessage.className = 'received-message'; // Optional CSS styling class
        chatContainer.appendChild(receivedMessage);
    };
}

// Initialize WebRTC and media streams
async function initialize() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = createPeerConnection();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}

// Connect to the signaling server
function connectSignalingServer() {
    const isLocal = window.location.hostname === 'localhost';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isLocal
        ? `${wsProtocol}//localhost:8765?room=${roomId}`
        : `wss://webrtc-chat-yitq.onrender.com?room=${roomId}`;

    signalingServer = new WebSocket(wsUrl);

    signalingServer.onopen = () => {
        console.log('Connected to signaling server');
        signalingServer.send(JSON.stringify({
            type: 'ready',
            room: roomId
        }));
    };

    signalingServer.onmessage = async event => {
        const message = JSON.parse(event.data);

        if (message.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            signalingServer.send(JSON.stringify({ type: 'answer', answer }));
        } else if (message.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        } else if (message.type === 'candidate') {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    };
}

// Initialize room and handle room creation or joining
function initializeRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room') || Math.random().toString(36).substring(7);
    window.history.pushState({}, '', `?room=${roomId}`);

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

// DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    initializeRoom();
    initialize().then(connectSignalingServer).catch(err => {
        console.error('Failed to initialize:', err);
    });
});
