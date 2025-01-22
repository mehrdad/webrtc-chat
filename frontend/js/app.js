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
let pendingMessages = [];

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
        console.log('Connection status:', status);
    }
}

// Send a chat message through the data channel
function sendMessage(message) {
    console.log('Attempting to send message:', message);
    console.log('Chat channel state:', chatChannel ? chatChannel.readyState : 'not initialized');

    if (!chatChannel) {
        console.warn('Chat channel not initialized, queuing message');
        pendingMessages.push(message);
        updateConnectionStatus('Connecting... Message will be sent when ready');
        return;
    }

    if (chatChannel.readyState === 'connecting') {
        console.log('Chat channel is connecting, queuing message');
        pendingMessages.push(message);
        return;
    }

    if (chatChannel.readyState !== 'open') {
        console.warn('Chat channel not open. Current state:', chatChannel.readyState);
        updateConnectionStatus('Chat connection not ready. Please wait.');
        return;
    }

    try {
        chatChannel.send(message);
        displayMessage(message, true);
        console.log('Message sent successfully');
    } catch (err) {
        console.error('Failed to send message:', err);
        updateConnectionStatus('Failed to send message. Please try again.');
    }
}

// Send any pending messages
function sendPendingMessages() {
    while (pendingMessages.length > 0 && chatChannel && chatChannel.readyState === 'open') {
        const message = pendingMessages.shift();
        sendMessage(message);
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

    chatInput.disabled = true; // Disable chat input until connection is ready

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
        console.log('PeerConnection created');

        pc.ontrack = event => {
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                updateConnectionStatus('Connected to peer');
            }
        };

        pc.onicecandidate = event => {
            if (event.candidate && signalingServer && signalingServer.readyState === WebSocket.OPEN) {
                console.log('Sending ICE candidate');
                signalingServer.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate
                }));
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', pc.iceConnectionState);
            switch (pc.iceConnectionState) {
                case 'checking':
                    updateConnectionStatus('Connecting to peer...');
                    break;
                case 'connected':
                    updateConnectionStatus('Connected to peer');
                    break;
                case 'failed':
                    updateConnectionStatus('Connection failed. Please refresh the page.');
                    break;
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('Connection state changed:', pc.connectionState);
            switch (pc.connectionState) {
                case 'connected':
                    updateConnectionStatus('Connected to peer');
                    break;
                case 'disconnected':
                    updateConnectionStatus('Peer disconnected. Please refresh to reconnect.');
                    chatInput.disabled = true;
                    break;
                case 'failed':
                    updateConnectionStatus('Connection failed. Please refresh the page.');
                    chatInput.disabled = true;
                    break;
            }
        };

        if (isInitiator) {
            console.log('Creating data channel as initiator');
            chatChannel = pc.createDataChannel('chat', {
                ordered: true
            });
            setupChatChannel(chatChannel);
        } else {
            console.log('Waiting for data channel as non-initiator');
            pc.ondatachannel = event => {
                console.log('Received data channel');
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
    console.log('Setting up chat channel');
    
    channel.onopen = () => {
        console.log('Chat channel opened');
        chatInput.disabled = false;
        chatInput.placeholder = 'Type a message and press Enter';
        updateConnectionStatus('Chat channel opened');
        sendPendingMessages(); // Send any messages that were queued
    };

    channel.onclose = () => {
        console.log('Chat channel closed');
        chatInput.disabled = true;
        chatInput.placeholder = 'Chat disconnected';
        updateConnectionStatus('Chat channel closed');
        chatChannel = null; // Reset chat channel
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
        updateConnectionStatus('Local media initialized');

        peerConnection = createPeerConnection();
        if (!peerConnection) return;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        console.log('Local media and peer connection initialized');
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

    console.log('Connecting to signaling server:', wsUrl);
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
            console.log('Received signaling message:', message.type);

            switch (message.type) {
                case 'ready':
                    isInitiator = message.isInitiator;
                    updateConnectionStatus(isInitiator ? 'Waiting for peer to join...' : 'Joining existing room...');
                    
                    // Create and send offer if we are the initiator
                    if (isInitiator && peerConnection) {
                        try {
                            const offer = await peerConnection.createOffer();
                            await peerConnection.setLocalDescription(offer);
                            console.log('Sending offer to peer');
                            signalingServer.send(JSON.stringify({
                                type: 'offer',
                                offer: offer
                            }));
                        } catch (err) {
                            console.error('Error creating offer:', err);
                            updateConnectionStatus('Failed to create offer. Please refresh.');
                        }
                    }
                    break;
                    
                case 'offer':
                    console.log('Received offer, creating answer');
                    if (!peerConnection) {
                        console.error('No peer connection available');
                        return;
                    }
                    try {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        console.log('Sending answer to peer');
                        signalingServer.send(JSON.stringify({
                            type: 'answer',
                            answer: answer
                        }));
                    } catch (err) {
                        console.error('Error creating answer:', err);
                        updateConnectionStatus('Failed to create answer. Please refresh.');
                    }
                    break;

                case 'answer':
                    console.log('Received answer');
                    if (!peerConnection) {
                        console.error('No peer connection available');
                        return;
                    }
                    try {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                        console.log('Remote description set successfully');
                    } catch (err) {
                        console.error('Error setting remote description:', err);
                        updateConnectionStatus('Failed to complete connection. Please refresh.');
                    }
                    break;

                case 'candidate':
                    if (!peerConnection) {
                        console.error('No peer connection available');
                        return;
                    }
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                        console.log('Added ICE candidate successfully');
                    } catch (err) {
                        console.error('Error adding ICE candidate:', err);
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
    
    if (roomLinkInput) {
        roomLinkInput.value = window.location.href;
    }
    console.log('Room initialized:', roomId);
}

// DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', () => {
    console.log('Document loaded, initializing application');
    initializeDOMElements();
    initializeRoom();
    initialize().then(connectSignalingServer).catch(err => {
        console.error('Failed to initialize:', err);
        updateConnectionStatus('Failed to initialize. Please refresh the page.');
    });
});