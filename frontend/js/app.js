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
                { urls: 'stun:stun2.l.google.com:19302' },
                { 
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
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
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            this.localVideo.srcObject = this.localStream;
        } catch (err) {
            this.updateStatus(`Media access error: ${err.message}`);
            console.error(err);
        }
    }

    connectSignalingServer() {
        // Use relative WebSocket URL to match Render's routing
        const wsUrl = '/ws?room=${this.roomId}';

        this.signalingServer = new WebSocket(wsUrl);
        this.signalingServer.onopen = () => this.handleSignalingOpen();
        this.signalingServer.onmessage = (event) => this.handleSignalingMessage(event);
        this.signalingServer.onclose = () => this.handleSignalingClose();
        this.signalingServer.onerror = (error) => this.handleSignalingError(error);
    }

    handleSignalingOpen() {
        this.updateStatus('Connected to signaling server');
    }

    handleSignalingError(error) {
        this.updateStatus(`Signaling error: ${error}`);
        console.error('Signaling error:', error);
    }

    async handleSignalingMessage(event) {
        try {
            const message = JSON.parse(event.data);
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
        } catch (err) {
            console.error('Signaling message error:', err);
        }
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
            this.signalingServer.send(JSON.stringify({
                type: 'offer',
                offer: offer,
                room: this.roomId
            }));
        }
    }

    setupPeerConnectionListeners() {
        this.peerConnection.ontrack = event => {
            this.remoteVideo.srcObject = event.streams[0];
        };

        this.peerConnection.onicecandidate = event => {
            if (event.candidate) {
                this.signalingServer.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate,
                    room: this.roomId
                }));
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
        this.signalingServer.send(JSON.stringify({
            type: 'answer',
            answer: answer,
            room: this.roomId
        }));
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

    handleSignalingClose() {
        this.updateStatus('Disconnected. Reconnecting...');
        setTimeout(() => this.connectSignalingServer(), 2000);
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
            // Fallback to signaling server if data channel is not ready
            this.signalingServer.send(JSON.stringify({
                type: 'chat',
                message: message,
                room: this.roomId
            }));
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