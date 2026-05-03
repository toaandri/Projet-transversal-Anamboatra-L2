const { sequelize } = require('../../config/postgres');
const { defineZone } = require('./Zone');
const { defineUser } = require('./User');
const { defineTicket } = require('./Ticket');
const { defineSuggestionCitoyen } = require('./SuggestionCitoyen');
const { defineStatusAudit } = require('./StatusAudit');

const Zone = defineZone(sequelize);
const User = defineUser(sequelize);
const Ticket = defineTicket(sequelize);
const SuggestionCitoyen = defineSuggestionCitoyen(sequelize);
const StatusAudit = defineStatusAudit(sequelize);

Zone.hasMany(User, { foreignKey: 'zoneId', as: 'users' });
User.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });

Zone.hasMany(Ticket, { foreignKey: 'zoneId', as: 'tickets' });
Ticket.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });

User.hasMany(Ticket, { foreignKey: 'signalantUserId', as: 'ticketsSignales' });
Ticket.belongsTo(User, { foreignKey: 'signalantUserId', as: 'signalant' });

Zone.hasMany(SuggestionCitoyen, { foreignKey: 'zoneId', as: 'suggestions' });
SuggestionCitoyen.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });

User.hasMany(SuggestionCitoyen, { foreignKey: 'assignedPatrolUserId', as: 'dispatchedSuggestions' });
SuggestionCitoyen.belongsTo(User, { foreignKey: 'assignedPatrolUserId', as: 'patrolAssignee' });

Ticket.hasMany(StatusAudit, { foreignKey: 'ticketId', as: 'audits' });
StatusAudit.belongsTo(Ticket, { foreignKey: 'ticketId', as: 'ticket' });

Ticket.belongsTo(SuggestionCitoyen, {
  foreignKey: 'originSuggestionId',
  as: 'originSuggestion',
});

async function syncPostgres() {
  await sequelize.sync({ alter: true });
}

module.exports = {
  sequelize,
  Zone,
  User,
  Ticket,
  SuggestionCitoyen,
  StatusAudit,
  syncPostgres,
};
