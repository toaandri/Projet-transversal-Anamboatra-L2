import { io, type Socket } from 'socket.io-client';
import { API_URL } from './config';
import { getToken } from '@/auth/auth';

export async function connectMapSocket(onEvent: () => void): Promise<() => void> {
  const token = await getToken();
  const socket: Socket = io(API_URL, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: token ? { token } : {},
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
}
