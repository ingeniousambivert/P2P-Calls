import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

app.use(cors());

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', (roomId: string) => {
        console.log(`${socket.id} joined room: ${roomId}`);
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', socket.id);
    });

    socket.on('offer', ({ roomId, offer }: { roomId: string; offer: RTCSessionDescriptionInit }) => {
        socket.to(roomId).emit('offer', { offer, from: socket.id });
    });

    socket.on('answer', ({ roomId, answer }: { roomId: string; answer: RTCSessionDescriptionInit }) => {
        socket.to(roomId).emit('answer', { answer, from: socket.id });
    });

    socket.on('ice-candidate', ({ roomId, candidate }: { roomId: string; candidate: RTCIceCandidateInit }) => {
        socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        socket.broadcast.emit('user-disconnected', socket.id);
    });
});

const PORT = 4000;
httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
