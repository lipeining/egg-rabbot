# Managing Topology

## Configuration via JSON (recommended)

This is the recommended approach to creating topology with rabbot. Configuration should only happen once per service. If a disconnect takes place, rabbot will attempt to re-establish the connection and all topology, including previously established subscriptions.
这是使用rabbot创建拓扑的推荐方法。每个服务的配置只能进行一次。如果发生断开连接, rabbot 将尝试重新建立连接和所有拓扑, 包括以前建立的订阅。
> Note: setting subscribe to true will result in subscriptions starting immediately upon queue creation; be sure to have handlers created *before hand*.
注: 将订阅设置为 true 将导致订阅在队列创建后立即开始;一定要有在subscriptions之前创建的处理程序handlers。
This example shows most of the available options described above.
```javascript
  var settings = {
    connection: {
      user: "guest",
      pass: "guest",
      server: "127.0.0.1",
      // server: "127.0.0.1, 194.66.82.11",
      // server: ["127.0.0.1", "194.66.82.11"], // 多结点模式
      port: 5672,
      timeout: 2000,
      vhost: "%2fmyhost"
      },
    exchanges:[
      { name: "config-ex.1", type: "fanout", publishTimeout: 1000 },
      { name: "config-ex.2", type: "topic", alternate: "alternate-ex.2", persistent: true },
      { name: "dead-letter-ex.2", type: "fanout" }
      ],
    queues:[
      { name:"config-q.1", limit: 100, queueLimit: 1000 },
      { name:"config-q.2", subscribe: true, deadLetter: "dead-letter-ex.2" }
      ],
    bindings:[
      { exchange: "config-ex.1", target: "config-q.1", keys: [ "bob","fred" ] },
      { exchange: "config-ex.2", target: "config-q.2", keys: "test1" }
    ]
  };
```

To establish a connection with all settings in place and ready to go call configure:
```javascript
  var rabbit = require( "rabbot" );

  rabbit.configure( settings ).done( function() {
    // ready to go!
  } );
```

## `rabbot.addExchange( exchangeName, exchangeType, [options], [connectionName] )`

The call returns a promise that can be used to determine when the exchange has been created on the server.
调用返回可用于确定何时在服务器上创建交换的promise。
Valid exchangeTypes:
 * 'direct'
 * 'fanout'
 * 'topic'

Options is a hash that can contain the following:

| option | type | description | default  |
|--:|:-:|:--|:-:|
| **autoDelete** | boolean | delete when consumer count goes to 0 | `false` |
| **durable** | boolean | survive broker restarts | `false` |
| **persistent** | boolean | a.k.a. persistent delivery, messages saved to disk | `false` |
| **alternate** | string |  define an alternate exchange 定义备用交换 | |
| **publishTimeout** | 2^32 | timeout in milliseconds for publish calls to this exchange ||
| **replyTimeout** | 2^32 | timeout in milliseconds to wait for a reply | |
| **limit** | 2^16 | the number of unpublished messages to cache while waiting on connection 等待连接时要缓存的未发布消息数 | |
| **noConfirm** | boolean | prevents rabbot from creating the exchange in confirm mode | `false` |

## `rabbot.addQueue( queueName, [options], [connectionName] )`

The call returns a promise that can be used to determine when the queue has been created on the server.

Options is a hash that can contain the following:

