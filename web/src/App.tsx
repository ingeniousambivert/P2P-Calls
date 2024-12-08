import React, { useState, useRef, useEffect } from "react";
import io, { Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:4000";

type Message = {
  type:
    | "offer"
    | "answer"
    | "candidate"
    | "ping"
    | "registerPeer"
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
  error?: string;
};

const config: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const getFromStorage = (key: string) => {
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
};

const setToStorage = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value));
  return { key, value };
};

const App: React.FC = () => {
  const userAgent = navigator.userAgent;
  // const peerId = getFromStorage("peerId");
  // const setPeerId = (value: string) => setToStorage("peerId", value);
  // const peerIdToConnect = getFromStorage("peerIdToConnect");
  // const setPeerIdToConnect = (value: string) =>
  //   setToStorage("peerIdToConnect", value);

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
    setPeerId(`user_${peerId}`);
  };

  const initializeConnection = () => {
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
  };

  const initializeMedia = () => {
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
  };

  const handleMessage = (message: Message) => {
    console.log("Received message:", message);

    switch (message.type) {
      case "ping":
        handlePing(message);
        break;
      case "registerPeer":
        handleRegisterPeer(message);
        break;
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
      case "leave":
        handleLeave();
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
  };

  const handleConnect = () => {
    console.log("Connected to signaling server", SOCKET_URL);
  };

  const handleRegisterPeer = (message?: Message) => {
    if (message) {
      if (message.error) {
        setError("Peer ID already registered");
      } else {
        initializeMedia();
        initializeConnection();
      }
    } else {
      if (!peerId) {
        setError("Peer ID cannot be empty.");
        return;
      }
      if (!connectionRef.current) {
        initializeConnection();
      }
      if (socketRef.current) {
        socketRef.current.emit("message", { type: "registerPeer", peerId });
      }
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
    connectionRef.current
      ?.createAnswer()
      .then((answer) => {
        connectionRef.current?.setLocalDescription(answer);
        socketRef.current?.emit("message", {
          type: "answer",
          answer,
          from: peerId,
          to: message.from,
        });
      })
      .catch((error) => {
        setError(`Error when creating an answer. ${error}`);
      });
    console.log({
      peerId,
      from: message.from,
      type: "answer",
      offer: connectionRef.current?.localDescription,
    });
  };

  const handleAnswer = (message: Message) => {
    if (message.answer && connectionRef.current) {
      connectionRef.current
        .setRemoteDescription(new RTCSessionDescription(message.answer))
        .catch((error) => {
          setError(`Error when set remote description. ${error}`);
        });
    }
  };

  const handleCandidate = (message: Message) => {
    if (message.candidate && connectionRef.current) {
      connectionRef.current
        .addIceCandidate(new RTCIceCandidate(message.candidate))
        .catch((error) => {
          setError(`Error when add ice candidate. ${error}`);
        });
    }
  };

  const handleOfferCreate = (message: Message) => {
    if (!connectionRef.current) {
      initializeConnection();
    }
    connectionRef.current
      ?.createOffer()
      .then((offer) => {
        connectionRef.current?.setLocalDescription(offer);
        if (socketRef.current && peerIdToConnect) {
          socketRef.current.emit("message", {
            type: "offer",
            offer,
            to: peerIdToConnect,
            from: peerId,
          });
        } else {
          setError("Peer ID to connect not found - handleOfferCreate");
        }
      })
      .catch((error) => {
        setError(`Error when creating an offer. ${error}`);
      });
    console.log({
      peerId,
      peerIdToConnect,
      type: "offer",
      offer: connectionRef.current?.localDescription,
    });
  };

  const handleOfferAccept = (message: Message) => {
    if (!peerId || !peerIdToConnect) {
      setError("Peer ID/s not set - handleOfferAccept");
      return;
    }

    if (socketRef.current) {
      socketRef.current.emit("message", {
        type: "offerCreate",
        from: peerId,
        to: peerIdToConnect,
        offer: connectionRef.current?.localDescription,
      });
    } else {
      setError("Socket connection is not established.");
    }

    console.log({
      peerId,
      peerIdToConnect,
      type: "offerCreate",
      offer: connectionRef.current?.localDescription,
    });
  };

  const handleCall = () => {
    if (!peerId || !peerIdToConnect) {
      setError("Both Peer ID and Peer ID to connect must be set.");
      return;
    }

    if (peerIdToConnect === peerId) {
      setError("You cannot call yourself.");
      return;
    }

    if (socketRef.current) {
      socketRef.current.emit("message", {
        type: "offerAccept",
        from: peerId,
        to: peerIdToConnect,
      });
    } else {
      setError("Socket connection is not established.");
    }

    console.log({
      peerId,
      peerIdToConnect,
      type: "offerAccept",
    });
  };

  const handleHangUp = () => {
    console.log("Leaving connection");
    if (socketRef.current) {
      socketRef.current.emit("message", {
        type: "leave",
      });
    }
    handleLeave();
  };

  const handleNotFound = (message: Message) => {
    setError(`User ${message.from}/${message.to} not found.`);
  };

  const handleError = (message: Message) => {
    setError(message?.message || "An error occurred.");
  };

  const handleLeave = () => {
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      (localVideoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
      localVideoRef.current = null;
    }

    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      (remoteVideoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current = null;
    }

    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }
  };

  const handlePing = (message: Message) => {
    console.log("Ping received", message);
    socketRef.current?.emit("message", {
      type: "pong",
      message: "Hello Server!",
      agent: userAgent,
    });
  };

  useEffect(() => {
    const socketConnection = io(SOCKET_URL);
    socketRef.current = socketConnection;
    initializeMedia();
    initializeConnection();
    socketConnection.on("connect", handleConnect);
    socketConnection.on("message", handleMessage);
    socketConnection.on("error", handleError);

    return () => {
      socketConnection.close();
    };
  }, []);

  useEffect(() => {
    console.log("peerId updated:", peerId);
  }, [peerId]);

  useEffect(() => {
    console.log("peerIdToConnect updated:", peerIdToConnect);
  }, [peerIdToConnect]);

  return (
    <div>
      <button onClick={generatePeerId}>Generate Peer ID</button>
      <input
        type="text"
        value={peerId}
        onChange={(e) => setPeerId(e.target.value)}
        placeholder="Enter Peer ID"
      />
      <button onClick={() => handleRegisterPeer()}>Register Peer ID</button>

      <input
        type="text"
        value={peerIdToConnect}
        onChange={(e) => setPeerIdToConnect(e.target.value)}
        placeholder="Enter Peer ID to Connect"
      />

      <button onClick={() => handleCall()}>Connect</button>

      <div>
        <p>Local Peer ID: {peerId}</p>
      </div>
      <div>
        <p>Remote Peer ID: {peerIdToConnect}</p>
      </div>

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
