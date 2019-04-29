'use strict';

const mock = require('egg-mock');

describe('test/rabbot.test.js', () => {
  let app;
  before(() => {
    app = mock.app({
      baseDir: 'apps/rabbot-test',
    });
    return app.ready();
  });

  after(() => app.close());
  afterEach(mock.restore);

  it('should GET /', () => {
    return app.httpRequest()
      .get('/')
      .expect('hi, rabbot')
      .expect(200);
  });
  it('print app.rabbot', async () => {
    const rabbot = app.rabbot;
    // console.log(rabbot);
    rabbot.handle('MyMessage', (msg) => {
      console.log('received msg', msg.body);
      msg.ack();
    });
    
    rabbot.handle('MyRequest', (req) => {
      req.reply('yes?');
    });
    await rabbot.request('ex.1', { type: 'MyRequest', body: 'wow' })
    .then(
      reply => {
        console.log('got response:', reply.body);
        reply.ack();
      }
    );
    await rabbot.publish('ex.1', { type: 'MyMessage', body: 'hello!' });
  });
});