| option | type | description | default  |
|--:|:-:|:--|:-:|
| **autoDelete** | boolean | delete when consumer count goes to 0 | |
| **durable** | boolean | survive broker restarts | false |
| **exclusive** | boolean | limits queue to the current connection only (danger) | false |
| **subscribe** | boolean | auto-start the subscription | false |
| **limit** | 2^16 |max number of unacked messages allowed for consumer | |
| **noAck** | boolean | the server will remove messages from the queue as soon as they are delivered | false |
| **noBatch** | boolean | causes ack, nack & reject to take place immediately | false |
| **noCacheKeys** | boolean | disable cache of matched routing keys to prevent unbounded memory growth  禁用匹配的路由密钥缓存, 以防止无限内存增长 | false |
| **queueLimit** | 2^32 |max number of ready messages a queue can hold | |
| **messageTtl** | 2^32 |time in ms before a message expires on the queue  队列上的消息过期前的时间 (毫秒) | |
| **expires** | 2^32 |time in ms before a queue with 0 consumers expires | |
| **deadLetter** | string | the exchange to dead-letter messages to | |
| **deadLetterRoutingKey** | string | the routing key to add to a dead-lettered message
| **maxPriority** | 2^8 | the highest priority this queue supports | |
| **unique** | `"hash", `"id", "consistent"` | creates a unique queue name by including the client id or hash in the name  通过在名称中包含客户端 id 或哈希来创建唯一的队列名称 | |
| **poison** | boolean | indicates that this queue is specifically for poison / rejected messages 表示此队列专门用于有害/被拒绝的消息| false |

### unique

The unique option has 3 different possible values, each with its own behavior:

 * `hash` - results in a unique positive integer per process. Use when queue recovery is not a concern.
 * `consistent` - results in a unique positive integer based on machine name and process title. Use when queue recovery is required.
 * `id` - creates a consumer tag consisting of the machine name, process title and process id. Use when readability is desired and queue recovery is not a concern.
 * "哈希"-每个进程产生一个唯一的正整数。当不需要考虑队列恢复时使用。
 * "一致"-基于机器名称和流程标题生成唯一的正整数。在需要队列恢复时使用。
 * "id"-创建由机器名称、进程标题和进程 id 组成的使用者标记。在需要可读性且不需要考虑队列恢复时使用。
> Note: the concept of queue recovery is that the same queue name will be generated in the event of a process restart. If using `hash` or `id`, the pid is used and a different queue name will be generated each time the process starts.
注意: 队列恢复的概念是, 在进程重新启动的情况下, 将生成相同的队列名称。如果使用 "哈希" 或 "id", 则使用 pid, 并且每次进程启动时都会生成不同的队列名称。
You can specify unique queues by their friendly-name when handling and subscribing. To get the actual assigned queue name (which you should not need), you can use:
在处理和订阅时, 可以通过其友好名称指定唯一队列。若要获取实际分配的队列名称 (不应需要), 可以使用:
```js
const realQueueName = rabbot.getQueue('friendly-q-name').uniqueName;
```

### poison

If you want to capture instances where messages have no serializer or failed to deserialize properly, you can create a dead-letter exchange and bind it to a queue where you set `poison: true` so that in the event of further errors, rabbot will continue to deliver the message without deserialization.
如果要捕获消息没有序列化程序或无法正确反序列化的实例, 可以创建死信交换并将其绑定到设置 "posion: true" 的队列中, 以便在发生进一步错误时, rabbot 将继续传递消息, 而不反序列化。
 * `body` will be set to the raw Buffer
 * `quarantine` will be set to `true` as well

## `rabbot.bindExchange( sourceExchange, targetExchange, [routingKeys], [connectionName] )`

Binds the target exchange to the source exchange. Messages flow from source to target.
将目标交换绑定到源交换。消息从源流向目标。
## `rabbot.bindQueue( sourceExchange, targetQueue, [routingKeys], [connectionName] )`

Binds the target queue to the source exchange. Messages flow from source to target.

## `rabbot.purgeQueue( queueName, [connectionName] )`

Returns a promise that will resolve to the number of purged messages. Purging is a very complicated operation and should not be used without an appreciation for nuances in how amqp delivery and rabbot's ack system works.
返回将解析为已清除消息数的promise。清除是一个非常复杂的操作, 在 对 如何amqp交付和rabbot的ack系统的工作有一个细微差别之前, 不应该使用
When purge is called in rabbot, first it checks to see if any messages are in the queue before it bothers moving on to try to purge. "That's a race condition!" - right, but so is purging.
当在rabbot中调用清除时, 首先它检查队列中是否有任何消息, 然后再费心继续尝试清除。"这是一个比赛条件!"-正确的, 但也是如此。
Purging in rabbot does _not_ remove the queue bindings for you. **If** the queue is marked as `autoDelete: true`, rabbot cannot even stop the subscription for you because doing so will cause the queue to be deleted, removing its bindings and any upstream exchanges bound to it marked with `autoDelete: true` that don't have other bindings at the moment.
在rabbot里清除并不为您删除队列绑定。* * 如果队列标记为 "autoDelete: true", 那么rabbot甚至无法为您停止订阅, 因为这样做将导致队列被删除, 删除其绑定和任何上游交换绑定到它标记为 "autoDelete: true", 在那一刻没有其他绑定的队列。
In the even that the queue isn't `autoDelete`, the subscription will be halted for the duration of the purge operation and then rabbot will attempt to re-establish subscription to the queue after.
即使队列不是 "自动删除", 订阅也将在清除操作期间停止, 然后 rabbot 将尝试重新建立对队列的订阅。
Anytime lots of operations are taking place against an amqp channel, there are opportunities for unexpected behaviors in terms of message arrival or even channel loss. It's important to understand the context you're in when calling `purgeQueue` and I recommend limiting its application.
每当针对 amqp 通道进行大量操作时, 就会出现消息到达甚至信道丢失方面出现意外行为的机会。在调用 "PurgeQueue" 时了解您所处的上下文是很重要的, 我建议限制它的应用程序。
## Channel Prefetch Limits

rabbot mostly hides the notion of a channel behind the scenes, but still allows you to specify channel options such as the channel prefetch limit. Rather than specifying
this on a channel object, however, it is specified as a `limit` on a queue defintion.
rabbot隐藏大多在幕后的通道的概念, 但仍然允许您指定通道选项, 如通道预取限制。而不是指定
但是, 在通道对象上, 它被指定为队列定义上的 "limit"。
```js
queues: [{
  // ...

  limit: 5
}]

// or

rabbit.addQueue( "some.q", {
  // ...

  limit: 5
});
```

This queue configuration will set a prefetch limit of 5 on the channel that is used for consuming this queue.
此队列配置将在用于使用此队列的通道上设置5的预取限制。
**Note:** The queue `limit` is not the same as the `queueLimit` option - the latter of which sets the maximum number of messages allowed in the queue.
* * 注意: * * 队列 "限制" 与 "队列限制" 选项不同-后者设置队列中允许的最大消息数。

