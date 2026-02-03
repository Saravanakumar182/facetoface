let ws = null;
let localStream = null;
let userId = null;
let roomId = null;
let roomMembers = [];
let peerConnections = {};

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

const connect = () => {
    ws = new WebSocket("ws://localhost:8080/signal");

    ws.onopen = () => {
        console.log("✅ Connected to server");
        onConnected();
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };

    ws.onerror = (error) => {
        console.error("❌ WebSocket connection error", error);
    };

    ws.onclose = () => {
        console.log("❌ WebSocket disconnected");
    };
};

function onConnected() {
    console.log("Ready to exchange offers and answers");
}

async function initializePeerConnection(peerId) {

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("📤 Sending ICE candidate to:", peerId);
            sendMessage("signal", "ice", event.candidate, peerId);
        } else {
            console.log("✅ ICE candidate gathering completed for:", peerId);
        }
    };

    // Handle remote track
    pc.ontrack = (event) => {
        console.log("📥 Remote track received from:", peerId);
        const remoteVideo = document.getElementById(`remoteVideo-${peerId}`);
        if (remoteVideo && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}:`, pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            closePeerConnection(peerId);
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${peerId}:`, pc.iceConnectionState);
    };

    // Add local stream tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    peerConnections[peerId] = pc;
    return pc;
}

async function createOfferForPeer(peerId) {
    if (!peerConnections[peerId]) {
        await initializePeerConnection(peerId);
    }
    const pc = peerConnections[peerId];
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("📤 Sending offer to:", peerId);
    sendMessage("signal", "offer", offer, peerId);
}

async function handleOfferMessage(message) {
    console.log("📩 Offer received from:", message.fromId);
    const peerId = message.fromId;
    
    if (!peerConnections[peerId]) {
        await initializePeerConnection(peerId);
    }
    createRemoteVideoElement(peerId);
    const pc = peerConnections[peerId];
    await pc.setRemoteDescription(new RTCSessionDescription(message.data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log("📤 Sending answer to:", peerId);
    sendMessage("signal", "answer", answer, peerId);
}

async function handleAnswerMessage(message) {
    console.log("📩 Answer received from:", message.fromId);
    const peerId = message.fromId;
    
    if (peerConnections[peerId]) {
        const pc = peerConnections[peerId];
        await pc.setRemoteDescription(new RTCSessionDescription(message.data));
    }
}

async function handleIceMessage(message) {
    console.log("📩 ICE candidate received from:", message.fromId);
    const peerId = message.fromId;
    
    if (peerConnections[peerId]) {
        try {
            await peerConnections[peerId]
                .addIceCandidate(new RTCIceCandidate(message.data));
        } catch (e) {
            console.error(`Error adding ICE candidate for ${peerId}:`, e);
        }
    }
}

function createRemoteVideoElement(peerId) {

    const container = document.getElementById("remoteVideosContainer");
    
    if (document.getElementById(`videoBox-${peerId}`)) {
        return;
    }
    
    const videoBox = document.createElement("div");
    videoBox.className = "video-box";
    videoBox.id = `videoBox-${peerId}`;
    
    const label = document.createElement("div");
    label.className = "video-label";
    label.textContent = `Peer: ${peerId}`;
    
    const video = document.createElement("video");
    video.id = `remoteVideo-${peerId}`;
    video.autoplay = true;
    video.playsinline = true;
    
    videoBox.appendChild(label);
    videoBox.appendChild(video);
    container.appendChild(videoBox);
    
    console.log("📹 Created video element for peer:", peerId);
    
}

function removeRemoteVideoElement(peerId) {
    const videoBox = document.getElementById(`videoBox-${peerId}`);
    if (videoBox) {
        videoBox.remove();
        console.log("🗑️ Removed video element for peer:", peerId);
    }
}

function closePeerConnection(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
        console.log("🔌 Closed peer connection with:", peerId);
        
        removeRemoteVideoElement(peerId);
    }
}

function handleMessage(message) {
    console.log("📩 Incoming message:", message);
    
    switch (message.type) {
        case "id":
            // User ID received from server on connection
            userId = message.data;
            console.log("✅ User ID assigned:", userId);
            const userIdInput = document.getElementById('userId');
            if (userIdInput) userIdInput.value = userId;
            break;
            
        case "roomId":
            // Room ID received after creating room
            roomId = message.data;
            console.log("✅ Room ID assigned:", roomId);
            const roomInput = document.getElementById('roomIdInput');
            if (roomInput) roomInput.value = roomId;
            break;
            
        case "room_mems":
            // Room members list received from backend (RoomMemResponse)
            handleRoomMembersMessage(message);
            break;
            
        case "signal":
            // WebRTC signal (offer, answer, ice)
            handleSignalMessage(message.data);
            break;

        case "mem_leave":
            handleLeaveMessage(message.data);
            break;
            
        default:
            console.log("⚠️ Unknown message type:", message.type);
    }
}

function handleLeaveMessage(peerId){
    roomMembers = roomMembers.filter(id => id !== peerId);
    closePeerConnection(peerId);
    console.log("👋 Peer left:", peerId);
}

function handleRoomMembersMessage(message) {
    roomMembers = message.mems;
    console.log("📩 Room members received:", roomMembers);
    
    // Update room-based UI
    showRoomUI(roomMembers);

    // Create peer connections for new members
    roomMembers.forEach(memberId => {
        if (memberId !== userId && !peerConnections[memberId]) {
            createRemoteVideoElement(memberId);
            createOfferForPeer(memberId);
        }
    });
}

function showRoomUI(members) {
    const panel = document.getElementById('roomPanel');
    const roomDisplay = document.getElementById('roomDisplay');
    const membersList = document.getElementById('membersList');
    const roomInput = document.getElementById('roomIdInput');
    const createBtn = document.getElementById('createRoomBtn');
    const joinBtn = document.getElementById('joinRoomBtn');
    const remoteDiv = document.getElementById('remoteUserDiv');
    const callButtonsDiv = document.getElementById('callButtonsDiv');
    const startBtn = document.getElementById('startCallBtn');
    const endBtn = document.getElementById('endCallBtn');

    if (panel) panel.style.display = 'block';
    if (roomDisplay) roomDisplay.textContent = roomId || (roomInput && roomInput.value) || '-';

    // Populate members list
    if (membersList) {
        membersList.innerHTML = '';
        members.forEach(id => {
            const li = document.createElement('li');
            li.style.padding = '6px 10px';
            li.style.background = '#fff';
            li.style.border = '1px solid #ddd';
            li.style.borderRadius = '4px';
            li.textContent = id === userId ? `${id} (You)` : id;
            li.onclick = () => {
                const remoteInput = document.getElementById('remoteUserId');
                if (remoteInput) remoteInput.value = id;
            };
            membersList.appendChild(li);
        });
    }

    // Disable and hide room creation controls while in room
    if (roomInput) roomInput.disabled = true;
    if (createBtn) {
        createBtn.disabled = true;
        createBtn.style.display = 'none';
    }
    if (joinBtn) {
        joinBtn.disabled = true;
        joinBtn.style.display = 'none';
    }

    // Hide remote-user input and call buttons while in room
    if (remoteDiv) remoteDiv.style.display = 'none';
    if (callButtonsDiv) callButtonsDiv.style.display = 'none';
    if (startBtn) startBtn.style.display = 'none';
    if (endBtn) endBtn.style.display = 'none';

    const status = document.getElementById('status');
    if (status) status.textContent = `In room ${roomId || (roomInput && roomInput.value)}`;
}

function hideRoomUI() {
    const panel = document.getElementById('roomPanel');
    const roomInput = document.getElementById('roomIdInput');
    const createBtn = document.getElementById('createRoomBtn');
    const joinBtn = document.getElementById('joinRoomBtn');
    const membersList = document.getElementById('membersList');
    const roomDisplay = document.getElementById('roomDisplay');
    const remoteDiv = document.getElementById('remoteUserDiv');
    const callButtonsDiv = document.getElementById('callButtonsDiv');
    const startBtn = document.getElementById('startCallBtn');
    const endBtn = document.getElementById('endCallBtn');

    if (panel) panel.style.display = 'none';
    if (roomInput) {
        roomInput.disabled = false;
        roomInput.value = '';
    }
    if (createBtn) {
        createBtn.disabled = false;
        createBtn.style.display = '';
    }
    if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.style.display = '';
    }
    if (remoteDiv) remoteDiv.style.display = '';
    if (callButtonsDiv) callButtonsDiv.style.display = '';
    if (startBtn) startBtn.style.display = '';
    if (endBtn) endBtn.style.display = '';
    if (membersList) membersList.innerHTML = '';
    if (roomDisplay) roomDisplay.textContent = '-';

    const status = document.getElementById('status');
    if (status) status.textContent = 'Not in a room';
}

