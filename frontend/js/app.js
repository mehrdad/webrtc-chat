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

// Initialize DOM elements
function initializeDOMElements() {
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    chatInput = document.getElementById('chat-input');
    chatContainer = document.getElementById('chat-container');

    if (chatInput) {
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                sendMessage(chatInput.value);
                chatInput.value = '';
            }
        });
    }
}

// Initialize media devices
async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Please allow access to your camera and microphone.');
    }
}

// Create WebRTC PeerConnection
function createPeerConnection() {
    const pc = new RTCPeerConnection(iceServers);

    pc.ontrack = (event) => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            signalingServer.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected') {
            console.warn('Peer disconnected.');
        }
    };

    pc.ondatachannel = (event) => {
        setupChatChannel(event.channel);
    };

    return pc;
}

// Setup chat channel
function setupChatChannel(channel) {
    chatChannel = channel;

    chatChannel.onmessage = (event) => {
        const message = document.createElement('div');
        message.textContent = `Peer: ${event.data}`;
        chatContainer.appendChild(message);
    };

    chatChannel.onopen = () => console.log('Chat channel opened');
    chatChannel.onclose = () => console.log('Chat channel closed');
}

// Send a chat message
function sendMessage(message) {
    if (chatChannel && chatChannel.readyState === 'open') {
        chatChannel.send(message);
        const messageElement = document.createElement('div');
        messageElement.textContent = `You: ${message}`;
        chatContainer.appendChild(messageElement);
    } else {
        console.error('Chat channel is not open.');
    }
}

// Connect to the signaling server
function connectSignalingServer() {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//webrtc-chat-yitq.onrender.com?room=${roomId}`;

    signalingServer = new WebSocket(wsUrl);

    signalingServer.onopen = () => {
        signalingServer.send(JSON.stringify({ type: 'join', room: roomId }));
    };

    signalingServer.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'offer':
                if (!isInitiator) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    signalingServer.send(JSON.stringify({ type: 'answer', answer }));
                }
                break;
            case 'answer':
                if (isInitiator) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
                break;
            case 'candidate':
                if (data.candidate) {
                    peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                break;
            default:
                console.error('Unknown message type:', data.type);
        }
    };
}

// Initialize the app
async function initialize() {
    initializeDOMElements();

    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room') || Math.random().toString(36).substring(7);
    window.history.pushState({}, '', `?room=${roomId}`);

    const roomLink = document.createElement('div');
    roomLink.innerHTML = `
        Share this link: <input type="text" value="${location.href}" readonly>
    `;
    document.body.prepend(roomLink);

    peerConnection = createPeerConnection();
    await initializeMedia();

    if (!urlParams.get('room')) {
        isInitiator = true;
        const dataChannel = peerConnection.createDataChannel('chat');
        setupChatChannel(dataChannel);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        signalingServer.send(JSON.stringify({ type: 'offer', offer }));
    }

    connectSignalingServer();
}

document.addEventListener('DOMContentLoaded', initialize);
