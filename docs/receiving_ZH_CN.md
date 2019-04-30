# Receiving

Covering message handling and subscriptions.

## `rabbot.handle( options, handler )`
## `rabbot.handle( typeName, handler, [queueName], [context] )`

> Notes:
> * Handle calls should happen __before__ starting subscriptions.
> * The message's routing key will be used if the type is missing or empty on incoming messages
> * Specifying `queueName` will cause the handler to handle messages for that queue _only_
> * `typeName` can use AMQP style wild-cards to handle multiple message types - use this with caution!

> 注意事项:
> * 在开始订阅之前, 应处理handle。
> * 如果传入消息上的type丢失或为空, 则将使用消息的路由密钥routing key
> * 指定 "queue" 将导致处理程序仅处理该队列的消息
> * "typeName" 可以使用 AMQP 样式通配卡来处理多种消息类型-请谨慎使用!

Message handlers are registered to handle a message based on the typeName. Calling handle will return a reference to the handler that can later be removed. The message that is passed to the handler is the raw Rabbit payload. The body property contains the message body published. The message has `ack`, `nack` (requeue the message), `reply` and `reject` (don't requeue the message) methods control what Rabbit does with the message.

消息处理程序被注册为基于typeName处理消息的句柄。调用句柄将返回对处理程序的引用, 以后可以删除该处理程序。传递给处理程序的消息是原始rabbot有效负载payload。正文属性包含已发布的消息正文。消息具有 "ack"、"nack" (请求消息)、"reply" 和 "reject" (不重新查询消息) 方法, 这些方法控制rabbot对消息的处理。
> !重要!: 当队列的 "NoAck" 设置为 "true" 时, "ack"、"nack" 和 "reject" 实际上是不可能的。
rabbitmq不支持在 "no-ack" 模式下 nacking 或 rejection 来自消费者的消息。这意味着错误处理和未处理的消息策略将无法重新回队。
> !IMPORTANT!: ack, nack and reject are effectively noOps when a queue's `noAck` is set to `true`. RabbitMQ does not support nacking or rejection of messages from consumers in `no-ack` mode. This means that error handling and unhandled message strategies won't be able to re-queue messages.

### Options
If using the first form, the options hash can contain the following properties, defaults shown:
使用第一个格式，应该参照如下格式

```js
{
  queue: "*", // only handle messages from the queue with this name
  type: "#", // handle messages with this type name or pattern
  autoNack: true, // automatically handle exceptions thrown in this handler
  context: null, // control what `this` is when invoking the handler
  handler: null // allows you to just pass the handle function as an option property ... because why not?
}
```

> Notes:
> * using options without a `queue` or `type` specified will handle _all_ messages received by the service because of the defaults.
> * the behavior here differs in that exceptions are handled for you _by default_

> * 使用没有指定 "队列" 或 "类型" 的选项将处理服务由于默认值而收到的 全部 消息。
> * 这里的行为不同的是, 默认情况下, 异常是为您处理的

### Explicit Error Handling
In this example, any possible error is caught in an explicit try/catch:

```javascript
var handler = rabbit.handle( "company.project.messages.logEntry", function( message ) {
  try {
    // do something meaningful?
    console.log( message.body );
    message.ack();
  } catch( err ) {
    message.nack();
  }
} );

handler.remove();
```

### Automatically Nack On Error

This example shows how to have rabbot wrap all handlers with a try catch that:

 * nacks the message on error
 * console.log that an error has occurred in a handle

```javascript
// after this call, any new callbacks attached via handle will be wrapped in a try/catch
// that nacks the message on an error
rabbit.nackOnError();

var handler = rabbit.handle( "company.project.messages.logEntry", function( message ) {
  console.log( message.body );
  message.ack();
} );

handler.remove();

// after this call, new callbacks attached via handle will *not* be wrapped in a try/catch
// 在此调用后, 通过句柄附加的新回调将  不 包装在 try/catch
rabbit.ignoreHandlerErrors();
```

### Late-bound Error Handling

Provide a strategy for handling errors to multiple handles or attach an error handler after the fact.
提供处理多个句柄错误或事后附加错误处理程序的策略。
```javascript
var handler = rabbit.handle( "company.project.messages.logEntry", function( message ) {
  console.log( message.body );
  message.ack();
} );

handler.catch( function( err, msg ) {
  // do something with the error & message
  msg.nack();
} );
```

### !!! IMPORTANT !!! ####
Failure to handle errors will result in silent failures and lost messages.
如果不能处理错误, 将导致静默失败和消息丢失。
## Unhandled Messages

The default behavior is that any message received that doesn't have any elligible handlers will get `nack`'d and sent back to the queue immediately.
默认行为是, 收到的任何没有任何可使用的处理程序的消息都将得到 "nack" 并立即发送回队列。
> Caution: this can create churn on the client and server as the message will be redelivered indefinitely!

To avoid unhandled message churn, select one of the following mutually exclusive strategies:
警告: 这可能会在客户端和服务器上创建改动, 因为消息将无限期地重新传递!
若要避免未处理的message改动, 请选择以下互斥策略之一:
### `rabbot.onUnhandled( handler )`

```javascript
rabbit.onUnhandled( function( message ) {
   // handle the message here
} );
```

### `rabbot.nackUnhandled()` - default

Sends all unhandled messages back to the queue.
将所有未处理的消息发送回队列。
```javascript
rabbit.nackUnhandled();
```

### `rabbot.rejectUnhandled()`

Rejects unhandled messages so that will will _not_ be requeued. **DO NOT** use this unless there are dead letter exchanges for all queues.
将拒绝未处理的邮件, 以便将不会被重新排队。* * 不要 * * 使用这个, 除非有死信交换接收所有队列。
```javascript
rabbit.rejectUnhandled();
```

## Returned Messages

Unroutable messages that were published with `mandatory: true` will be returned. These messages cannot be ack/nack'ed.
将返回使用 "mandatory: true" 发布的不可路由的消息。这些消息不能被 ack | nack。
### `rabbot.onReturned( handler )`

```javascript
rabbit.onReturned( function( message ) {
   // the returned message
} );
```

## `rabbot.startSubscription( queueName, [exclusive], [connectionName] )`

> Recommendation: set handlers for anticipated types up before starting subscriptions.
> 建议: 在开始订阅之前为预期类型设置处理程序。
Starts a consumer on the queue specified.

 * `exclusive` - makes it so that _only_ this process/connection can consume messages from the queue.
 * `connectionName` - optional arg used when subscribing to a queue on a connection other than `"default"`.
* "exclusive"-使其使只有此进程||连接可以消费队列中的消息。
 * "connectionName"-在 "default" 以外的连接上订阅队列时使用的可选参数。
> Caution: using exclusive this way will allow your process to effectively "block" other processes from subscribing to a queue your process did not create. This can cause channel errors and closures on any other processes attempting to subscribe to the same queue. Make sure you know what you're doing.
警告: 使用这种方式的独占将允许您的进程有效地 "阻止" 其他进程订阅到您的进程没有创建的队列。这可能会导致在试图订阅同一队列的任何其他进程上出现通道错误和闭包。一定要知道你在做什么。
## Message Format

The following structure shows and briefly explains the format of the message that is passed to the handle callback:
下面的结构显示并简要说明了传递给句柄回调的消息的格式:
```javascript
{
  // metadata specific to routing & delivery
  fields: {
    consumerTag: "", // identifies the consumer to rabbit
    deliveryTag: #, // identifies the message delivered for rabbit
    redelivered: true|false, // indicates if the message was previously nacked or returned to the queue
    exchange: "" // name of exchange the message was published to,
    routingKey: "" // the routing key (if any) used when published
  },
  properties:{
    contentType: "application/json", // see serialization for how defaults are determined
    contentEncoding: "utf8", // rabbot's default
    headers: {}, // any user provided headers
    correlationId: "", // the correlation id if provided
    replyTo: "", // the reply queue would go here
    messageId: "", // message id if provided
    type: "", // the type of the message published
    appId: "" // not used by rabbot
  },
  content: { "type": "Buffer", "data": [ ... ] }, // raw buffer of message body
  body: , // this could be an object, string, etc - whatever was published
  type: "" // this also contains the type of the message published
  quarantine: true|false // indicates the message arrived on a poison queue 指示消息到达了中毒队列
}

{
  "fields": {
    "consumerTag": "duoyi./home/duoyi/node-v8.11.3-linux-x64/bin/node.7173.q.1",
    "deliveryTag": 2,
    "redelivered": false,
    "exchange": "ex.1",
    "routingKey": "MyMessage"
  },
  "properties": {
    "contentType": "text/plain",
    "contentEncoding": "utf8",
    "headers": {},
    "correlationId": "",
    "replyTo": "customReplyQueue",
    "messageId": "",
    "timestamp": 1556589276769,
    "type": "MyMessage",
    "appId": "duoyi./home/duoyi/node-v8.11.3-linux-x64/bin/node.7173"
  },
  "content": {
    "type": "Buffer",
    "data": [
      104,
      101,
      108,
      108,
      111,
      33
    ]
  },
  "type": "MyMessage",
  "queue": "q.1",
  "body": "hello!"
}
```

## `rabbot.stopSubscription( queueName, [connectionName] )`

> !Caution!:
> * This does not affect bindings to the queue, it only stops the flow of messages from the queue to your service.
> * If the queue is auto-delete, this will destroy the queue, dropping messages and losing any messages sent that would have been routed to it.
> * If a network disruption has occurred or does occur, subscription will be restored to its last known state.
> !谨慎！：
> * 这不会影响对队列的绑定, 它只会停止消息从队列流向服务。
> * 如果队列是自动删除的, 这将销毁队列, 删除消息, 并丢失发送的任何路由到它消息。
> * 如果发生或确实发生了网络中断, 订阅将恢复到其最后一个已知状态。

Stops consuming messages from the queue. Does not explicitly change bindings on the queue. Does not explicitly release the queue or the channel used to establish the queue. In general, Rabbot works best when queues exist for the lifetime of a service. Starting and stopping queue subscriptions is likely to produce unexpected behaviors (read: avoid it).
停止消费来自队列的消息。不显式更改队列上的绑定。不显式释放用于建立队列的队列或通道。通常, 当队列存在服务的生存期时, Rabbot 的效果最佳。启动和停止队列订阅可能会产生意外行为 (阅读: 避免这种行为)。
## Message API
rabbot defaults to (and assumes) queues are in ack mode. It batches ack and nack operations in order to improve total throughput. Ack/Nack calls do not take effect immediately.
rabbot默认 (并假定) 队列处于 ack 模式。它对操作进行批处理和堆叠, 以提高总吞吐量。Ack nack 呼叫不会立即生效。
### `message.ack()`
Enqueues the message for acknowledgement.

### `message.nack()`
Enqueues the message for rejection. This will re-enqueue the message.

### `message.reject()`
Rejects the message without re-queueing it. Please use with caution and consider having a dead-letter-exchange assigned to the queue before using this feature.
拒绝message而不重新排队。在使用此功能之前, 请谨慎使用, 并考虑将死信交换分配给队列。
### `message.reply( message, [options] )`
Acknowledges the messages and sends the message back to the requestor. The `message` is only the body of the reply.

The options hash can specify additional information about the reply and has the following properties (defaults shown:
确认消息并将消息发送回请求者。"message" 只是答复的正文。
选项hash可以指定有关答复的其他信息, 并具有以下属性 (显示默认值:

```javascript
{
  more: `false`, // lets the recipient know more messages are coming as part of this response
  replyType: `initial message type + ".reply"`, // lets the recipient know the type of reply
  contentType: `see serialization for defaults`, // lets you control what serializer is used,
  headers: {}, // allows for custom headers to get added to the reply
}
```

### Queues in `noBatch` mode 不批量的模式
rabbot now supports the ability to put queues into non-batching behavior. This causes ack, nack and reject calls to take place against the channel immediately. This feature is ideal when processing messages are long-running and consumer limits are in place. Be aware that this feature does have a significant impact on message throughput.
rabbot现在支持将队列放入非批处理行为的能力。这将导致立即对通道进行ack, nack 和reject。当处理消息长时间运行且使用者限制到位时, 此功能是理想的选择。请注意, 此功能确实会对消息吞吐量产生重大影响。
## Reply Queues
By default, rabbot creates a unique reply queue for each connection which is automatically subscribed to and deleted on connection close. This can be modified or turned off altogether.
默认情况下, rabbot 为每个连接创建一个唯一的答复队列, 该队列在连接关闭时自动订阅和删除。这可以完全修改或关闭。
Changing the behavior is done by passing one of three values to the `replyQueue` property on the connection hash:
更改行为是通过将三个值之一传递到连接哈希上的 "replyQueue" 属性来完成的:
> !!! IMPORTANT !!! rabbot cannot prevent queue naming collisions across services instances or connections when using the first two options.
> !!!重要！！！在使用前两个选项时, rabbot 无法防止跨服务实例或连接的队列命名冲突。
### Custom Name
Only changes the name of the reply queue that rabbot creates - `autoDelete` and `subscribe` will be set to `true`.
只有更改了 rabbot 创建的答复队列的名称-"自动删除" 和 "订阅" 将被设置为 "true"。
```javascript
rabbit.addConnection( {
  // ...
  replyQueue: "myOwnQueue"
} );
```

### Custom Behavior
To take full control of the queue name and behavior, provide a queue definition in place of the name.
若要完全控制队列名称和行为, 请提供队列定义以代替名称。
> rabbot provides no defaults - it will only use the definition provided
> rabbot 不提供默认值-它将只使用提供的定义
```javascript
rabbit.addConnection( {
  // ...
  replyQueue: {
    name: "myOwnQueue",
    subscribe: true,
    durable: true
  }
} );
```

## No Automatic Reply Queue
> Only pick this option if request/response isn't in use or when providing a custom overall strategy
> 仅在请求/响应未在使用中 或 提供自定义总体策略时选择此选项
```javascript
rabbit.addConnection( {
  // ...
  replyQueue: false
} );
```

## Custom Serializers

Serializers are objects with a `serialize` and `deserialize` method and get assigned to a specific content type. When a message is published or received with a specific `content-type`, rabbot will attempt to look up a serializer that matches. If one isn't found, an error will get thrown.

> Note: you can over-write rabbot's default serializers but probably shouldn't unless you know what you're doing.
序列化程序是具有 "序列化" 和 "反序列化" 方法的对象, 并被分配到特定的内容类型。当发布或接收具有特定 "内容类型" 的消息时, rabbot 将尝试查找匹配的序列化程序。如果找不到一个, 将引发错误。

> 注意: 您可以覆盖 rabbot 的默认序列化程序, 但可能不应该, 除非您知道您在做什么。

### `rabbot.serialize( object )`

The serialize function takes the message content and must return a Buffer object encoded as "utf8".
序列化函数获取消息内容, 并且必须返回编码为 "utf8" 的缓冲区对象。
### `rabbot.deserialize( bytes, encoding )`

The deserialize function takes both the raw bytes and the encoding sent. While "utf8" is the only supported encoding rabbot produces, the encoding is passed in case the message was produced by another library using a different encoding.
反序列化函数同时接受原始字节和发送的编码。虽然 "utf8" 是唯一受rabbot支持的编码, 但如果消息是由另一个库使用不同的编码生成的, 则会传递编码。
### `rabbot.addSerializer( contentType, serializer )`

```javascript
var yaml = require( "js-yaml" );

rabbit.addSerializer( "application/yaml", {
  deserialize: function( bytes, encoding ) {
    return yaml.safeLoad( bytes.toString( encoding || "utf8" ) );
  },
  serialize: function( object ) {
    return new Buffer( yaml.dump( object ), "utf8" );
  }
} );
```

## Failed Serialization

Failed serialization is rejected without requeueing. If you want to catch this, you must:
在没有重新查询的情况下, 失败的序列化将被拒绝。如果您想抓住这一点, 您必须:
 * assign a deadletter exchange (DLX) to your queues
 * bind the deadletter queue (DLQ) to the DLX
 * mark the DLQ with `poison: true`
 * handle one of the topic forms:
   * `original.topic.#` - regular and quarantined messages
   * `original.topic.*` - regular and quarantined messages
   * `original.topic.quarantined` - one topic's quarantined messages
   * `#.quarantined` - all quarantined messages

 * 将死信交换 (DLX) 分配给您的队列
 * 将死信队列 (DLQ) 绑定到 DLX
 * 用 "poison: true" 标记 DLQ
 * 处理其中一个主题:
   * "original.topic.#"-常规和隔离的消息
   * "original.topic.×"-常规和隔离的消息
   * "original.topic.quarantined"-一个主题的隔离消息
   * "#. quarantined"-所有隔离的邮件
If your handler is getting both regular and quarantined messages, be sure to check the `quarantined` flag on the message to avoid trying to handle it like a usual message (since it will not be deserialized).
如果处理程序同时获取常规消息和隔离消息, 请务必检查消息上的 "quarantined" 标志, 以避免尝试像通常的消息一样处理它 (因为它不会被反序列化)。
### Rationale

Without this approach, nacking a message body that cannot be processed causes the message to be continuously requeued and reprocessed indefinitely and can cause a queue to fill with garbage.
如果不使用此方法, 则 nacking 无法处理的消息正文会导致消息被连续重新排队并无限期地重新处理, 并可能导致队列充满垃圾。