function leaveRoom() {
    // Hang up calls and clear peer connections
    hangup();
    // Clear room state
    roomId = null;
    roomMembers = [];
    // Update UI
    hideRoomUI();
}

function handleSignalMessage(signalData) {
    const { type, data, fromId, toId } = signalData;
    
    switch (type) {
        case "offer":
            handleOfferMessage({ fromId, data });
            break;
        case "answer":
            handleAnswerMessage({ fromId, data });
            break;
        case "ice":
            handleIceMessage({ fromId, data });
            break;
        default:
            console.log("⚠️ Unknown signal type:", type);
    }
}

function sendMessage(msgType, rtcType, data, toId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        let payload;
        
        if (msgType === "create_room") {
            payload = { type: "create_room",data:null };
        } else if (msgType === "get_room_details") {
            payload = { type: "get_room", data: roomId };
        } else if (msgType === "join_room") {
            payload = { type: "join_room", data: JSON.stringify(data) };
        } else if (msgType === "signal") {
            // Signal message format matching backend expectations
            const signalMessage = {
                type: rtcType,
                data: data,
                fromId: userId,
                toId: toId
            };
            payload = { type: "signal", data: JSON.stringify(signalMessage) };
        } else if(msgType === "leave_room"){
            payload = {type: msgType , data: roomId}
        }else {
            console.warn("Unknown message type:", msgType);
            return;
        }
        
        console.log("📤 Sending message:", payload);
        ws.send(JSON.stringify(payload));
    }
}

(async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        const localVideo = document.getElementById("localVideo");
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
        console.log("✅ Local media stream initialized");
    } catch (error) {
        console.error("❌ Error accessing media devices:", error);
    }
})();

function hangup() {
    // Close all peer connections
    Object.keys(peerConnections).forEach(peerId => {
        closePeerConnection(peerId);
    });
    console.log("📞 All calls ended");
}

function createRoomOnServer() {
    sendMessage("create_room");
}

function joinRoomOnServer() {
    const input = document.getElementById('roomIdInput');
    if (input && input.value) {
        roomId = input.value;
    }
    if (!roomId) {
        console.warn('No roomId provided to join');
        return;
    }
    sendMessage("get_room_details");
}

// Initialize WebSocket connection
connect();