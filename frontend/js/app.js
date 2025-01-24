class WebRTCClient {
    constructor() {
        this.initializeVars();
        this.setupEventListeners();
    }

    initializeVars() {
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.chatInput = document.getElementById('chat-input');
        this.chatContainer = document.getElementById('chat-container');
        this.connectionStatus = document.getElementById('connection-status');
        this.roomLinkInput = document.getElementById('room-link');

        this.roomId = this.generateRoomId();
        this.signalingServer = null;
        this.peerConnection = null;
        this.localStream = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.pendingMessages = [];

        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { 
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        };
    }

    setupEventListeners() {
        this.chatInput.addEventListener('keydown', this.handleChatInput.bind(this));
        document.addEventListener('DOMContentLoaded', this.initialize.bind(this));
    }

    generateRoomId() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room') || Math.random().toString(36).substring(7);
        window.history.pushState({}, '', `?room=${roomId}`);
        this.roomLinkInput.value = window.location.href;
        return roomId;
    }

    async initialize() {
        try {
            await this.setupLocalMedia();
            this.connectSignalingServer();
        } catch (err) {
            this.updateStatus(`Initialization error: ${err.message}`);
            console.error(err);
        }
    }

    async setupLocalMedia() {
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        this.localVideo.srcObject = this.localStream;
    }

    connectSignalingServer() {
        this.signalingServer = io({
            query: { room: this.roomId },
            transports: ['websocket']
        });

        this.signalingServer.on('connect', () => {
            this.updateStatus('Connected to signaling server');
        });

        this.signalingServer.on('signal', async (message) => {
            try {
                switch (message.type) {
                    case 'ready':
                        this.isInitiator = message.isInitiator;
                        await this.createPeerConnection();
                        break;
                    case 'offer':
                        await this.handleOffer(message.offer);
                        break;
                    case 'answer':
                        await this.handleAnswer(message.answer);
                        break;
                    case 'candidate':
                        await this.handleCandidate(message.candidate);
                        break;
                    case 'chat':
                        this.displayMessage(message.message, false);
                        break;
                }
            } catch (error) {
                console.error('Signaling message error:', error);
            }
        });

        this.signalingServer.on('connect_error', (error) => {
            this.updateStatus(`Connection error: ${error.message}`);
            console.error('Socket.IO connection error:', error);
        });

        this.signalingServer.on('disconnect', (reason) => {
            this.updateStatus(`Disconnected: ${reason}. Reconnecting...`);
            if (reason !== 'io server disconnect') {
                this.signalingServer.connect();
            }
        });
    }

    async createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.iceServers);
        this.setupPeerConnectionListeners();
        this.setupDataChannel();

        this.localStream.getTracks().forEach(track => 
            this.peerConnection.addTrack(track, this.localStream)
        );

        if (this.isInitiator) {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.signalingServer.emit('signal', {
                type: 'offer',
                offer: offer,
                room: this.roomId
            });
        }
    }

    setupPeerConnectionListeners() {
        this.peerConnection.ontrack = event => {
            this.remoteVideo.srcObject = event.streams[0];
        };

        this.peerConnection.onicecandidate = event => {
            if (event.candidate) {
                this.signalingServer.emit('signal', {
                    type: 'candidate',
                    candidate: event.candidate,
                    room: this.roomId
                });
            }
        };
    }

    setupDataChannel() {
        if (this.isInitiator) {
            this.dataChannel = this.peerConnection.createDataChannel('chat');
            this.setupDataChannelListeners();
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannelListeners();
            };
        }
    }

    setupDataChannelListeners() {
        this.dataChannel.onopen = () => {
            this.updateStatus('Data channel is open');
            this.pendingMessages.forEach(message => {
                this.dataChannel.send(message);
            });
            this.pendingMessages = [];
        };

        this.dataChannel.onmessage = (event) => {
            this.displayMessage(event.data, false);
        };

        this.dataChannel.onclose = () => {
            this.updateStatus('Data channel closed');
        };
    }

    async handleOffer(offer) {
        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.signalingServer.emit('signal', {
            type: 'answer',
            answer: answer,
            room: this.roomId
        });
    }

    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(answer);
    }

    async handleCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(candidate);
        } catch (err) {
            console.error('Error adding ICE candidate:', err);
        }
    }

    handleChatInput(event) {
        if (event.key === 'Enter' && this.chatInput.value.trim()) {
            const message = this.chatInput.value.trim();
            this.chatInput.value = '';
            this.sendMessage(message);
        }
    }

    sendMessage(message) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(message);
            this.displayMessage(message, true);
        } else {
            this.signalingServer.emit('signal', {
                type: 'chat',
                message: message,
                room: this.roomId
            });
            this.displayMessage(message, true);
            this.pendingMessages.push(message);
        }
    }

    displayMessage(message, isLocal) {
        const messageDiv = document.createElement('div');
        messageDiv.textContent = `${isLocal ? 'You' : 'Peer'}: ${message}`;
        messageDiv.className = `message ${isLocal ? 'local' : 'remote'}`;
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    updateStatus(message) {
        this.connectionStatus.textContent = message;
        console.log('Status:', message);
    }
}

new WebRTCClient();