let ws = null;
let pc = null;
let localStream = null;
let userId = null;

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

async function initializePeerConnection() {
    pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("📤 Sending ICE candidate:", event.candidate);
            const toId = document.getElementById("remoteUserId").value || "remote";
            sendMessage("ice", event.candidate, toId);
        } else {
            console.log("✅ ICE candidate gathering completed");
        }
    };

    // Handle remote track
    pc.ontrack = (event) => {
        console.log("📥 Remote track received:", event.track.kind);
        const remoteVideo = document.getElementById("remoteVideo");
        if (remoteVideo && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
    };

    // Add local stream tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }
}

async function createAndSendOffer() {
    const toId = prompt("Enter recipient user ID:");
    if (!toId) {
        console.log("Offer creation cancelled");
        return;
    }
    
    document.getElementById("remoteUserId").value = toId;
    await initializePeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("📤 Sending offer to:", toId);
    sendMessage("offer", offer, toId);
}

async function handleMessage(message) {
    try {
        if (message.type === "offer") {
            console.log("📩 Offer received from:", message.fromId);
            document.getElementById("remoteUserId").value = message.fromId;
            if (!pc) {
                await initializePeerConnection();
            }
            await pc.setRemoteDescription(new RTCSessionDescription(message.data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log("📤 Sending answer to:", message.fromId);
            sendMessage("answer", answer, message.fromId);

        } else if (message.type === "answer") {
            console.log("📩 Answer received");
            await pc.setRemoteDescription(new RTCSessionDescription(message.data));
        } else if (message.type === "ice") {
            console.log("📩 ICE candidate received");
            try {
                await pc.addIceCandidate(new RTCIceCandidate(message.data));
            } catch (e) {
                console.error("Error adding ICE candidate:", e);
            }
        } else if(message.type == "id"){
            userId = message.data;
            document.getElementById("userId").value = userId;
            console.log("📩 User ID received:", userId);
            updateStatus("Connected as: " + userId);
        }
    } catch (error) {
        console.error("Error handling message:", error);
    }
}

function sendMessage(type, data,toId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        let fromId = userId;
        ws.send(JSON.stringify({ type, data, fromId, toId }));
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
    if (pc) {
        pc.close();
        pc = null;
        console.log("📞 Call ended");
    }
    
    const remoteVideo = document.getElementById("remoteVideo");
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
}

function updateStatus(message) {
    const statusEl = document.getElementById("status");
    if (statusEl) {
        statusEl.textContent = message;
    }
}

function startRoom(){
    sendMessage("start_room",null,null);
} 

// Initialize WebSocket connection
connect();

