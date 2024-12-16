import React, { useEffect, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"

const socket: Socket = io("http://localhost:4000")

const App: React.FC = () => {
	const [roomId, setRoomId] = useState("")
	const [connected, setConnected] = useState(false)
	const localVideoRef = useRef<HTMLVideoElement>(null)
	const remoteVideoRef = useRef<HTMLVideoElement>(null)
	const localStream = useRef<MediaStream | null>(null)
	const remoteStream = useRef<MediaStream | null>(new MediaStream())
	const peerConnection = useRef<RTCPeerConnection | null>(null)

	useEffect(() => {
		socket.on(
			"offer",
			async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
				if (!peerConnection.current) return

				await peerConnection.current.setRemoteDescription(
					new RTCSessionDescription(offer)
				)
				const answer = await peerConnection.current.createAnswer()
				await peerConnection.current.setLocalDescription(answer)

				socket.emit("answer", { roomId, answer })
			}
		)

		socket.on(
			"answer",
			async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
				if (!peerConnection.current) return
				await peerConnection.current.setRemoteDescription(
					new RTCSessionDescription(answer)
				)
			}
		)

		socket.on(
			"ice-candidate",
			async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
				if (!peerConnection.current) return
				await peerConnection.current.addIceCandidate(
					new RTCIceCandidate(candidate)
				)
			}
		)

		socket.on("user-connected", async (userId: string) => {
			console.log(`User connected: ${userId}`)
		})

		return () => {
			socket.off("offer")
			socket.off("answer")
			socket.off("ice-candidate")
			socket.off("user-connected")
		}
	}, [roomId])

	const startCall = async () => {
		peerConnection.current = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
		})

		localStream.current = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: true,
		})
		if (localVideoRef.current)
			localVideoRef.current.srcObject = localStream.current

		localStream.current.getTracks().forEach((track) => {
			peerConnection.current?.addTrack(
				track,
				localStream.current as MediaStream
			)
		})

		peerConnection.current.ontrack = (event) => {
			if (remoteStream.current && remoteVideoRef.current) {
				event.streams[0].getTracks().forEach((track) => {
					remoteStream.current?.addTrack(track)
				})
				remoteVideoRef.current.srcObject = remoteStream.current
			}
		}

		peerConnection.current.onicecandidate = (event) => {
			if (event.candidate) {
				socket.emit("ice-candidate", { roomId, candidate: event.candidate })
			}
		}

		const offer = await peerConnection.current.createOffer({
			offerToReceiveVideo: true,
			offerToReceiveAudio: true,
		})
		await peerConnection.current.setLocalDescription(offer)

		socket.emit("offer", { roomId, offer })
	}

	const joinRoom = () => {
		if (!roomId) return
		socket.emit("join-room", roomId)
		setConnected(true)
	}

	return (
		<div>
			<h1>P2P Video Call</h1>
			{!connected ? (
				<div>
					<input
						type="text"
						placeholder="Enter room ID"
						value={roomId}
						onChange={(e) => setRoomId(e.target.value)}
					/>
					<button onClick={joinRoom}>Join Room</button>
				</div>
			) : (
				<div>
					<div>
						<p>Local Video</p>
						<video ref={localVideoRef} autoPlay playsInline muted />
					</div>
					<div>
						<p>Remote Video</p>
						<video ref={remoteVideoRef} autoPlay playsInline />
					</div>
					<button onClick={startCall}>Start Call</button>
				</div>
			)}
		</div>
	)
}

export default App
