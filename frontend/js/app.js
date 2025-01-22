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
        sentMessage.className = 'sent-message';
        chatContainer.appendChild(sentMessage);
    } catch (err) {
        console.error('Failed to send message:', err);
    }
}

function initializeDOMElements() {
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    chatInput = document.getElementById('chat-input');
    chatContainer = document.getElementById('chat-container');

    if (chatInput) {
        chatInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && chatInput.value.trim()) {
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
        alert('Error accessing camera/microphone. Please check permissions.');
        throw err;
    }
}

function createPeerConnection() {
    try {
        const pc = new RTCPeerConnection(iceServers);

        pc.ontrack = event => {
            console.log('Remote track received:', event.streams);
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        pc.onicecandidate = event => {
            if (event.candidate) {
                if (signalingServer && signalingServer.readyState === WebSocket.OPEN) {
                    signalingServer.send(JSON.stringify({
                        type: 'candidate',
                        candidate: event.candidate
                    }));
                } else {
                    console.error('Signaling server is not connected. Cannot send ICE candidate.');
                }
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('Connection state changed:', pc.connectionState);
            if (pc.connectionState === 'disconnected') {
                console.warn('Peer disconnected');
            }
        };

        pc.ondatachannel = event => {
            console.log('Data channel received:', event.channel);
            chatChannel = event.channel;

            chatChannel.onmessage = msgEvent => {
                console.log('Chat message received:', msgEvent.data);
                const message = document.createElement('div');
                message.textContent = msgEvent.data;
                chatContainer.appendChild(message);
            };

            chatChannel.onopen = () => console.log('Chat channel opened');
            chatChannel.onclose = () => console.log('Chat channel closed');
        };

        console.log('PeerConnection created');
        return pc;
    } catch (err) {
        console.error('Error creating PeerConnection:', err);
        throw err;
    }
}

function initializeRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room');

    if (!roomId) {
        roomId = Math.random().toString(36).substring(7);
        window.history.pushState({}, '', `?room=${roomId}`);
    }

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

function connectSignalingServer() {
    const isLocal = window.location.hostname === 'localhost';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isLocal
        ? `${wsProtocol}//localhost:8765?room=${roomId}`
        : `wss://webrtc-chat-yitq.onrender.com?room=${roomId}`;

    console.log('Connecting to signaling server at:', wsUrl);

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

        if (message.type === 'offer' && !isInitiator) {
            console.log('Received offer:', message);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            signalingServer.send(JSON.stringify({ type: 'answer', answer }));
        } else if (message.type === 'answer' && isInitiator) {
            console.log('Received answer:', message);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        } else if (message.type === 'candidate') {
            console.log('Received ICE candidate:', message);
            if (message.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            }
        }
    };

    signalingServer.onerror = err => console.error('WebSocket error:', err);
    signalingServer.onclose = () => console.log('Disconnected from signaling server');
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    initializeDOMElements();
    initializeRoom();

    initialize().then(() => {
        connectSignalingServer();
    }).catch(err => {
        console.error('Failed to initialize:', err);
    });
});
