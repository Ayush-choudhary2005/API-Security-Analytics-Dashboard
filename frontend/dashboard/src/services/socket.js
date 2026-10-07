import { io } from 'socket.io-client';

let socket = null;

export const initSocket = () => {
  if (!socket) {
    const wsUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_BASE_URL || '/';
    socket = io(wsUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected with ID:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.warn('[Socket] Connection warning:', error.message);
    });
  }
  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initSocket();
  }
  return socket;
};

export const joinProjectRoom = (projectId) => {
  const s = getSocket();
  if (s && projectId) {
    s.emit('join_project', { project_id: projectId });
  }
};

export const leaveProjectRoom = (projectId) => {
  const s = getSocket();
  if (s && projectId) {
    s.emit('leave_project', { project_id: projectId });
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
