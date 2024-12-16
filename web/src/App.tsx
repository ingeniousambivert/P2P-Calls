import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const socket: Socket = io("http://localhost:4000");

const App: React.FC = () => {
  const [roomId, setRoomId] = useState("");
  const [connected, setConnected] = useState(false);
  const [callStarted, setCallStarted] = useState(false);
  const [localSocketId, setLocalSocketId] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(new MediaStream());
  const peerConnection = useRef<RTCPeerConnection | null>(null);

  const startCall = async () => {
    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    if (localVideoRef.current)
      localVideoRef.current.srcObject = localStream.current;

    localStream.current.getTracks().forEach((track) => {
      peerConnection.current?.addTrack(
        track,
        localStream.current as MediaStream
      );
    });

    peerConnection.current.ontrack = (event) => {
      if (remoteStream.current && remoteVideoRef.current) {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.current?.addTrack(track);
        });
        remoteVideoRef.current.srcObject = remoteStream.current;
      }
    };

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { roomId, candidate: event.candidate });
      }
    };

    const offer = await peerConnection.current.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: true,
    });
    await peerConnection.current.setLocalDescription(offer);

    socket.emit("offer", { roomId, offer });
    setCallStarted(true);
  };

  const joinRoom = () => {
    if (!roomId) return;
    socket.emit("join-room", roomId);
    setConnected(true);
  };

  const endCall = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
    }
    setConnected(false);
    setCallStarted(false);
    socket.disconnect();
  };

  useEffect(() => {
    socket.on("connect", () => setLocalSocketId(socket.id || null));

    socket.on(
      "user-disconnected",
      async (data: { userId: string; roomId: string }) => {
        if (roomId === data.roomId) {
          if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
          }
          if (localStream.current) {
            localStream.current.getTracks().forEach((track) => track.stop());
          }
          setConnected(false);
          setCallStarted(false);
          socket.disconnect();
        }
      }
    );

    socket.on(
      "offer",
      async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
        if (!peerConnection.current) return;

        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(offer)
        );
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        socket.emit("answer", { roomId, answer });
      }
    );

    socket.on(
      "answer",
      async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
        if (!peerConnection.current) return;
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      }
    );

    socket.on(
      "ice-candidate",
      async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        if (!peerConnection.current) return;
        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
    );

    return () => {
      socket.off("connect");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("user-disconnected");
    };
  }, [roomId]);

  return (
    <div style={{ textAlign: "center", fontFamily: "Arial, sans-serif" }}>
      <h1>P2P Video Call</h1>
      {!connected ? (
        <div>
          <input
            type="text"
            placeholder="Enter room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{ padding: "5px", marginRight: "10px" }}
          />
          <button onClick={joinRoom} style={{ padding: "5px 10px" }}>
            Join Room
          </button>
        </div>
      ) : (
        <div>
          <div>
            <p>
              <strong>Socket ID:</strong> {localSocketId}
            </p>
            <p>
              <strong>Room ID:</strong> {roomId}
            </p>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginTop: "20px",
            }}
          >
            <div style={{ marginRight: "20px" }}>
              <p>Local Video</p>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "300px", border: "1px solid black" }}
              />
            </div>
            <div>
              <p>Remote Video</p>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                style={{ width: "300px", border: "1px solid black" }}
              />
            </div>
          </div>
          <div style={{ marginTop: "20px" }}>
            {callStarted ? (
              <button
                onClick={endCall}
                style={{
                  padding: "5px 10px",
                  backgroundColor: "red",
                  color: "white",
                }}
              >
                End Call
              </button>
            ) : (
              <button
                onClick={startCall}
                style={{ padding: "5px 10px", marginRight: "10px" }}
              >
                Start Call
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
