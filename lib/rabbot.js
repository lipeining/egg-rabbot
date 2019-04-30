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
  // rabbot.on("connected", connection=>{
  //   app.coreLogger.info("connected");
  //   app.coreLogger.info(connection);
  // });
  // rabbot.on("failed", connection=>{
  //   app.coreLogger.info("failed");
  //   app.coreLogger.info(connection);
  // });
  // rabbot.on("default.connection.opened", connection=>{
  //   app.coreLogger.info("default connected");
  //   app.coreLogger.info(connection);
  // });
  // rabbot.on("default.connection.configured", connection=>{
  //   app.coreLogger.info("default configured");
  //   app.coreLogger.info(connection);
  // });
  app.coreLogger.info('[egg-rabbot] connection success');

  return rabbot;
}

