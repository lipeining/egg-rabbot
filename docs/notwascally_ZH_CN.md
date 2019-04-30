## Differences from `wascally`

If you used wascally, rabbot's API will be familiar, but the behavior is quite different. This section explains the differences in behavior and design.

### Let it fail

A great deal of confusion and edge cases arise from how wascally managed connectivity. Wascally treated any loss of connection or channels equally. This made it hard to predict behavior as a user of the library since any action taken against the API could trigger reconnection after an intentional shutdown. It also made it impossible to know whether a user intended to reconnect a closed connection or if the reconnection was the result of a programming error.

大量的混乱和边缘情况产生于wascally如何管理连接。wascally以同等方式处理连接或通道的任何丢失。这使得作为库的用户很难预测行为, 因为针对 API 采取的任何操作都可能在有意关机后触发重新连接。这也使得无法知道用户是否打算重新连接已关闭的连接, 或者只是程序错误导致重新连接。

Rabbot does not re-establish connectivity automatically after connections have been intentionally closed _or_ after a failure threshold has been passed. In either of these cases, making API calls will either lead to rejected or indefinitely deferred promises. You, the user, must intentionally re-establish connectivity after closing a connection _or_ once rabbot has exhausted its attempts to connect on your behalf.

在通过故障阈值后或者在有意关闭连接后, rabbot不会自动重新建立连接。在这两种情况下, 进行 API 调用都会导致拒绝或无限期推迟承诺。一旦rabbot用尽了代表您进行连接的尝试, 用户必须有意重新建立连接在关闭连接。

*The recommendation is*: if rabbot tells you it can't reach rabbot after exhausting the configured retries, shut your service down and let your monitoring and alerting tell you about it. The code isn't going to fix a network or broker outage by retrying indefinitely and filling up your logs.

* 建议: 如果rabbot告诉你, 用尽配置的重试之后仍然无法建立连接, 那么关闭您的服务, 让您的监控, 并提醒你。该代码不会修复网络或代理中断，这样只会无限期地重试和填满您的日志。

### No more indefinite retention of unpublished messages

Wascally retained published messages indefinitely until a connection and all topology could be established. This meant that a service unable to connect could produce messages until it ran out of memory. It also meant that wascally could reject the promise returned from the publish call but then later publish the message without the ability to inform the caller.

在建立连接和所有拓扑之前, 将无限期地保留已发布的消息。这意味着无法连接的服务可能会生成消息, 直到它的内存不足。这也意味着 wascally 可以拒绝从发布调用返回的承诺, 但随后发布消息, 而无法通知调用方。

When a connection is lost, or the `unreachable` event is emitted, all promises for publish calls are rejected and all unpublished messages are flushed. Rabbot will not provide any additional features around unpublishable messages - there are no good one-size-fits-all behaviors in these failure scenarios and it is important that developers understand and solve these needs at the service level for their use case.

当连接丢失或发出 "无法访问" 事件时, 发布调用的所有承诺都将被拒绝, 所有未发布的消息都将被刷新。rabbot不会围绕不可发布的消息提供任何其他功能-在这些故障方案中没有良好的一刀切行为, 让开发人员了解并解决其用例的服务级别的错误是非常重要。
