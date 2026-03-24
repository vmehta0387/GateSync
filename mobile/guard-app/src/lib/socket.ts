import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';

const VISITOR_EVENTS = ['visitor_pending_approval', 'visitor_status_updated'] as const;
const SECURITY_EVENTS = ['security_activity_logged', 'security_shift_updated', 'security_incident_updated'] as const;

let socket: Socket | null = null;

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }

  return socket;
}

export function subscribeToGuardLiveUpdates(societyId: number, onUpdate: () => void) {
  const sharedSocket = getSocket();
  const rooms = [`society_${societyId}_guards`, `society_${societyId}_security`];

  const joinRooms = () => {
    rooms.forEach((room) => {
      sharedSocket.emit('join_room', room);
    });
  };

  if (sharedSocket.connected) {
    joinRooms();
  } else {
    sharedSocket.connect();
    sharedSocket.once('connect', joinRooms);
  }

  [...VISITOR_EVENTS, ...SECURITY_EVENTS].forEach((eventName) => {
    sharedSocket.on(eventName, onUpdate);
  });

  return () => {
    [...VISITOR_EVENTS, ...SECURITY_EVENTS].forEach((eventName) => {
      sharedSocket.off(eventName, onUpdate);
    });

    rooms.forEach((room) => {
      sharedSocket.emit('leave_room', room);
    });
  };
}
