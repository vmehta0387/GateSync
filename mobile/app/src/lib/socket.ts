import { SOCKET_URL } from '../config/env';

const VISITOR_EVENTS = ['visitor_pending_approval', 'visitor_status_updated'] as const;
const COMPLAINT_EVENTS = ['complaint_created', 'complaint_updated', 'complaint_message_added'] as const;
const FACILITY_EVENTS = ['facility_created', 'facility_updated', 'facility_booking_updated', 'facility_maintenance_updated'] as const;
const SECURITY_EVENTS = ['security_activity_logged', 'security_shift_updated', 'security_incident_updated'] as const;

type SocketLike = {
  connected: boolean;
  emit: (...args: unknown[]) => void;
  connect: () => void;
  once: (event: string, listener: () => void) => void;
  on: (event: string, listener: () => void) => void;
  off: (event: string, listener: () => void) => void;
};

let socket: SocketLike | null = null;

function getSocket() {
  if (!socket) {
    const socketModule = require('socket.io-client') as {
      io: (url: string, options: { autoConnect: boolean; transports: string[] }) => SocketLike;
    };

    socket = socketModule.io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }

  return socket;
}

function subscribeToRooms(rooms: string[], events: readonly string[], onUpdate: () => void) {
  const sharedSocket = getSocket();

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

  events.forEach((eventName) => {
    sharedSocket.on(eventName, onUpdate);
  });

  return () => {
    events.forEach((eventName) => {
      sharedSocket.off(eventName, onUpdate);
    });

    rooms.forEach((room) => {
      sharedSocket.emit('leave_room', room);
    });
  };
}

export function subscribeToResidentVisitorUpdates(rooms: string[], onUpdate: () => void) {
  return subscribeToRooms(rooms, VISITOR_EVENTS, onUpdate);
}

export function subscribeToResidentComplaintUpdates(rooms: string[], onUpdate: () => void) {
  return subscribeToRooms(rooms, COMPLAINT_EVENTS, onUpdate);
}

export function subscribeToResidentFacilityUpdates(rooms: string[], onUpdate: () => void) {
  return subscribeToRooms(rooms, FACILITY_EVENTS, onUpdate);
}

export function subscribeToGuardLiveUpdates(societyId: number, onUpdate: () => void) {
  return subscribeToRooms([`society_${societyId}_guards`, `society_${societyId}_security`], [...VISITOR_EVENTS, ...SECURITY_EVENTS], onUpdate);
}
