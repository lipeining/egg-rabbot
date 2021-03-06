'use strict';

exports.keys = '123456';

/**
 * egg-rabbot default config
 * @member Config#rabbot
 * @property {String} SOME_KEY - some description
 */
exports.rabbot = {
    // client 单实例， clients多实例
    client: {
      connection: {
        name: 'default',
        user: 'guest',
        pass: 'guest',
        host: 'localhost',
        port: 5672,
        vhost: '%2f',
        replyQueue: 'customReplyQueue',
      },
      exchanges: [
        { name: 'ex.1', type: 'fanout', autoDelete: true },
      ],
      queues: [
        { name: 'q.1', autoDelete: true, subscribe: true },
      ],
      bindings: [
        { exchange: 'ex.1', target: 'q.1', keys: [] },
      ],
    },
  };