import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';
import { getSocketOrigin } from './apiBase';

export function useMapSocket(onEvent: () => void) {
  useEffect(() => {
    const token = getToken();
    const origin = getSocketOrigin();
    // En dev via Vite proxy, le transport websocket peut émettre ECONNABORTED
    // de façon intermittente; polling reste stable pour le dev local.
    const transports = import.meta.env.DEV ? ['polling'] : ['websocket', 'polling'];
    const socket: Socket = io(origin, {
      path: '/socket.io',
      auth: token ? { token } : {},
      transports,
    });
    const bump = () => onEvent();
    socket.on('ticket:created', bump);
    socket.on('ticket:updated', bump);
    socket.on('suggestion:created', bump);
    return () => {
      socket.off('ticket:created', bump);
      socket.off('ticket:updated', bump);
      socket.off('suggestion:created', bump);
      socket.disconnect();
    };
  }, [onEvent]);
}
