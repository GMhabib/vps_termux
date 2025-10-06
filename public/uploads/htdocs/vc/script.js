// Konfigurasi awal
const MAX_PARTICIPANTS = 10;
const setupArea = document.getElementById('setup-area');
const callArea = document.getElementById('call-area');
const usernameInput = document.getElementById('username-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomIdInput = document.getElementById('room-id-input');
const roomInfo = document.getElementById('room-info');
const shareLinkInput = document.getElementById('share-link-input');
const copyLinkBtn = document.getElementById('copy-link-btn');
const whatsappShare = document.getElementById('whatsapp-share');
const telegramShare = document.getElementById('telegram-share');

const videoGrid = document.getElementById('video-grid');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const videoTemplate = document.getElementById('video-template');

let localStream;
let myPeer;
let myPeerId;
let username = "VGC team ";
let currentRoomId; // Ini akan menjadi ID Host
let isHost = false; // Flag untuk menandai apakah kita adalah host

// Menyimpan koneksi (data & media) ke peer lain
const connections = {}; // { peerId: { mediaConn: mediaConnection, dataConn: dataConnection } }


// --- (Fungsi notifikasi dan UI tidak berubah) ---

function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('Izin notifikasi diberikan.');
                }
            });
        }
    }
}

function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        if (document.hidden) { new Notification(title, { body }); }
    }
}

function addVideoStream(stream, peerUsername, peerId) {
    if (document.getElementById(`video-${peerId}`)) return;
    const template = videoTemplate.content.cloneNode(true);
    const videoContainer = template.querySelector('.video-container');
    videoContainer.id = `video-${peerId}`;
    const video = template.querySelector('video');
    const label = template.querySelector('.video-label');
    video.srcObject = stream;
    label.textContent = peerUsername;
    videoGrid.append(template);
}

function addChatMessage(sender, message, isSelf = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    if (isSelf) {
        messageElement.innerHTML = `<span class="sender" style="color: #99aab5;">Anda:</span> ${message}`;
    } else {
        messageElement.innerHTML = `<span class="sender">${sender}:</span> ${message}`;
    }
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}


// --- (MODIFIKASI UTAMA DIMULAI DARI SINI) ---

// Inisialisasi koneksi PeerJS
function initializePeer() {
    // Jika kita membuat room, ID kita akan jadi ID room. Jika bergabung, kita akan generate ID acak.
    myPeer = isHost ? new Peer() : new Peer();

    myPeer.on('open', id => {
        myPeerId = id;
        console.log('My peer ID is: ' + id);
        if (isHost) {
            currentRoomId = id; // Host menetapkan ID room
        }
        setupCallArea();
        joinRoom();
    });

    // BARU: Penanganan error koneksi yang lebih spesifik
    myPeer.on('error', err => {
        console.error('PeerJS error:', err);
        // Cek jika error terjadi karena host/peer tidak tersedia
        if (err.type === 'peer-unavailable') {
            alert('Koneksi gagal. Host mungkin sedang offline atau ID Room salah. Mohon coba lagi.');
            // Kembalikan ke halaman setup
            callArea.classList.add('hidden');
            setupArea.classList.remove('hidden');
        } else {
            alert('Terjadi kesalahan koneksi yang tidak diketahui.');
        }
    });
}

// Setup area panggilan setelah mendapatkan ID
function setupCallArea() {
    setupArea.classList.add('hidden');
    callArea.classList.remove('hidden');
    roomInfo.textContent = `Anda di Room: ${currentRoomId}`;
    
    const shareLink = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    shareLinkInput.value = shareLink;

    const shareText = `Gabung panggilan video dengan saya! Klik link ini: ${shareLink}`;
    whatsappShare.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    telegramShare.href = `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent("Gabung panggilan video dengan saya!")}`;
}

async function joinRoom() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        addVideoStream(localStream, `${username} (Anda)`, myPeerId);
        
        // Listener untuk panggilan masuk
        myPeer.on('call', call => {
            if (Object.keys(connections).length >= MAX_PARTICIPANTS) {
                console.log(`Menolak panggilan dari ${call.peer}, room penuh.`);
                return;
            }
            call.answer(localStream);
            call.on('stream', remoteStream => {
                const metadata = call.metadata;
                addVideoStream(remoteStream, metadata.username, call.peer);
            });
            call.on('close', () => removePeer(call.peer));
            connections[call.peer] = { ...connections[call.peer], mediaConn: call };
        });

        // Listener untuk koneksi data masuk
        myPeer.on('connection', conn => {
            setupDataConnection(conn);
        });

        // MODIFIKASI: Client hanya terhubung ke host pada awalnya
        if (!isHost) {
            connectToPeer(currentRoomId);
        }

    } catch (err) {
        console.error('Failed to get local stream', err);
        alert('Tidak bisa mengakses kamera/mikrofon. Pastikan Anda memberikan izin.');
    }
}

