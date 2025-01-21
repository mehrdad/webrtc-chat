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

function initializeRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room');
    
    if (!roomId) {
        roomId = Math.random().toString(36).substring(7);
        window.history.pushState({}, '', `?room=${roomId}`);
    }
    
    const roomLinkContainer = document.createElement('div');
    roomLinkContainer.innerHTML = `
        <div style="
            margin: 20px auto;
            padding: 15px;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            max-width: 600px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        ">
            <h3 style="margin: 0 0 10px 0; color: #212529;">Room Link</h3>
            <div style="display: flex; gap: 10px; align-items: center; justify-content: center;">
                <input type="text" 
                    value="${window.location.href}" 
                    style="
                        flex: 1;
                        padding: 8px 12px;
                        border: 1px solid #ced4da;
                        border-radius: 4px;
                        font-size: 14px;
                        min-width: 200px;
                    "
                    readonly
                >
                <button onclick="copyRoomLink()" 
                    style="
                        padding: 8px 16px;
                        background: #0d6efd;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    "
                >Copy Link</button>
            </div>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #6c757d;">
                Share this link with others to join the video chat
            </p>
        </div>
    `;
    document.body.insertBefore(roomLinkContainer, document.body.firstChild);
}

function copyRoomLink() {
    const roomLink = window.location.href;
    navigator.clipboard.writeText(roomLink).then(() => {
        const button = document.querySelector('button');
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.background = '#198754';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#0d6efd';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy link:', err);
        alert('Failed to copy link. Please copy it manually.');
    });
}

function connectSignalingServer() {
    const isLocal = window.location.hostname === 'localhost';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isLocal 
        ? `${wsProtocol}//localhost:8765?room=${roomId}`
        : `wss://webrtc-chat-yitq.onrender.com?room=${roomId}`;
        
    signalingServer = new WebSocket(wsUrl);
    
    signalingServer.onopen = async () => {
        console.log('Connected to signaling server');
        try {
            await initialize();
            signalingServer.send(JSON.stringify({ 
                type: 'ready',
                room: roomId 
            }));
        } catch (err) {
            console.error('Error during initialization:', err);
        }
    };

    signalingServer.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    signalingServer.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        setTimeout(connectSignalingServer, 5000);
    };

    signalingServer.onmessage = async message => {
        try {
            const data = JSON.parse(message.data);
            console.log('Received message:', data.type);

            switch (data.type) {
                case 'ready':
                    if (!isInitiator) {
                        isInitiator = true;
                        await startCall();
                    }
                    break;

                case 'offer':
                    await handleOffer(data);
                    break;

                case 'answer':
                    await handleAnswer(data);
                    break;

                case 'ice-candidate':
                    await handleIceCandidate(data);
                    break;

                case 'chat-message':
                    displayChatMessage('Remote', data.message);
                    break;
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    };
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);

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
                candidate: event.candidate,
                room: roomId
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
    } catch (err) {
        console.error('Error initializing media devices:', err);
        alert('Error accessing camera/microphone. Please check permissions.');
        throw err;
    }
}

async function startCall() {
    try {
        chatChannel = peerConnection.createDataChannel('chat');
        setupChatChannel(chatChannel);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        signalingServer.send(JSON.stringify({
            type: 'offer',
            offer,
            room: roomId
        }));
    } catch (err) {
        console.error('Error starting call:', err);
    }
}

async function handleOffer(data) {
    if (!peerConnection) {
        peerConnection = createPeerConnection();
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    signalingServer.send(JSON.stringify({
        type: 'answer',
        answer,
        room: roomId
    }));
}

async function handleAnswer(data) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
}

async function handleIceCandidate(data) {
    if (data.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error('Error adding ICE candidate:', err);
        }
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

function displayChatMessage(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = `${sender}: ${message}`;
    messageElement.className = `message ${sender.toLowerCase()}`;
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function sendMessage(message) {
    if (!message.trim()) return;

    if (chatChannel && chatChannel.readyState === 'open') {
        chatChannel.send(message);
        displayChatMessage('You', message);
    } else {
        signalingServer.send(JSON.stringify({
            type: 'chat-message',
            message,
            room: roomId
        }));
    }
}

chatInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        sendMessage(chatInput.value);
        chatInput.value = '';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initializeRoom();
    connectSignalingServer();
});