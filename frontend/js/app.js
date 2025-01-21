const signalingServer = new WebSocket('ws://localhost:8765/');
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