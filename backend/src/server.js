const http = require('http');
const { Server } = require('socket.io');
const { createApp } = require('./app');
const { env } = require('./config/env');
const { connectPostgres } = require('./config/postgres');
const { syncPostgres, User } = require('./models/postgres');
const { verifyToken } = require('./utils/jwt');

async function main() {
  await connectPostgres();
  await syncPostgres();

  const app = createApp();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    socket.join('public');
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next();
      const payload = verifyToken(token);
      const user = await User.findByPk(payload.sub);
      if (user?.zoneId) socket.join(`zone:${user.zoneId}`);
      socket.data.userId = user?.id;
      socket.data.role = user?.role;
    } catch {

    }
    return next();
  });

  io.on('connection', () => {});

  app.set('io', io);

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`[anamboatra] API + WebSocket à l'écoute sur 0.0.0.0:${env.port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
