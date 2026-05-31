const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const PORT = process.env.PORT || 5000;
const wss = new WebSocketServer({ port: PORT });

let rooms = {}; 

console.log(`Extreme Streaming Signaling Server running on port ${PORT}`);

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
                rooms[roomCode] = { director: ws, cameras: {}, ffmpeg: null };
                ws.roomCode = roomCode;
                ws.role = 'director';
                ws.send(JSON.stringify({ type: 'room_created', roomCode }));
                break;

            case 'join_room':
                let targetRoom = rooms[data.roomCode];
                if (!targetRoom) {
                    ws.send(JSON.stringify({ type: 'error', message: 'ভুল সিক্রেট কোড!' }));
                    return;
                }
                let camCount = Object.keys(targetRoom.cameras).length;
                if (camCount >= 4) {
                    ws.send(JSON.stringify({ type: 'error', message: 'রুম ফুল!' }));
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

            // 🚀 ইউটিউব / ফেসবুক লাইভ স্ট্রিমিং ইঞ্জিন ট্রিগার লজিক
            case 'start_rtmp_stream':
                let room = rooms[ws.roomCode];
                if (room && !room.ffmpeg) {
                    const destination = `${data.streamUrl}/${data.streamKey}`;
                    console.log(`Starting FFmpeg RTMP Push out to: ${destination}`);

                    // FFmpeg এর মাধ্যমে ভিডিও প্রসেসিং এবং সোশ্যাল মিডিয়ায় লাইভ পুশ
                    room.ffmpeg = spawn('ffmpeg', [
                        '-i', '-', // ইনপুট হিসেবে আমরা ডিরেক্টর প্যানেলের লাইভ ক্যানভাস ডেটা রিয়েল-টাইমে নেব
                        '-vcodec', 'libx264', '-preset', 'veryfast', 
                        '-tune', 'zerolatency', '-b:v', '2500k', '-maxrate', '2500k', 
                        '-bufsize', '5000k', '-pix_fmt', 'yuv420p', '-g', '60',
                        '-acodec', 'aac', '-b:a', '128k', '-ar', '44100',
                        '-f', 'flv', destination
                    ]);

                    room.ffmpeg.stderr.on('data', (data) => {
                        console.log(`FFmpeg Log: ${data.toString()}`);
                    });
                }
                break;

            // লাইভ স্ট্রিম থেকে আসা কাঁচা ভিডিও ফ্রেমের বাইনারি ডেটা FFmpeg-এ ইনজেক্ট করা
            case 'binary_frame':
                let targetRoomStream = rooms[ws.roomCode];
                if (targetRoomStream && targetRoomStream.ffmpeg) {
                    // ফ্রন্টএন্ড থেকে আসা লাইভ ভিডিওর বাফার ডেটা সরাসরি FFmpeg পাইপলাইনে পুশ হচ্ছে
                    targetRoomStream.ffmpeg.stdin.write(Buffer.from(data.frame, 'base64'));
                }
                break;

            case 'stop_rtmp_stream':
                let activeRoom = rooms[ws.roomCode];
                if (activeRoom && activeRoom.ffmpeg) {
                    activeRoom.ffmpeg.stdin.end();
                    activeRoom.ffmpeg.kill('SIGINT');
                    activeRoom.ffmpeg = null;
                    console.log("RTMP Streaming Stopped gracefully.");
                }
                break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
                let currentRoom = rooms[ws.roomCode];
                if (!currentRoom) return;
                if (ws.role === 'camera') {
                    if (currentRoom.director && currentRoom.director.readyState === 1) {
                        data.cameraId = ws.cameraId; currentRoom.director.send(JSON.stringify(data));
                    }
                } else if (ws.role === 'director') {
                    let targetCam = currentRoom.cameras[data.targetId];
                    if (targetCam && targetCam.readyState === 1) currentRoom.cameras[data.targetId].send(JSON.stringify(data));
                }
                break;
        }
    });

    ws.on('close', () => {
        let currentRoom = rooms[ws.roomCode];
        if (!currentRoom) return;
        if (ws.role === 'director') {
            if (currentRoom.ffmpeg) { currentRoom.ffmpeg.kill('SIGINT'); }
            Object.values(currentRoom.cameras).forEach(cam => cam.close());
            delete rooms[ws.roomCode];
        } else if (ws.role === 'camera') {
            delete currentRoom.cameras[ws.cameraId];
            if (currentRoom.director && currentRoom.director.readyState === 1) {
                currentRoom.director.send(JSON.stringify({ type: 'disconnect', cameraId: ws.cameraId }));
            }
        }
    });
});
