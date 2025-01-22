// ... (previous code until signalServer.onmessage remains the same) ...

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


// Also update the createPeerConnection function to include ICE connection state logging
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

// ... (rest of the code remains the same) ...