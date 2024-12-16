import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
    }),
);
app.use(express.json());

// Initialize Socket.IO
const io = new Server({
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
    },
});

// Map to track users and their rooms
const occupancies = new Map<string, string>();

// Attach Socket.IO to the server
app.get('/', (req, res) => {
    res.send('Socket.IO server is running!');
});

io.attach(
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    }),
);

// Socket.IO events
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle room joining
    socket.on('join-room', (roomId: string) => {
        if (!roomId || typeof roomId !== 'string') {
            console.error(`Invalid roomId received from ${socket.id}`);
            return;
        }

        // Store user and room mapping
        occupancies.set(socket.id, roomId);
        console.log({ occupancies: Array.from(occupancies.entries()) });

        // Join the room and notify others
        console.log(`${socket.id} joined room: ${roomId}`);
        socket.join(roomId);
        io.to(roomId).emit('user-connected', { userId: socket.id, roomId: roomId });
    });

    // Handle offer event
    socket.on('offer', (data: { roomId: string; offer: RTCSessionDescriptionInit }) => {
        if (!data?.roomId || !data?.offer) {
            console.error(`Invalid offer payload received from ${socket.id}`);
            return;
        }

        const { roomId, offer } = data;
        socket.to(roomId).emit('offer', { offer, from: socket.id });
    });

    // Handle answer event
    socket.on('answer', (data: { roomId: string; answer: RTCSessionDescriptionInit }) => {
        if (!data?.roomId || !data?.answer) {
            console.error(`Invalid answer payload received from ${socket.id}`);
            return;
        }

        const { roomId, answer } = data;
        socket.to(roomId).emit('answer', { answer, from: socket.id });
    });

    // Handle ICE candidate event
    socket.on('ice-candidate', (data: { roomId: string; candidate: RTCIceCandidateInit }) => {
        if (!data?.roomId || !data?.candidate) {
            console.error(`Invalid ICE candidate payload received from ${socket.id}`);
            return;
        }

        const { roomId, candidate } = data;
        socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const roomId = occupancies.get(socket.id);
        if (roomId) {
            // Remove the user from the tracking map
            occupancies.delete(socket.id);

            // Emit user-disconnected event
            io.to(roomId).emit('user-disconnected', { userId: socket.id, roomId: roomId });
            console.log(`User disconnected: ${socket.id}`);
            console.log({ occupancies: Array.from(occupancies.entries()) });
        } else {
            console.log(`User disconnected without a room: ${socket.id}`);
        }
    });
});
