const express = require('express');
const authRoutes = require('./auth.routes');
const ticketsRoutes = require('./tickets.routes');
const ticketClosureRoutes = require('./ticketClosure.routes');
const suggestionsRoutes = require('./suggestions.routes');
const mapRoutes = require('./map.routes');
const publicRoutes = require('./public.routes');
const usersRoutes = require('./users.routes');
const adminRoutes = require('./admin.routes');
const qgAgentsRoutes = require('./qgAgents.routes');

const api = express.Router();

api.get('/health', (_req, res) => res.json({ ok: true, service: 'anamboatra-api' }));

api.use('/auth', authRoutes);
api.use('/tickets', ticketsRoutes);
api.use('/tickets', ticketClosureRoutes);
api.use('/suggestions', suggestionsRoutes);
api.use('/map', mapRoutes);
api.use('/public', publicRoutes);
api.use('/users', usersRoutes);

api.use('/admin', adminRoutes);
api.use('/qg', qgAgentsRoutes);

module.exports = api;
