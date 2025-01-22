// Global DOM elements
let localVideo;
let remoteVideo;
let chatInput;
let chatContainer;
let connectionStatus;
let roomLinkInput;

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

// Update connection status
function updateConnectionStatus(status) {
    if (connectionStatus) {
        connectionStatus.textContent = status;
    }
}

// Send a chat message through the data channel
function sendMessage(message) {
    if (!chatChannel) {
        console.warn('Chat channel not initialized');
        return;
    }

    if (chatChannel.readyState !== 'open') {
        console.warn('Chat channel not open. Current state:', chatChannel.readyState);
        // Store message to send when channel opens
        chatChannel.onopen = () => {
            chatChannel.send(message);
            displayMessage(message, true);
        };
        return;
    }

    try {
        chatChannel.send(message);
        displayMessage(message, true);
    } catch (err) {
        console.error('Failed to send message:', err);
        updateConnectionStatus('Failed to send message. Please try again.');
    }
}

// Display message in chat container
function displayMessage(message, isLocal) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = isLocal ? `You: ${message}` : `Peer: ${message}`;
    messageDiv.className = `message ${isLocal ? 'local' : 'remote'}`;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Initialize DOM elements
function initializeDOMElements() {
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    chatInput = document.getElementById('chat-input');
    chatContainer = document.getElementById('chat-container');
    connectionStatus = document.getElementById('connection-status');
    roomLinkInput = document.getElementById('room-link');

    // Add chat input event listener
    chatInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && chatInput.value.trim()) {
            const message = chatInput.value.trim();
            chatInput.value = ''; // Clear input box before sending
            sendMessage(message);
        }
    });
}

// Create a new RTCPeerConnection
function createPeerConnection() {
    try {
        const pc = new RTCPeerConnection(iceServers);

        pc.ontrack = event => {
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                updateConnectionStatus('Connected to peer');
            }
        };

        pc.onicecandidate = event => {
            if (event.candidate && signalingServer.readyState === WebSocket.OPEN) {
                signalingServer.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate
                }));
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState);
            switch (pc.connectionState) {
                case 'connected':
                    updateConnectionStatus('Connected to peer');
                    break;
                case 'disconnected':
                    updateConnectionStatus('Peer disconnected. Please refresh to reconnect.');
                    break;
                case 'failed':
                    updateConnectionStatus('Connection failed. Please refresh the page.');
                    break;
            }
        };

        if (isInitiator) {
            chatChannel = pc.createDataChannel('chat', {
                ordered: true
            });
            setupChatChannel(chatChannel);
        } else {
            pc.ondatachannel = event => {
                chatChannel = event.channel;
                setupChatChannel(chatChannel);
            };
        }

        return pc;
    } catch (err) {
        console.error('Failed to create peer connection:', err);
        updateConnectionStatus('Failed to create connection. Please check your browser compatibility.');
        return null;
    }
}

// Set up the chat channel
function setupChatChannel(channel) {
    channel.onopen = () => {
        console.log('Chat channel opened');
        chatInput.disabled = false;
        chatInput.placeholder = 'Type a message and press Enter';
        updateConnectionStatus('Chat channel opened');
    };

    channel.onclose = () => {
        console.log('Chat channel closed');
        chatInput.disabled = true;
        chatInput.placeholder = 'Chat disconnected';
        updateConnectionStatus('Chat channel closed');
    };

    channel.onmessage = event => {
        console.log('Message received:', event.data);
        displayMessage(event.data, false);
    };

    channel.onerror = err => {
        console.error('Chat channel error:', err);
        updateConnectionStatus('Chat error occurred. Please refresh the page.');
    };
}

// Initialize WebRTC and media streams
async function initialize() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        localVideo.srcObject = localStream;

        peerConnection = createPeerConnection();
        if (!peerConnection) return;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        updateConnectionStatus('Local media initialized');
    } catch (err) {
        console.error('Media initialization failed:', err);
        updateConnectionStatus('Failed to access camera/microphone. Please check your permissions.');
    }
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
        updateConnectionStatus('Connected to server');
        signalingServer.send(JSON.stringify({
            type: 'ready',
            room: roomId
        }));
    };

    signalingServer.onclose = () => {
        console.log('Disconnected from signaling server');
        updateConnectionStatus('Connection to server lost. Please refresh the page.');
    };

    signalingServer.onerror = () => {
        console.error('Signaling server error');
        updateConnectionStatus('Failed to connect to server. Please check your internet connection.');
    };

    signalingServer.onmessage = async event => {
        try {
            const message = JSON.parse(event.data);

            switch (message.type) {
                case 'ready':
                    isInitiator = message.isInitiator;
                    updateConnectionStatus(isInitiator ? 'Waiting for peer to join...' : 'Joining existing room...');
                    break;
                case 'offer':
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    signalingServer.send(JSON.stringify({ type: 'answer', answer }));
                    break;
                case 'answer':
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                    break;
                case 'candidate':
                    if (peerConnection.remoteDescription) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                    }
                    break;
                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (err) {
            console.error('Error handling signaling message:', err);
            updateConnectionStatus('Error in connection. Please refresh the page.');
        }
    };
}

// Initialize room and handle room creation or joining
function initializeRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room') || Math.random().toString(36).substring(7);
    window.history.pushState({}, '', `?room=${roomId}`);
    
    // Update room link input
    if (roomLinkInput) {
        roomLinkInput.value = window.location.href;
    }
}

// DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    initializeRoom();
    initialize().then(connectSignalingServer).catch(err => {
        console.error('Failed to initialize:', err);
        updateConnectionStatus('Failed to initialize. Please refresh the page.');
    });
});