import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from '@/lib/api';
import { getSocketOrigin } from '@/lib/apiBase';

export function useMapSocket(onEvent: () => void) {
  useEffect(() => {
    const token = getToken();
    const origin = getSocketOrigin();

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
    socket.on('suggestion:terrain-cloture', bump);
    return () => {
      socket.off('ticket:created', bump);
      socket.off('ticket:updated', bump);
      socket.off('suggestion:created', bump);
      socket.off('suggestion:terrain-cloture', bump);
      socket.disconnect();
    };
  }, [onEvent]);
}
