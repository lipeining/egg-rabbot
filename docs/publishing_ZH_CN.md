# Publishing

In confirm mode (the default for exchanges), the publish call returns a promise that is only resolved once the broker has confirmed the publish (see [Publisher Acknowledgments](https://www.rabbitmq.com/confirms.html) for more details). If a configured timeout is reached, or in the rare event that the broker rejects the message, the promise will be rejected. More commonly, the connection to the broker could be lost before the message is confirmed and you end up with a message in "limbo". rabbot keeps a list of unconfirmed messages that have been published _in memory only_. Once a connection is available and the topology is in place, rabbot will send messages in the order of the publish calls. In the event of a disconnection or unreachable broker, all publish promises that have not been resolved are rejected.

确认模式 (exchanges的默认行为), 发布调用返回仅在broker确认发布后才会返回promise (有关详细信息, 请参阅 [发布者确认] (http://www.rabbitmq.com/confirms.html)。如果达到配置的超时, 或者在代理拒绝消息的罕见情况下, promise将被reject。更常见的是, 与代理的连接可能会丢失, 之前的消息未被确认, 你最终与消息 "陷入僵局"。rabbot保留了一个未经确认的消息的列表, 这些消息已在内存中只发布了 。一旦连接可用且拓扑正常, rabbot 将按发布调用的顺序发送消息。在断开连接或无法访问的代理的情况下, 所有尚未解决的发布promises都将被拒绝。

Publish timeouts can be set per message, per exchange or per connection. The most specific value overrides any set at a higher level. There are no default timeouts set at any level. The timer is started as soon as publish is called and only cancelled once rabbot is able to make the publish call on the actual exchange's channel. The timeout is cancelled once publish is called and will not result in a rejected promise due to time spent waiting on a confirmation.

可以为每条消息、每个交换或每个连接设置发布超时。最具体的值将覆盖更高级别的任何集。在任何级别都没有设置默认超时。计时器在调用发布后立即启动, 只有在rabbot能够在实际exchange的通道上进行发布呼叫后才取消。一旦调用发布, 超时将被取消, 并且不会由于等待确认所花费的时间而导致拒绝承诺。

> Caution: rabbot does _not_ limit the growth of pending published messages. If a service cannot connect to Rabbit due to misconfiguration or the broker being down, publishing lots of messages can lead to out-of-memory errors. It is the consuming services responsibility to handle these kinds of scenarios.

注意: rabbot不会限制挂起的已发布消息的增长。如果由于配置错误或代理出现故障而无法连接到rabbitmq, 则发布大量消息可能会导致内存不足错误。处理这类方案是消费服务者的责任。

Confirm mode is not without an overhead cost. This can be turned off, per exchange, by setting `noConfirm: true`. Confirmation results in increased memory overhead on the client and broker. When off, the promise will _always_ resolve when the connection and exchange are available.

确认模式并非没有间接损失。这可以通过设置 "noConfirm: true" 来关闭每个交换的确认模式。确认会增加客户端和代理的内存开销。当关闭时, 当连接和交换可用时, promise将始终resolve。

#### Serializers

rabbot associates serialization techniques for messages with mimeTypes which can now be set when publishing a message. Out of the box, it really only supports 3 types of serialization:

rabbot 将消息的序列化技术与模拟类型相关联, 现在可以在发布消息时设置这些类型。开箱即用, 它实际上只支持3种类型的序列化:
 * `"text/plain"`
 * `"application/json"`
 * `"application/octet-stream"`

You can register your own serializers using `addSerializer` but make sure to do so on both the sending and receiving side of the message.

您可以使用 "addSerializer" 注册自己的序列化程序, 但一定要在消息的发送和接收端都要注册。

## `rabbot.publish( exchangeName, options, [connectionName] )`

Things to remember when publishing a message:

 * A type sepcifier is required so that the recipient knows what kind of message its getting and which handler should process it
 * If `contentType` is provided, then that will be used for the message's contentType
 * If `body` is an object or an array, it will be serialized as JSON and `contentType` will be "application/json"
 * If `body` is a string, it will be sent as a utf8 encoded string and `contentType` will be "text/plain"
 * If `body` is a Buffer, it will be sent as a byte array and `contentType` will be "application/octet-stream"
 * By default, the type specifier will be used if no routing key is undefined
 * 默认情况下, 如果没有未定义路由键, routing key 则将使用类型指定符type
 * 可以使用 "" 的路由键来防止类型指定符type被用作路由键routing key
 * Use a routing key of `""` to prevent the type specifier from being used as the routing key
 * Non-persistent messages in a queue will be lost on server restart, default is non-persistent.  Persistence can be set on either an exchange when it is created via addExchange, or when sending a message (needed when using "default" exchanges since non-persistent publish is the default)
 * 队列中的非持久性消息将在服务器重新启动时丢失, 默认值为非持久性消息。 在通过 addexchange 创建交换机时, 或在发送消息时 (使用 "默认" 交换时需要, 因为非持久性发布是默认值), 则可以在交换机上设置持久性)

This example shows all of the available properties (including those which get set by default):

### Example
```javascript
rabbit.publish( "exchange.name",
  {
    routingKey: "hi",
    type: "company.project.messages.textMessage",
    correlationId: "one",
    contentType: "application/json",
    body: { text: "hello!" },
    messageId: "100",
    expiresAfter: 1000 // TTL in ms, in this example 1 second
    timestamp: // posix timestamp (long)
    mandatory: true, //Must be set to true for onReturned to receive unqueued message
    // 必须设置为 true, "已返回" 才能接收未排队的消息
    persistent: true, //If either message or exchange defines persistent=true queued messages will be saved to disk.
    // 如果消息或交换定义了persistent=true 排队的消息将保存到磁盘。
    headers: {
      random: "application specific value"
    },
    timeout: 1000 // ms to wait before cancelling the publish and rejecting the promise
  },
  connectionName: "" // another optional way to provide connection name if needed
);
```

## `rabbot.request( exchangeName, options, [connectionName] )`

This works just like a publish except that the promise returned provides the response (or responses) from the other side. A `replyTimeout` is available in the options that controls how long rabbot will wait for a reply before removing the subscription for the request to prevent memory leaks.

这就像发布一样, 只是返回的promise提供了来自另一方的响应 (或响应)。"replyTimeout" 在控制rabbot将等待回复的时间的选项中提供了一个 "replyTimeout", 然后删除请求的订阅以防止内存泄漏。

> Note: the default replyTimeout will be double the publish timeout or 1 second if no publish timeout was ever specified.

Request provides for two ways to get multiple responses; one is to allow a single replier to stream a set of responses back and the other is to send a request to multiple potential responders and wait until a specific number comes back.
请求提供了两种获取多个响应的方法;一种是允许单个replier将一组响应流式返回, 另一种是将请求发送到多个潜在响应方, 并等待特定的数字返回。
### Expecting A Singe Reply

```js
// request side
const parts = [];
rabbit.request('request.ex', {
    type: 'request',
    body: id
  })
  .then( reply => {
    // done - do something with all the data?
    reply.ack();
  });

// receiver sides
rabbit.handle('request', (req) => {
  req.reply(database.get(req.id));
});
```

### Expecting A Stream

`reply` takes an additional hash argument where you can set `more` to `true` to indicate there are more messages incoming as part of the reply.

"reply" 需要一个额外的hash参数, 您可以在其中将 "more" 设置为 "true", 以指示在答复中传入的消息有多个部分。

In this case, the third argument to the `request` function will get every message **except** the last. 除了最后一部分

```js
// request side
const parts = [];
rabbit.request('request.ex', {
    type: 'request',
    body: id
  },
  reply => {
    parts.push(part);
    part.ack();
  })
  .then( final => {
    // done - do something with all the data?
    final.ack();
  });

// receiver side
rabbit.handle('request', (req) => {
  const stream = data.getById(req.body);
  stream.on('data', data => {
    req.reply(data, { more: true });
  });
  stream.on('end', () => {
    req.reply({ body: 'done' });
  });
  stream.on('error', (err) => {
    req.reply({ body: { error: true, detail: err.message });
  });
});
```

### Scatter-Gather

In scatter-gather: the recipients don't know how many of them there are and don't have to be aware that they are participating in scatter-gather/race-conditions.


They just reply. The limit is applied on the requesting side by setting a `expects` property on the outgoing message to let rabbot how many messages to collect before stopping and considering the request satisfied.

Normally this is done with mutliple responders on the other side of a topic or fanout exchange.

> !IMPORTANT! - messages beyond the limit are treated as unhandled. You'll need to have an unhandled message strategy in place or at least understand how rabbot deals with them by default.

在分散聚集中: 接收者不知道他们中有多少人, 也不必意识到他们参与的是分散聚集的环境。他们只是回答。
通过在传出消息上设置 "expects" 属性, 让 rabbot 在停止之前收集多少条消息, 并认为请求已满足, 将限制应用于请求端。
通常情况下, 这是通过topic或faout exchange另一侧的多个应答器完成的。
> !重要！-超出限制的邮件被视为未处理。您需要有一个未处理的消息策略, 或者至少了解rabbot在默认情况下是如何处理它们的。
通常这里是指 ‘死信’
```js
// request side
const parts = [];
rabbit.request('request.ex', {
    type: 'request',
    body: id,
    limit: 3 // will stop after 3 even if many more reply
  },
  reply => {
    parts.push(part);
    part.ack();
  })
  .then( final => {
    // done - do something with all the data?
    final.ack();
  });

// receiver sides
rabbit.handle('request', (req) => {
  req.reply(database.get(req.id));
});
```

## `rabbot.bulkPublish( set, [connectionName] )`

This creates a promise for a set of publishes to one or more exchanges on the same connection.

It is a little more efficient than calling `publish` repeatedly as it performs the precondition checks up-front, a single time before it beings the publishing.
它比反复调用 "发布" 更有效一点, 因为它提前执行先决条件检查, 在它出现出版之前的一次。
它支持两种单独的格式来指定一组消息: 哈希和数组。
It supports two separate formats for specifying a set of messages: hash and array.

### Hash Format

Each key is the name of the exchange to publish to and the value is an array of messages to send. Each element in the array follows the same format as the `publish` options.

The exchanges are processed serially, so this option will not work if you want finer control over sending messages to multiple exchanges in interleaved order.

```js
rabbot.publish({
  'exchange-1': [
    { type: 'one', body: '1' },
    { type: 'one', body: '2' }
  ],
  'exchange-2': [
    { type: 'two', body: '1' },
    { type: 'two', body: '2' }
  ]
}).then(
  () => // a list of the messages of that succeeded,
  failed => // a list of failed messages and the errors `{ err, message }`
)
```

### Array Format

Each element in the array follows the format of `publish`'s option but requires the `exchange` property to control which exchange to publish each message to.

```js
rabbot.publish([
  { type: 'one', body: '1', exchange: 'exchange-1' },
  { type: 'one', body: '2', exchange: 'exchange-1' },
  { type: 'two', body: '1', exchange: 'exchange-2' },
  { type: 'two', body: '2', exchange: 'exchange-2' }
}).then(
  () => // a list of the messages of that succeeded,
  failed => // a list of failed messages and the errors `{ err, message }`
)
```
