const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 5000;
const wss = new WebSocketServer({ port: PORT });

let rooms = {}; 

console.log(`Director-Mode Signaling Server running on port ${PORT}`);

function generateRoomCode() {
    return 'CBP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }

        switch (data.type) {
            case 'create_room':
                let roomCode = generateRoomCode();
                rooms[roomCode] = { director: ws, cameras: {} };
                ws.roomCode = roomCode;
                ws.role = 'director';
                ws.send(JSON.stringify({ type: 'room_created', roomCode }));
                console.log(`Director Room Created: ${roomCode}`);
                break;

            case 'join_room':
                let targetRoom = rooms[data.roomCode];
                if (!targetRoom) {
                    ws.send(JSON.stringify({ type: 'error', message: 'ভুল সিক্রেট কোড! আবার চেষ্টা করো।' }));
                    return;
                }
                
                let camCount = Object.keys(targetRoom.cameras).length;
                if (camCount >= 4) {
                    ws.send(JSON.stringify({ type: 'error', message: 'এই রুমে সর্বোচ্চ ৪টি ক্যামেরা যুক্ত আছে!' }));
                    return;
                }

                let assignedCamId = `cam${camCount + 1}`;
                ws.roomCode = data.roomCode;
                ws.cameraId = assignedCamId;
                ws.role = 'camera';
                
                targetRoom.cameras[assignedCamId] = ws;
                ws.send(JSON.stringify({ type: 'joined_successfully', cameraId: assignedCamId }));

                if (targetRoom.director && targetRoom.director.readyState === 1) {
                    targetRoom.director.send(JSON.stringify({ type: 'camera_joined', cameraId: assignedCamId }));
                }
                break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
                let currentRoom = rooms[ws.roomCode];
                if (!currentRoom) return;

                if (ws.role === 'camera') {
                    if (currentRoom.director && currentRoom.director.readyState === 1) {
                        data.cameraId = ws.cameraId;
                        currentRoom.director.send(JSON.stringify(data));
                    }
                } else if (ws.role === 'director') {
                    let targetCam = currentRoom.cameras[data.targetId];
                    if (targetCam && targetCam.readyState === 1) {
                        currentRoom.cameras[data.targetId].send(JSON.stringify(data));
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        let currentRoom = rooms[ws.roomCode];
        if (!currentRoom) return;

        if (ws.role === 'director') {
            Object.values(currentRoom.cameras).forEach(cam => {
                cam.send(JSON.stringify({ type: 'error', message: 'ডিরেক্টর প্যানেল বন্ধ হয়ে গেছে।' }));
                cam.close();
            });
            delete rooms[ws.roomCode];
            console.log(`Director Room Deleted: ${ws.roomCode}`);
        } else if (ws.role === 'camera') {
            delete currentRoom.cameras[ws.cameraId];
            if (currentRoom.director && currentRoom.director.readyState === 1) {
                currentRoom.director.send(JSON.stringify({ type: 'disconnect', cameraId: ws.cameraId }));
            }
        }
    });
});
