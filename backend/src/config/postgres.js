const { Sequelize } = require('sequelize');
const { env } = require('./env');

function createSequelize() {

  const logging = false;

  if (env.databaseUrl) {
    return new Sequelize(env.databaseUrl, {
      dialect: 'postgres',
      logging,
      dialectOptions: env.postgres.ssl
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
    });
  }

  return new Sequelize(env.postgres.database, env.postgres.user, env.postgres.password, {
    host: env.postgres.host,
    port: env.postgres.port,
    dialect: 'postgres',
    logging,
    dialectOptions: env.postgres.ssl
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
  });
}

const sequelize = createSequelize();

async function connectPostgres() {
  await sequelize.authenticate();
}

module.exports = { sequelize, connectPostgres };
