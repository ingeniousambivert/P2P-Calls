import React, { useState, useRef, useEffect } from "react";
import io, { Socket } from "socket.io-client";

type Message = {
  type:
    | "offer"
    | "answer"
    | "candidate"
    | "ping"
    | "offerAccept"
    | "offerDecline"
    | "offerCreate"
    | "leave"
    | "notfound"
    | "error";
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  from?: string;
  to?: string;
  message?: string;
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

  // Using useRef for socket and connection
  const socketRef = useRef<Socket | null>(null);
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const generatePeerId = () => {
    const peerId = Math.random().toString(36).substring(2, 15);
    setPeerId(`one_${peerId}`);
  };

  function initializeConnection() {
    connectionRef.current = new RTCPeerConnection(config);
    if (stream) {
      stream
        .getTracks()
        .forEach((track) => connectionRef.current?.addTrack(track, stream));
    }

    connectionRef.current.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
          remoteVideoRef.current.playsInline = true;
          remoteVideoRef.current.autoplay = true;
          remoteVideoRef.current.controls = false;
        }
      } else {
        console.error("No stream available in the ontrack event.");
      }
    };

    connectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("message", {
          type: "candidate",
          candidate: event.candidate,
        });
      }
    };

    connectionRef.current.onconnectionstatechange = (event) => {
      console.log(
        "Connection state change:",
        connectionRef.current?.connectionState
      );
    };

    connectionRef.current.oniceconnectionstatechange = (event) => {
      console.log(
        "ICE connection state change:",
        connectionRef.current?.iceConnectionState
      );
    };
  }

  useEffect(() => {
    const socketConnection = io("http://localhost:4000");
    socketRef.current = socketConnection;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        setStream(mediaStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
          localVideoRef.current.playsInline = true;
          localVideoRef.current.autoplay = true;
          localVideoRef.current.muted = true;
          localVideoRef.current.volume = 0;
          localVideoRef.current.controls = false;
        }
      })
      .catch((err) => {
        console.error("Error accessing media devices.", err);
        setError("Error accessing media devices.");
      });

    socketConnection.on("message", (message: Message) => {
      console.log("Received message:", message);

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
        case "offerCreate":
          handleOfferCreate(message);
          break;
        case "offerAccept":
          handleOfferAccept(message);
          break;
        case "offerDecline":
          handleOfferDecline(message);
          break;
        case "ping":
          handlePing(message);
          break;
        case "notfound":
          handleNotFound(message);
          break;
        case "error":
          handleError(message);
          break;
        default:
          console.log("Unhandled message type:", message.type);
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
    if (!connectionRef.current) {
      initializeConnection();
    }
    if (socketRef.current) {
      socketRef.current.emit("message", { type: "setPeerId", peerId });
    }
  };

  const handleOffer = (message: Message) => {
    console.log("Handling offer:", message);

    if (!message.offer || !stream) return;
    if (!connectionRef.current) {
      initializeConnection();
    }
    connectionRef.current?.setRemoteDescription(
      new RTCSessionDescription(message.offer)
    );
    connectionRef.current?.createAnswer().then((answer) => {
      connectionRef.current?.setLocalDescription(answer);
      socketRef.current?.emit("message", {
        type: "answer",
        answer,
        from: peerId,
        to: message.from,
      });
    });
  };

  const handleAnswer = (message: Message) => {
    if (message.answer && connectionRef.current) {
      connectionRef.current.setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
    }
  };

  const handleCandidate = (message: Message) => {
    if (message.candidate && connectionRef.current) {
      connectionRef.current.addIceCandidate(
        new RTCIceCandidate(message.candidate)
      );
    }
  };

  const handleOfferCreate = (message: Message) => {
    console.log("Offer Accepted by peer:", message.from);
    if (!connectionRef.current) {
      initializeConnection();
    }
    connectionRef.current?.createOffer().then((offer) => {
      connectionRef.current?.setLocalDescription(offer);
      socketRef.current?.emit("message", {
        type: "offer",
        offer,
        to: peerIdToConnect,
      });
    });
  };

  const handleOfferAccept = (message: Message) => {
    console.log("Offer Accepted by peer:", message.from);
    if (socketRef.current) {
      socketRef.current.emit("message", {
        type: "offerCreate",
        from: peerId,
        to: peerIdToConnect,
        offer: connectionRef.current?.localDescription,
      });
    }
  };

  const handleOfferDecline = (message: Message) => {
    console.log("Offer Declined by peer:", message.from);
  };

  const handleCreateOffer = () => {
    if (peerIdToConnect && socketRef.current) {
      socketRef.current.emit("message", {
        type: "offerCreate",
        from: peerId,
        to: peerIdToConnect,
        offer: connectionRef.current?.localDescription,
      });
    }
  };

  const handleNotFound = (message: Message) => {
    console.error(`User ${message.from} not found.`);
  };

  const handleError = (message: Message) => {
    setError(message.message || "An error occurred.");
  };

  const handlePing = (message: Message) => {
    console.log("Ping received", message);
    socketRef.current?.emit("message", {
      type: "pong",
      message: "Hello Server!",
    });
  };

  return (
    <div>
      <button onClick={generatePeerId}>Generate Peer ID</button>
      <input
        type="text"
        value={peerId}
        onChange={(e) => setPeerId(e.target.value)}
        placeholder="Enter Peer ID"
      />
      <button onClick={handleSetPeerId}>Set Peer ID</button>

      <input
        type="text"
        value={peerIdToConnect}
        onChange={(e) => setPeerIdToConnect(e.target.value)}
        placeholder="Enter Peer ID to Connect"
      />

      <button onClick={handleCreateOffer}>Create Offer</button>

      <div>{error && <p style={{ color: "red" }}>{error}</p>}</div>

      <div>
        <h3>Remote Video</h3>
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>
      <div>
        <h3>Local Video</h3>
        <video ref={localVideoRef} autoPlay muted playsInline />
      </div>
    </div>
  );
};

export default App;
