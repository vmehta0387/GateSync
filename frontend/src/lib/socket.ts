import { io, type Socket } from 'socket.io-client';

const SOCKET_SERVER_URL = 'http://localhost:5000';
const VISITOR_EVENTS = ['visitor_pending_approval', 'visitor_status_updated'] as const;
const COMPLAINT_EVENTS = ['complaint_created', 'complaint_updated', 'complaint_message_added'] as const;
const FACILITY_EVENTS = ['facility_created', 'facility_updated', 'facility_booking_updated', 'facility_maintenance_updated'] as const;
const SECURITY_EVENTS = ['security_activity_logged', 'security_shift_updated', 'security_incident_updated'] as const;

let sharedSocket: Socket | null = null;

function getSharedSocket() {
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_SERVER_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }

  return sharedSocket;
}

export function subscribeToVisitorLiveUpdates(rooms: string[], onEvent: () => void) {
  const socket = getSharedSocket();
  const uniqueRooms = [...new Set(rooms.filter(Boolean))];

  const joinRooms = () => {
    uniqueRooms.forEach((room) => {
      socket.emit('join_room', room);
    });
  };

  if (socket.connected) {
    joinRooms();
  } else {
    socket.connect();
    socket.once('connect', joinRooms);
  }

  VISITOR_EVENTS.forEach((eventName) => {
    socket.on(eventName, onEvent);
  });

  return () => {
    VISITOR_EVENTS.forEach((eventName) => {
      socket.off(eventName, onEvent);
    });

    uniqueRooms.forEach((room) => {
      socket.emit('leave_room', room);
    });
  };
}

export function subscribeToComplaintLiveUpdates(rooms: string[], onEvent: () => void) {
  const socket = getSharedSocket();
  const uniqueRooms = [...new Set(rooms.filter(Boolean))];

  const joinRooms = () => {
    uniqueRooms.forEach((room) => {
      socket.emit('join_room', room);
    });
  };

  if (socket.connected) {
    joinRooms();
  } else {
    socket.connect();
    socket.once('connect', joinRooms);
  }

  COMPLAINT_EVENTS.forEach((eventName) => {
    socket.on(eventName, onEvent);
  });

  return () => {
    COMPLAINT_EVENTS.forEach((eventName) => {
      socket.off(eventName, onEvent);
    });

    uniqueRooms.forEach((room) => {
      socket.emit('leave_room', room);
    });
  };
}

export function subscribeToFacilityLiveUpdates(rooms: string[], onEvent: () => void) {
  const socket = getSharedSocket();
  const uniqueRooms = [...new Set(rooms.filter(Boolean))];

  const joinRooms = () => {
    uniqueRooms.forEach((room) => {
      socket.emit('join_room', room);
    });
  };

  if (socket.connected) {
    joinRooms();
  } else {
    socket.connect();
    socket.once('connect', joinRooms);
  }

  FACILITY_EVENTS.forEach((eventName) => {
    socket.on(eventName, onEvent);
  });

  return () => {
    FACILITY_EVENTS.forEach((eventName) => {
      socket.off(eventName, onEvent);
    });

    uniqueRooms.forEach((room) => {
      socket.emit('leave_room', room);
    });
  };
}

export function subscribeToSecurityLiveUpdates(rooms: string[], onEvent: () => void) {
  const socket = getSharedSocket();
  const uniqueRooms = [...new Set(rooms.filter(Boolean))];

  const joinRooms = () => {
    uniqueRooms.forEach((room) => {
      socket.emit('join_room', room);
    });
  };

  if (socket.connected) {
    joinRooms();
  } else {
    socket.connect();
    socket.once('connect', joinRooms);
  }

  SECURITY_EVENTS.forEach((eventName) => {
    socket.on(eventName, onEvent);
  });

  return () => {
    SECURITY_EVENTS.forEach((eventName) => {
      socket.off(eventName, onEvent);
    });

    uniqueRooms.forEach((room) => {
      socket.emit('leave_room', room);
    });
  };
}
