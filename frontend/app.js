let ws = null;
let localStream = null;
let userId = null;
let roomId = null;
let roomMembers = [];
let peerConnections = {}; // Store PC for each peer

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
            await peerConnections[peerId].addIceCandidate(new RTCIceCandidate(message.data));
        } catch (e) {
            console.error(`Error adding ICE candidate for ${peerId}:`, e);
        }
    }
}

function createRemoteVideoElement(peerId) {
    const container = document.getElementById("remoteVideosContainer");
    
    // Check if element already exists
    if (document.getElementById(`videoBox-${peerId}`)) {
        return;
    }
    
    // Create video box wrapper
    const videoBox = document.createElement("div");
    videoBox.className = "video-box";
    videoBox.id = `videoBox-${peerId}`;
    
    // Create label
    const label = document.createElement("div");
    label.className = "video-label";
    label.textContent = `Peer: ${peerId}`;
    
    // Create video element
    const video = document.createElement("video");
    video.id = `remoteVideo-${peerId}`;
    video.autoplay = true;
    video.playsinline = true;
    
    // Append to structure
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

function handleRoomMembersMessage(message) {
    roomMembers = message.mems;
    console.log("📩 Room members received:", roomMembers);
    
    // Create peer connections for new members
    roomMembers.forEach(memberId => {
        if (memberId !== userId && !peerConnections[memberId]) {
            createRemoteVideoElement(memberId);
            createOfferForPeer(memberId);
        }
    });
}

function sendMessage(msgType,rtc_type, data, toId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        let fromId = userId;
        if(msgType==="get_room_details"){
            ws.send(JSON.stringify({ type: msgType, data: {roomId} }));
        }else{
            ws.send(JSON.stringify({ type: msgType, data: { type: rtc_type, data, fromId, toId } }));
        }
        
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

// Initialize WebSocket connection
connect();

