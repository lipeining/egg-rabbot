# 连接管理

这份文档包含下列内容:

 * 关于如何连接到一个rabbitmq broker的API方法
 * 连接选项
 * 连接事件
 * 连接质量如何影响发送和接收功能

## `rabbot.addConnection ( options )`

该方法返回一个promise对象，可以用于判断连接是否已经成功
选项包括以下内容：
| option | description | default  |
|--:|:--|:--|
| **uri** | AMQP URI. 非默认. This will be parsed and missing defaults will be supplied. |   |
| **name** | the name of this connection. | `"default"` |
| **host** | the IP address or DNS name of the RabbitMQ server. | `"localhost"` |
| **port** | the TCP/IP port on which RabbitMQ is listening. | `5672` |
| **vhost** | the named vhost to use in RabbitMQ. | `"%2f"` ~ `"/"` |
| **protocol** | the connection protocol to use. | `"amqp://"` |
| **user** | the username used for authentication / authorization with this connection | `"guest"` |
| **pass** | the password for the specified user. | `"guest"` |
| **timeout** | how long to wait for a connection to be established in milliseconds. | `2000` |
| **heartbeat** | how often the client and server check to see if they can still reacheach other, specified in seconds. | `30` |
| **replyQueue** | the name of the reply queue to use. | unique to the process |
| **publishTimeout** | the default timeout in milliseconds for a publish call. | |
| **replyTimeout** | the default timeout in milliseconds to wait for a reply. | |
| **failAfter** | limits how long rabbot will attempt to connect (in seconds). | `60` |
| **retryLimit** | limits how many consecutive failed attempts rabbot will make. | `3` |
| **waitMin** | 开始连接之前等待时间how long to delay (in ms) before initial reconnect. | `0` |
| **waitMax** | 每次重连的最大等待时间maximum delay (in ms) between retry attempts. | `5000` |
| **waitIncrement** | 每次重连的等待时间增长值how much to increase the delay (in ms) with each retry attempt. | `100` |
| **clientProperties** | custom client properties which show up under connection in the management console. | |

Note that the "default" connection (by name) is used when any method is called without a connection name supplied.

__Options Example__
```javascript
rabbit.addConnection( {
  user: "someUser",
  pass: "sup3rs3cr3t",
  host: "my-rqm.server",
  port: 5672,
  timeout: 2000,
  vhost: "%2f",
  heartbeat: 10,
  clientProperties: {
    service: "my-awesome-service"
  }
} );
```

__Equivalent URI Example__
```javascript
rabbit.addConnection( {
  uri: "amqp://someUser:sup3rs3cr3t@my-rqm.server:5672/%2f?heartbeat=10"
} );
```

## `failAfter` and `retryLimit`

rabbot will stop trying to connect/re-connect if either of these thresholds is reached (whichever comes first).

## `clientProperties`

The client properties are shown in the RabbitMQ management console under a specific connection. This is an example of the default client properties provided by rabbot:

```json
{
  "lib": "rabbot - 1.0.6",
  "process": "node (pid: 14)",
  "host": "my-pc (linux x64)"
}
```

By setting `clientProperties` you extend that list with your custom properties. E.g. it can be used to identify which service a connection belongs to.

## Cluster Support

rabbot provides the ability to define multiple nodes per connections by supplying either a comma delimited list or array of server IPs or names to the `host` property. You can also specify multuple ports in the same way but make certain that either you provide a single port for all servers or that the number of ports matches the number and order of servers.

rabbot 通过向 "host" 属性提供以逗号分隔的列表或服务器 ip 或名称数组, 提供了为每个连接定义多个节点的能力。您还可以以相同的方式指定多个端口, 但请确保为所有服务器提供单个端口, 或者端口的数量与服务器的数量和顺序相匹配。

## Shutting Down

Both exchanges and queues have asynchronous processes that work behind the scenes processing publish confirms and batching message acknowledgements. To shutdown things in a clean manner, rabbot provides a `shutdown` method that returns a promise which will resolve once all outstanding confirmations and batching have completed and the connection is closed.
exchanges和queues都有在后台处理发布确认和批处理消息确认的异步进程。为了以干净的方式关闭的东西, rabbot提供了一个 "shutdown" 的方法, 返回一个promise, 一旦所有未完成的确认和批处理已完成, promise将resolve,同时连接关闭。
## Events

rabbot emits both generic and specific connectivity events that you can bind to in order to handle various states:

* Any Connection
 * `connected` - connection to a broker succeeds
 * `closed` - connection to a broker has closed (intentional)
 * `failed` - connection to a broker was lost (unintentional)
 * `unreachable` - connection failures have reached the limit, no further attempts will be made
* Specific Connection
 * `[connectionName].connection.opened`
 * `[connectionName].connection.closed`
 * `[connectionName].connection.failed`
 * `[connectionName].connection.configured` - emitted once all exchanges, queues and bindings are resolved

The connection object is passed to the event handler for each event. Use the `name` property of the connection object to determine which connection the generic events fired for.

