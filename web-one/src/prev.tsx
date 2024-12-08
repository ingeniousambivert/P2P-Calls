import React, { useState, useRef, useEffect } from "react";
import io, { Socket } from "socket.io-client";

type Message = {
  type: "offer" | "answer" | "candidate" | "ping";
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  from?: string;
  to?: string;
};

const config: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const App: React.FC = () => {
  const [peerId, setPeerId] = useState<string>("");
  const [peerIdToConnect, setPeerIdToConnect] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connection, setConnection] = useState<RTCPeerConnection | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const generatePeerId = () => {
    const peerId = Math.random().toString(36).substring(2, 15);
    setPeerId(`one_${peerId}`);
  };

  useEffect(() => {
    // Initialize socket connection
    const socketConnection = io("http://localhost:4000");
    setSocket(socketConnection);

    // Handle WebSocket messages
    socketConnection.on("message", (message: Message) => {
      switch (message.type) {
        case "offer":
          handleOffer(message);
          break;
        case "answer":
          handleAnswer(message);
          break;
        case "candidate":
          handleCandidate(message);
          break;
        case "ping":
          console.log("Ping received", message);
          break;
        default:
          console.log("Unknown message type:", message.type);
      }
    });

    return () => {
      socketConnection.close();
    };
  }, []);

  const handleSetPeerId = () => {
    if (!peerId) {
      setError("Peer ID cannot be empty.");
      return;
    }
    setError(null);
    socket?.emit("message", { type: "setPeerId", peerId });
  };

  const handleConnectToPeer = () => {
    if (!peerIdToConnect) {
      setError("Peer ID to connect cannot be empty.");
      return;
    }
    setError(null);
    createOffer();
  };

  const createOffer = async () => {
    if (!stream) return;

    const peerConnection = new RTCPeerConnection(config);
    setConnection(peerConnection);

    // Add tracks from local stream
    stream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, stream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("message", {
          type: "candidate",
          candidate: event.candidate,
          to: peerIdToConnect,
        });
      }
    };

    peerConnection.ontrack = (event) => {
      console.log("Remote track received:", event.streams);
      if (event.streams && event.streams[0] && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch((error) => {
          console.error("Failed to play remote video:", error);
        });
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket?.emit("message", {
      type: "offer",
      offer,
      to: peerIdToConnect,
    });
  };

  const handleOffer = async (message: Message) => {
    if (!message.offer || !stream) return;

    const peerConnection = new RTCPeerConnection(config);
    setConnection(peerConnection);

    stream.getTracks().forEach((track) => {
      console.log("Adding track:", track);
      peerConnection.addTrack(track, stream);
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("message", {
          type: "candidate",
          candidate: event.candidate,
          to: message.from,
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", peerConnection.connectionState);
    };

    peerConnection.ontrack = (event) => {
      console.log("Remote track received:", event.streams);
      if (event.streams && event.streams[0] && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch((error) => {
          console.error("Failed to play remote video:", error);
        });
      }
    };

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message.offer)
    );
    console.log("Remote description set:", peerConnection.signalingState);

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket?.emit("message", {
      type: "answer",
      answer,
      to: message.from,
    });
  };

  const handleAnswer = async (message: Message) => {
    if (connection && message.answer) {
      await connection.setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
    }
  };

  const handleCandidate = async (message: Message) => {
    if (connection && message.candidate) {
      await connection.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  };

  useEffect(() => {
    // Access local media
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
        }
        setStream(mediaStream);
      })
      .catch(() => setError("Failed to access camera and microphone."));
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 30,
      }}
    >
      <h1>P2P Video Call</h1>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <input
          type="text"
          placeholder="Enter your Peer ID"
          value={peerId}
          onChange={(e) => setPeerId(e.target.value)}
        />
        <button onClick={handleSetPeerId}>Set Peer ID</button>
        <button onClick={generatePeerId}>Generate Peer ID</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <input
          type="text"
          placeholder="Enter Peer ID to connect"
          value={peerIdToConnect}
          onChange={(e) => setPeerIdToConnect(e.target.value)}
        />
        <button onClick={handleConnectToPeer}>Connect to Peer</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          style={{ width: "45%", border: "1px solid black" }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          style={{ width: "45%", border: "1px solid black" }}
        />
      </div>
    </div>
  );
};

export default App;
