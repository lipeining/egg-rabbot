'use strict';

const rabbot = require('rabbot');

/**
 * mount apqp on app
 * @param {Application} app app
 */
module.exports = app => {
  app.addSingleton('rabbot', createClient);
};

async function createClient(config, app) {
  if (!config.connection) {
    config.connection = {
      name: 'default',
      user: 'guest',
      pass: 'guest',
      host: 'localhost',
      port: 5672,
      vhost: '%2f',
      replyQueue: 'customReplyQueue',
    };
  }
  app.coreLogger.info(`[egg-rabbot] connection on ${JSON.stringify(config.connection, null, 2)}`);

  await rabbot.configure(config);

  app.coreLogger.info('[egg-rabbot] connection success');

  return rabbot;
}

