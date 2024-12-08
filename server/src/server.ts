import express from 'express';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

type OfferData = { from: string; to: string; type: string };
type SignalingData = { type: string; to: string; [key: string]: any };

// Map to store connected peers
const peers: Map<string, Socket> = new Map(); // {peerId: socketObject}

const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], // STUN server for WebRTC
};

// Create Express application
const app = express();

// Server configurations
const domain: string = process.env.DOMAIN || 'localhost';
const port: number = Number(process.env.PORT) || 4000;

// Middleware to enable CORS and parse JSON
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Create Socket.IO instance attached to the Express app
const io: Server = new Server(
    app.listen(port, () => {
        console.log(`Server running at http://${domain}:${port}`);
        console.log('ICE Servers:', config.iceServers);
    }),
    { cors: { origin: process.env.CORS_ORIGIN || '*' } },
);

// Handle WebSocket connections
io.on('connection', handleConnection);

// Function to handle individual WebSocket connections
function handleConnection(socket: Socket): void {
    console.log(`[${new Date().toISOString()}] Peer connected: ${socket.id}`);

    // Send a ping message to the newly connected client
    sendPing(socket);

    // Set socket data to store peerId
    socket.on('message', handleMessage);
    socket.on('disconnect', handleClose);

    // Function to handle incoming messages
    function handleMessage(data: any): void {
        const { type } = data;
        const peerId = socket.data.peerId;

        console.log(`[${new Date().toISOString()}] Received message of type '${type}' from ${peerId ?? socket.id}`);

        switch (type) {
            case 'setPeerId':
                handleSetPeerId(data);
                break;
            case 'offerAccept':
            case 'offerDecline':
            case 'offerCreate':
                handleOffer(data);
                break;
            case 'offer':
            case 'answer':
            case 'candidate':
            case 'leave':
                handleSignalingMessage(data);
                break;
            case 'pong':
                console.log(`[${new Date().toISOString()}] Client response: ${data.message}`);
                break;
            default:
                sendError(socket, `Unknown command: ${type}`);
                break;
        }
    }

    // Send a ping message to the newly connected client and iceServers for peer connection
    function sendPing(socket: Socket): void {
        console.log(`[${new Date().toISOString()}] Sending 'ping' message to ${socket.id}`);
        sendMsgTo(socket, {
            type: 'ping',
            message: 'Hello Client!',
            iceServers: config.iceServers,
        });
    }

    // Function to handle peer sign-in request
    function handleSetPeerId(data: { peerId: string }): void {
        const { peerId } = data;

        if (!peers.has(peerId)) {
            peers.set(peerId, socket); // Store the entire socket object
            socket.data.peerId = peerId; // Store peerId in socket data
            console.log(`[${new Date().toISOString()}] Peer set successfully: ${peerId}`);
            sendMsgTo(socket, { type: 'setPeerId', success: true });
            console.log(`[${new Date().toISOString()}] Connected Peers:`, getConnectedPeers());
        } else {
            console.log(`[${new Date().toISOString()}] Failed, peerId already in use: ${peerId}`);
            sendMsgTo(socket, { type: 'setPeerId', success: false, message: 'PeerId already in use' });
        }
    }

    // Function to handle offer requests
    function handleOffer(data: OfferData): void {
        const { from, to, type } = data;
        const senderSocket = peers.get(from)?.id;
        const recipientSocket = peers.get(to);

        console.log(`[${new Date().toISOString()}] Processing offer for recipient: ${to}`);

        switch (type) {
            case 'offerAccept':
            case 'offerCreate':
                if (recipientSocket) {
                    console.log(`[${new Date().toISOString()}] Sending offer data to ${to}`);
                    sendMsgTo(recipientSocket, data);
                } else {
                    console.warn(`[${new Date().toISOString()}] Recipient ${to} not found`);
                    sendMsgTo(socket, { type: 'notfound', peerId: to });
                }
                break;
            case 'offerDecline':
                console.warn(`[${new Date().toISOString()}] Peer ${from} declined the offer`);
                if (recipientSocket) {
                    sendError(recipientSocket, `Peer ${from} declined your call`);
                } else {
                    sendError(socket, `Recipient ${to} not found`);
                }
                break;
            default:
                console.warn(`[${new Date().toISOString()}] Unknown offer type: ${type}`);
                break;
        }
    }

    // Function to handle signaling messages (offer, answer, candidate, leave)
    function handleSignalingMessage(data: SignalingData): void {
        const { type, to } = data;
        const peerId = socket.data.peerId;
        const recipientSocket = peers.get(to);

        switch (type) {
            case 'leave':
                if (recipientSocket) {
                    console.log(`[${new Date().toISOString()}] Peer left: ${peerId}`);
                    sendMsgTo(recipientSocket, { type: 'leave' });
                }
                break;
            default:
                if (recipientSocket) {
                    console.log(`[${new Date().toISOString()}] Forwarding signaling message to ${to}`);
                    sendMsgTo(recipientSocket, { ...data, from: peerId });
                }
                break;
        }
    }

    // Function to handle the closing of a connection
    function handleClose(): void {
        const peerId = socket.data.peerId;

        if (peerId) {
            console.log(`[${new Date().toISOString()}] Peer disconnected: ${peerId}`);
            peers.delete(peerId);
            console.log(`[${new Date().toISOString()}] Connected Peers after disconnect:`, getConnectedPeers());
        }
    }
}

// Function to get all connected peers
function getConnectedPeers(): string[] {
    return Array.from(peers.keys());
}

// Function to send a message to a specific connection
function sendMsgTo(socket: Socket, message: { type: string; [key: string]: any }): void {
    console.log(`[${new Date().toISOString()}] Sending message:`, message.type);
    socket.emit('message', message);
}

// Function to send an error message to a specific connection
function sendError(socket: Socket, message: string): void {
    console.error(`[${new Date().toISOString()}] Error: ${message}`);
    sendMsgTo(socket, { type: 'error', message });
}