function connectToPeer(peerId) {
    if (connections[peerId]) return; // Jangan hubungi peer yang sudah terhubung

    console.log(`Menghubungi peer: ${peerId}`);
    const call = myPeer.call(peerId, localStream, { metadata: { username } });
    const dataConn = myPeer.connect(peerId, { metadata: { username } });

    call.on('stream', remoteStream => {
        const metadata = call.metadata;
        addVideoStream(remoteStream, metadata.username, peerId);
    });
    
    call.on('close', () => removePeer(peerId));
    
    connections[peerId] = { mediaConn: call };
    setupDataConnection(dataConn);
}

function setupDataConnection(conn) {
    conn.on('open', () => {
        console.log(`Koneksi data dengan ${conn.peer} (${conn.metadata.username}) terbuka.`);
        connections[conn.peer] = { ...connections[conn.peer], dataConn: conn };
        
        // BARU: Logika untuk host memperkenalkan peer ke pendatang baru
        if (isHost) {
            // 1. Kirim daftar semua partisipan yang sudah ada ke pendatang baru
            const existingPeers = Object.keys(connections).filter(id => id !== conn.peer);
            conn.send({ type: 'peer-list', peers: existingPeers });

            // 2. Beri tahu semua partisipan lama tentang pendatang baru
            for (const peerId in connections) {
                if (peerId !== myPeerId && peerId !== conn.peer) {
                    connections[peerId].dataConn.send({ type: 'new-peer', peerId: conn.peer });
                }
            }
        }
    });

    conn.on('data', data => {
        handleData(conn.peer, data);
    });

    conn.on('close', () => removePeer(conn.peer));
    conn.on('error', () => removePeer(conn.peer));
}

// MODIFIKASI: handleData sekarang menangani perkenalan peer
function handleData(fromPeerId, data) {
    const senderUsername = connections[fromPeerId]?.dataConn.metadata.username || 'Unknown';
    switch(data.type) {
        case 'chat':
            addChatMessage(senderUsername, data.message);
            showNotification(`Pesan dari ${senderUsername}`, data.message);
            break;
        // Client menerima daftar peer dari Host
        case 'peer-list':
            data.peers.forEach(peerId => connectToPeer(peerId));
            break;
        // Client lama menerima info ada peer baru dari Host
        case 'new-peer':
            connectToPeer(data.peerId);
            break;
    }
}

function removePeer(peerId) {
    // BARU: Jika host terputus, semua client harus disconnect
    if(peerId === currentRoomId) {
        alert("Host telah meninggalkan panggilan. Panggilan berakhir.");
        window.location.reload(); // Reload halaman untuk kembali ke awal
        return;
    }

    console.log(`Peer ${peerId} terputus.`);
    if (connections[peerId]) {
        connections[peerId].mediaConn?.close();
        connections[peerId].dataConn?.close();
        delete connections[peerId];
    }
    const videoElement = document.getElementById(`video-${peerId}`);
    if (videoElement) {
        videoElement.remove();
    }
}

function sendChatMessage() {
    const message = chatInput.value;
    if (message.trim() === '') return;
    addChatMessage(username, message, true);
    for (const peerId in connections) {
        connections[peerId].dataConn?.send({ type: 'chat', message: message });
    }
    chatInput.value = '';
}

// Event Listeners (MODIFIKASI)
createRoomBtn.addEventListener('click', () => {
    username = usernameInput.value.trim() || `VGC team ${Math.floor(Math.random() * 1000)}`;
    isHost = true; // Menandai kita sebagai host
    initializePeer();
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('Silakan masukkan ID Room.');
        return;
    }
    username = usernameInput.value.trim() || `VGC team ${Math.floor(Math.random() * 1000)}`;
    isHost = false; // Menandai kita sebagai client
    currentRoomId = roomId;
    initializePeer();
});

sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

copyLinkBtn.addEventListener('click', () => {
    shareLinkInput.select();
    document.execCommand('copy');
    alert('Link berhasil disalin!');
});

window.addEventListener('load', () => {
    requestNotificationPermission();
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    if (roomIdFromUrl) {
        roomIdInput.value = roomIdFromUrl;
    }
});