> !IMPORTANT! - rabbot handles connectivity for you, mucking about with the connection directly isn't supported, *just don't*.
> 重要，rabbot底层会管理全部的连接事件，然后传递出来，你不能直接到每一个connection对象上进行事件处理。

## Managing Connections - Retry, Close and Shutdown

These methods should not see regular use inside of a typical long-running service unless you have a highly specialized use-case where you can pre-empt error conditions effectively and perform a graceful shutdown.

Realize that this is rare and that it's ok for services to fail and restart by a service management layer or cluster orchestration (Docker, especially in the context of something like Kubernetes).

During intentional connection close or shutdown, rabbot will attempt to resolve all outstanding publishes and recieved messages (ack/nack/reject) before closing the channels and connection intentionally. If you would like to defer certain actions until after everything has been safely resolved, then use the promise returned from either close call.

> !!! CAUTION !!! - passing reset is dangerous. All topology associated with the connection will be removed locally meaning rabbot will _not_ be able to re-establish it all should you decide to reconnect. It's really there to support integration teardown.

### `rabbot.close( [connectionName], [reset] )`

Closes the connection, optionally resetting all previously defined topology for the connection. The `connectionName` is `default` if one is not provided.

### `rabbot.closeAll( [reset] )`

Closes __all__ connections, optionally resetting the topology for all of them.

### `rabbot.retry()`

After an `unhandled` event is raised by rabbot, not further attempts to connect will be made unless `retry` is called.

It's worth noting that you should be pairing this with monitoring and alerting on your Broker so that you aren't relying on indefinite retry. Your goal should not be services that never restart. Your goal should be building systems resilient to failures (by allowing them to crash and restart gracefully).

```js
// How to create a zombie
var rabbit = require( "rabbot" );

rabbit.on( "unreachable", function() {
  rabbit.retry();
} );

```

### `rabbot.shutdown()`

Once a connection is established, rabbot will keep the process running unless you call `shutdown`. This is because most services shouldn't automatically shutdown at the first accidental disconnection`. Shutdown attempts to provide the same guarantees as close - only allowing the process to exit after publishing and resolving received messages.

## AMQPS, SSL/TLS Support

Providing the following configuration options setting the related environment varibles will cause rabbot to attempt connecting via AMQPS. For more details about which settings perform what role, refer to the amqplib's page on [SSL](http://www.squaremobius.net/amqp.node/doc/ssl.html).

```javascript
  connection: {     // sample connection hash
    caPath: "",   // comma delimited paths to CA files. RABBIT_CA
    certPath: "",   // path to cert file. RABBIT_CERT
    keyPath: "",  // path to key file. RABBIT_KEY
    passphrase: "", // passphrase associated with cert/pfx. RABBIT_PASSPHRASE
    pfxPath: ""   // path to pfx file. RABBIT_PFX
  }
```

## Details about publishing & subscribing related to connectivity

### Publishing

For exchanges in confirm mode (the default), rabbot will attempt to retain messages you publish during the attempt to connect which it will publish if a connection can be successfully established. It is important to handle rejection of the publish. Only resolved publishes are guaranteed to have been delivered to the broker.

Rabbot limits the number of messages it will retain for each exchange to 100 by default. After the limit is reached, all further publishes will be rejected automatically. This limit was put in place to prevent unbounded memory consumption.

对于在确认模式下的exchange (default), rabbot 将尝试保留您在尝试连接期间发布的消息, 如果可以成功建立连接, 它将发布这些消息。处理对发布的拒绝是很重要的。只有已解决的发布 可以保证交付给broker。

rabbot将其为每次交换保留的消息数量限制为默认情况下为100。达到限制后, 所有进一步发布的信息将被自动拒绝。设置此限制是为了防止无限制的内存消耗。
### Subscribing

The default batch acknowledgement behavior is the default mode for all queues unless you turn off acknowledgements or turn off batching.

> Warning: batching, while complicated, pays off in terms of throughput and decreased broker load.

If a connection is lost before all the batched resolutions (acks, nacks, rejections) have completed, the unresolved messages will be returned to their respective queues and be delivered to the next consumer. _This is an unavoidable aspect of "at least once delivery"; rabbot's default behavior._

If this is undesirable, your options are to turn of acknowledgements (which puts you in "at most once delivery") or turn off batching (which will incur a significant perf penalty in terms of service throughput and broker load).

默认批处理确认行为是所有队列的默认模式, 除非您关闭确认或关闭批处理。

警告: 批处理虽然复杂, 但在吞吐量和减少代理负载方面会有回报。

rabbot的默认行为：如果在所有批处理 (ackan、nacks、rejections) 完成之前丢失了连接, 则未解析的消息将返回到各自的队列并传递给下一个使用者。_这是 "至少一次交付" 的一个不可避免的方面。

如果这是不可取的, 你可以选择关闭确认 (这让你"最多一次交付"被退回) 
或关闭批处理 (这将招致重大的津贴, 在服务吞吐量和代理负载方面)。