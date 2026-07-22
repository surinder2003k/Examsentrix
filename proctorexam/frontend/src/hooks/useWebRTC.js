'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import SimplePeer from 'simple-peer';

/**
 * WebRTC hook — wires SimplePeer signal events directly through the
 * Socket.io connection, closing the missing bridge that was causing
 * P2P camera streams to never establish.
 *
 * Usage:
 *   const { stream, peers, startCamera, stopCamera, createPeer, handleSignal } = useWebRTC(socketRef);
 *
 * @param {React.MutableRefObject} socketRef - ref to the Socket.io socket instance
 */
export function useWebRTC(socketRef, liveSocket) {
  const [stream, setStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRef = useRef(null);
  const peersRef = useRef({});

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsStreaming(true);
      return mediaStream;
    } catch (error) {
      console.error('Camera access error:', error);
      return null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      setIsStreaming(false);
    }
    Object.values(peersRef.current).forEach((peer) => peer.destroy());
    peersRef.current = {};
    setPeers({});
  }, []);

  const createPeer = useCallback(
    (targetSocketId, initiator = false) => {
      const peer = new SimplePeer({
        initiator,
        stream: streamRef.current || undefined,
        trickle: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      // ✅ Wire signal data directly to Socket.io instead of window events
      peer.on('signal', (signal) => {
        if (socketRef?.current?.connected) {
          socketRef.current.emit('video_signal', { targetSocketId, signal });
        }
      });

      peer.on('stream', (remoteStream) => {
        setPeers((prev) => ({
          ...prev,
          [targetSocketId]: { peer, stream: remoteStream },
        }));
      });

      peer.on('error', (err) => {
        console.error('WebRTC peer error:', err);
      });

      peer.on('close', () => {
        setPeers((prev) => {
          const next = { ...prev };
          delete next[targetSocketId];
          return next;
        });
        delete peersRef.current[targetSocketId];
      });

      peersRef.current[targetSocketId] = peer;
      return peer;
    },
    [socketRef]
  );

  /**
   * Handle incoming signal from socket 'video_signal' event.
   * If a peer already exists for the sender, feed the signal into it.
   * Otherwise create a non-initiator peer and feed the signal.
   */
  const handleSignal = useCallback(
    ({ from, signal }) => {
      if (peersRef.current[from]) {
        peersRef.current[from].signal(signal);
      } else {
        const peer = createPeer(from, false);
        if (peer) peer.signal(signal);
      }
    },
    [createPeer]
  );

  // Keep listening for socket-forwarded video signals (replaces old window event)
  useEffect(() => {
    const socket = liveSocket || socketRef?.current;
    if (!socket) return;

    const onVideoSignal = (data) => handleSignal(data);
    socket.on('video_signal', onVideoSignal);
    return () => socket.off('video_signal', onVideoSignal);
  }, [liveSocket, socketRef, handleSignal]);

  return {
    stream,
    peers,
    isStreaming,
    startCamera,
    stopCamera,
    createPeer,
    handleSignal,
  };
}

