import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';
import { getSocketOrigin } from './apiBase';

export function useMapSocket(onEvent: () => void) {
  useEffect(() => {
    const token = getToken();
    const origin = getSocketOrigin();
    const socket: Socket = io(origin, {
      path: '/socket.io',
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
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
