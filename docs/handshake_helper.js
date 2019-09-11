
// 读取一个frame，如果出错，抛出错误
// 如果当前读不到，等到下一个readable事件时再读取。
// 只有真正的拿到数据后才返回。回调原则。
C.step = function(cb) {
    var self = this;
    function recv() {
      var f;
      try {
        f = self.recvFrame();
      }
      catch (e) {
        cb(e, null);
        return;
      }
      if (f) cb(null, f);
      else self.stream.once('readable', recv);
    }
    recv();
  };

/*
  The frighteningly complicated opening protocol (spec section 2.2.4):

     Client -> Server

       protocol header ->
         <- start
       start-ok ->
     .. next two zero or more times ..
         <- secure
       secure-ok ->
         <- tune
       tune-ok ->
       open ->
         <- open-ok

If I'm only supporting SASL's PLAIN mechanism (which I am for the time
being), it gets a bit easier since the server won't in general send
back a `secure`, it'll just send `tune` after the `start-ok`.
(SASL PLAIN: http://tools.ietf.org/html/rfc4616)

*/
//  一个链接的建立过程！！！
C.open = function(allFields, openCallback0) {
    var self = this;
    var openCallback = openCallback0 || function() {};

    // This is where we'll put our negotiated values
    var tunedOptions = Object.create(allFields);

    // 传入一个处理frame的函数，在channel:0的handshake中处理frame。
    // 因为channel:0就是control的channel
    function wait(k) {
        self.step(function(err, frame) {
        if (err !== null) bail(err);
        else if (frame.channel !== 0) {
            bail(new Error(
            fmt("Frame on channel != 0 during handshake: %s",
                inspect(frame, false))));
        }
        else k(frame);
        });
    }
    // 等待Method，然后使用回调函数处理frame
    function expect(Method, k) {
        wait(function(frame) {
        if (frame.id === Method) k(frame);
        else {
            bail(new Error(
            fmt("Expected %s; got %s",
                methodName(Method), inspect(frame, false))));
        }
        });
    }

    function bail(err) {
        openCallback(err);
    }

    function send(Method) {
        // This can throw an exception if there's some problem with the
        // options; e.g., something is a string instead of a number.
        try { self.sendMethod(0, Method, tunedOptions); }
        catch (err) { bail(err); }
    }

    function negotiate(server, desired) {
        // We get sent values for channelMax, frameMax and heartbeat,
        // which we may accept or lower (subject to a minimum for
        // frameMax, but we'll leave that to the server to enforce). In
        // all cases, `0` really means "no limit", or rather the highest
        // value in the encoding, e.g., unsigned short for channelMax.
        if (server === 0 || desired === 0) {
        // i.e., whichever places a limit, if either
        return Math.max(server, desired);
        }
        else {
        return Math.min(server, desired);
        }
    }

    function onStart(start) {
        var mechanisms = start.fields.mechanisms.toString().split(' ');
        if (mechanisms.indexOf(allFields.mechanism) < 0) {
        bail(new Error(fmt('SASL mechanism %s is not provided by the server',
                            allFields.mechanism)));
        return;
        }
        self.serverProperties = start.fields.serverProperties;
        send(defs.ConnectionStartOk);
        wait(afterStartOk);
    }

    function afterStartOk(reply) {
        switch (reply.id) {
        case defs.ConnectionSecure:
        bail(new Error(
            "Wasn't expecting to have to go through secure"));
        break;
        case defs.ConnectionClose:
        bail(new Error(fmt("Handshake terminated by server: %s",
                            closeMsg(reply))));
        break;
        case defs.ConnectionTune:
        var fields = reply.fields;
        tunedOptions.frameMax =
            negotiate(fields.frameMax, allFields.frameMax);
        tunedOptions.channelMax =
            negotiate(fields.channelMax, allFields.channelMax);
        tunedOptions.heartbeat =
            negotiate(fields.heartbeat, allFields.heartbeat);
        send(defs.ConnectionTuneOk);
        send(defs.ConnectionOpen);
        expect(defs.ConnectionOpenOk, onOpenOk);
        break;
        default:
        bail(new Error(
            fmt("Expected connection.secure, connection.close, " +
                "or connection.tune during handshake; got %s",
                inspect(reply, false))));
        break;
        }
    }

    function onOpenOk(openOk) {
        // Impose the maximum of the encoded value, if the negotiated
        // value is zero, meaning "no, no limits"
        self.channelMax = tunedOptions.channelMax || 0xffff;
        self.frameMax = tunedOptions.frameMax || 0xffffffff;
        // 0 means "no heartbeat", rather than "maximum period of
        // heartbeating"
        self.heartbeat = tunedOptions.heartbeat;
        self.heartbeater = self.startHeartbeater();
        self.accept = mainAccept;
        succeed(openOk);
    }

    // If the server closes the connection, it's probably because of
    // something we did
    function endWhileOpening(err) {
        bail(err || new Error('Socket closed abruptly ' +
                            'during opening handshake'));
    }

    this.stream.on('end', endWhileOpening);
    this.stream.on('error', endWhileOpening);

    function succeed(ok) {
        self.stream.removeListener('end', endWhileOpening);
        self.stream.removeListener('error', endWhileOpening);
        self.stream.on('error', self.onSocketError.bind(self));
        self.stream.on('end', self.onSocketError.bind(
        self, new Error('Unexpected close')));
        self.on('frameError', self.onSocketError.bind(self));
        self.acceptLoop();
        openCallback(null, ok);
    }

    // Now kick off the handshake by prompting the server
    this.sendProtocolHeader();
    expect(defs.ConnectionStart, onStart);
};
// 在成功连接之后，会进行acceptLoop，不断地接收消息。
C.acceptLoop = function() {
    var self = this;
  
    function go() {
      try {
        var f; while (f = self.recvFrame()) self.accept(f);
      }
      catch (e) {
        self.emit('frameError', e);
      }
    }
    self.stream.on('readable', go);
    go();
  };
C.sendProtocolHeader = function() {
    this.sendBytes(frame.PROTOCOL_HEADER);
  };
// 通过定时器加上对应的算法，判断心跳是否正常。
// 需要传入两个判断函数，此时需要绑定 判断函数的this对象。避免上下文不一致的问题。  
C.startHeartbeater = function() {
    if (this.heartbeat === 0) return null;
    else {
      var self = this;
      var hb = new Heart(this.heartbeat,
                         this.checkSend.bind(this),
                         this.checkRecv.bind(this));
      hb.on('timeout', function() {
        var hberr = new Error("Heartbeat timeout");
        self.emit('error', hberr);
        var s = stackCapture('Heartbeat timeout');
        self.toClosed(s, hberr);
      });
      hb.on('beat', function() {
        self.sendHeartbeat();
      });
      return hb;
    }
  };  
  // sentSinceLastCheck  
  // 在每一次的发送消息，都会不断更新为true,然后在heartbeat中定时更新为false
C.checkSend = function() {
var check = this.sentSinceLastCheck;
this.sentSinceLastCheck = false;
return check;
}

C.checkRecv = function() {
var check = this.recvSinceLastCheck;
this.recvSinceLastCheck = false;
return check;
}
// recvSinceLastCheck 
// 在每一次收到frame时，设置为true,然后在heartbeat中定时更新为false
C.recvFrame = function() {
  // %%% identifying invariants might help here?
  var frame = parseFrame(this.rest, this.frameMax);

  if (!frame) {
    var incoming = this.stream.read();
    if (incoming === null) {
      return false;
    }
    else {
      this.recvSinceLastCheck = true;
      this.rest = Buffer.concat([this.rest, incoming]);
      return this.recvFrame();
    }
  }
  else {
    this.rest = frame.rest;
    return decodeFrame(frame);
  }
};
C.sendBytes = function(bytes) {
this.sentSinceLastCheck = true;
this.stream.write(bytes);
};  
C.sendHeartbeat = function() {
    return this.sendBytes(frame.HEARTBEAT_BUF);
  };  



// Closing things: AMQP has a closing handshake that applies to
// closing both connects and channels. As the initiating party, I send
// Close, then ignore all frames until I see either CloseOK --
// which signifies that the other party has seen the Close and shut
// the connection or channel down, so it's fine to free resources; or
// Close, which means the other party also wanted to close the
// whatever, and I should send CloseOk so it can free resources,
// then go back to waiting for the CloseOk. If I receive a Close
// out of the blue, I should throw away any unsent frames (they will
// be ignored anyway) and send CloseOk, then clean up resources. In
// general, Close out of the blue signals an error (or a forced
// closure, which may as well be an error).
//
//  RUNNING [1] --- send Close ---> Closing [2] ---> recv Close --+
//     |                               |                         [3]
//     |                               +------ send CloseOk ------+
//  recv Close                   recv CloseOk
//     |                               |
//     V                               V
//  Ended [4] ---- send CloseOk ---> Closed [5]
//
// [1] All frames accepted; getting a Close frame from the server
// moves to Ended; client may initiate a close by sending Close
// itself.
// [2] Client has initiated a close; only CloseOk or (simulataneously
// sent) Close is accepted.
// [3] Simultaneous close
// [4] Server won't send any more frames; accept no more frames, send
// CloseOk.
// [5] Fully closed, client will send no more, server will send no
// more. Signal 'close' or 'error'.
//
// There are two signalling mechanisms used in the API. The first is
// that calling `close` will return a promise, that will either
// resolve once the connection or channel is cleanly shut down, or
// will reject if the shutdown times out.
//
// The second is the 'close' and 'error' events. These are
// emitted as above. The events will fire *before* promises are
// resolved.

// Close the connection without even giving a reason. Typical.
C.close = function(closeCallback) {
    var k = closeCallback && function() { closeCallback(null); };
    this.closeBecause("Cheers, thanks", constants.REPLY_SUCCESS, k);
  };
  
  
// 仅仅是为了抛出错误，告诉客户端这个时候的任何发送操作都是错误的，因为
// 当前正在closing
function invalidOp(msg, stack) {
return function() {
    throw new IllegalOperationError(msg, stack);
};
}

function invalidateSend(conn, msg, stack) {
conn.sendMethod = conn.sendContent = conn.sendMessage =
    invalidOp(msg, stack);
}
// Close with a reason and a 'code'. I'm pretty sure RabbitMQ totally
// ignores these; maybe it logs them. The continuation will be invoked
// when the CloseOk has been received, and before the 'close' event.
C.closeBecause = function(reason, code, k) {
    this.sendMethod(0, defs.ConnectionClose, {
      replyText: reason,
      replyCode: code,
      methodId: 0, classId: 0
    });
    var s = stackCapture('closeBecause called: ' + reason);
    this.toClosing(s, k);
  };
// A close has been initiated. Repeat: a close has been initiated.
// This means we should not send more frames, anyway they will be
// ignored. We also have to shut down all the channels.
// 现在在通过closeBecause之后，只希望收到ConnectionCloseOk回复。
// 魔法地改写accept函数,本来都是这个函数进行处理的.
// 这里的话，如果是channel:0的话，是使用channel0生成的accept函数，用于处理一个frame
// Usual frame accept mode
function mainAccept(frame) {
    var rec = this.channels[frame.channel];
    if (rec) { return rec.channel.accept(frame); }
    // NB CHANNEL_ERROR may not be right, but I don't know what is ..
    else
      this.closeWithError(
        fmt('Frame on unknown channel %d', frame.channel),
        constants.CHANNEL_ERROR,
        new Error(fmt("Frame on unknown channel: %s",
                      inspect(frame, false))));
  }

C.toClosing = function(capturedStack, k) {
    var send = this.sendMethod.bind(this);
  
    this.accept = function(f) {
        // 这里需要对于上图描述的返回frame做处理，按照需要的情况进行发送和关闭。
        // 当且仅当收到ConnectionCloseOk,才开始正确关闭channels
      if (f.id === defs.ConnectionCloseOk) {
        if (k) k();
        var s = stackCapture('ConnectionCloseOk received');
        this.toClosed(s, undefined);
      }
      else if (f.id === defs.ConnectionClose) {
        send(0, defs.ConnectionCloseOk, {});
      }
      // else ignore frame
    };
    invalidateSend(this, 'Connection closing', capturedStack);
  };
  
C._closeChannels = function(capturedStack) {
    for (var i = 1; i < this.channels.length; i++) {
      var ch = this.channels[i];
      if (ch !== null) {
        ch.channel.toClosed(capturedStack); // %%% or with an error? not clear
      }
    }
  };
  
  // A close has been confirmed. Cease all communication.
C.toClosed = function(capturedStack, maybeErr) {
    this._closeChannels(capturedStack);
    var info = fmt('Connection closed (%s)',
                   (maybeErr) ? maybeErr.toString() : 'by client');
    // Tidy up, invalidate enverything, dynamite the bridges.
    invalidateSend(this, info, capturedStack);
    this.accept = invalidOp(info, capturedStack);
    this.close = function(cb) {
      cb && cb(new IllegalOperationError(info, capturedStack));
    };
    if (this.heartbeater) this.heartbeater.clear();
    // This is certainly true now, if it wasn't before
    this.expectSocketClose = true;
    this.stream.end();
    this.emit('close', maybeErr);
  };    


// 关于connection和channel之间的关联关系：
// 在每一个channel建立的时候，都会，在channel中调用freshChannel的操作，将对应的数组
// 的位置初始化出channel,buffer，用于之后的消息发收。


// I use an array to keep track of the channels, rather than an
// object. The channel identifiers are numbers, and allocated by the
// connection. If I try to allocate low numbers when they are
// available (which I do, by looking from the start of the bitset),
// this ought to keep the array small, and out of 'sparse array
// storage'. I also set entries to null, rather than deleting them, in
// the expectation that the next channel allocation will fill the slot
// again rather than growing the array. See
// http://www.html5rocks.com/en/tutorials/speed/v8/
C.freshChannel = function(channel, options) {
  var next = this.freeChannels.nextClearBit(1);
  if (next < 0 || next > this.channelMax)
    throw new Error("No channels left to allocate");
  this.freeChannels.set(next);

  var hwm = (options && options.highWaterMark) || DEFAULT_WRITE_HWM;
  var writeBuffer = new PassThrough({
    objectMode: true, highWaterMark: hwm
  });
  this.channels[next] = {channel: channel, buffer: writeBuffer};
  writeBuffer.on('drain', function() {
    channel.onBufferDrain();
  });
  this.muxer.pipeFrom(writeBuffer);
  return next;
};

C.releaseChannel = function(channel) {
  this.freeChannels.clear(channel);
  var buffer = this.channels[channel].buffer;
  buffer.end(); // will also cause it to be unpiped
  this.channels[channel] = null;
};


// 对外公布包装的函数 channel:
// Wrap an RPC callback to make sure the callback is invoked with
// either `(null, value)` or `(error)`, i.e., never two non-null
// values. Also substitutes a stub if the callback is `undefined` or
// otherwise falsey, for convenience in methods for which the callback
// is optional (that is, most of them).
function callbackWrapper(ch, cb) {
  return (cb) ? function(err, ok) {
    if (err === null) {
      cb(null, ok);
    }
    else cb(err);
  } : function() {};
}

// This encodes straight-forward RPC: no side-effects and return the
// fields from the server response. It wraps the callback given it, so
// the calling method argument can be passed as-is. For anything that
// needs to have side-effects, or needs to change the server response,
// use `#_rpc(...)` and remember to dereference `.fields` of the
// server response.
Channel.prototype.rpc = function(method, fields, expect, cb0) {
  var cb = callbackWrapper(this, cb0);
  this._rpc(method, fields, expect, function(err, ok) {
    cb(err, ok && ok.fields); // in case of an error, ok will be
                              // undefined
  });
  return this;
};

// 而对于channel，特别之处在于，
// 使用reply绑定reply回调，使用pending记录待发送的消息，
// 而且保证一次只有一个reply,一次只发送一条消息，只有上一条结束之后
// 才进行下面的操作。
// Incoming frames are either notifications of e.g., message delivery,
// or replies to something we've sent. In general I deal with the
// former by emitting an event, and with the latter by keeping a track
// of what's expecting a reply.
//
// The AMQP specification implies that RPCs can't be pipelined; that
// is, you can have only one outstanding RPC on a channel at a
// time. Certainly that's what RabbitMQ and its clients assume. For
// this reason, I buffer RPCs if the channel is already waiting for a
// reply.

// Internal, synchronously resolved RPC; the return value is resolved
// with the whole frame.
C._rpc = function(method, fields, expect, cb) {
  var self = this;

  function reply(err, f) {
    if (err === null) {
      if (f.id === expect) {
        return cb(null, f);
      }
      else {
        // We have detected a problem, so it's up to us to close the
        // channel
        var expectedName = methodName(expect);

        var e = new Error(fmt("Expected %s; got %s",
                              expectedName, inspect(f, false)));
        self.closeWithError(f.id, fmt('Expected %s; got %s',
                                expectedName, methodName(f.id)),
                            defs.constants.UNEXPECTED_FRAME, e);
        return cb(e);
      }
    }
    // An error will be given if, for example, this is waiting to be
    // sent and the connection closes
    else if (err instanceof Error) return cb(err);
    // A close frame will be given if this is the RPC awaiting reply
    // and the channel is closed by the server
    else {
      // otherwise, it's a close frame
      var closeReason =
        (err.fields.classId << 16) + err.fields.methodId;
      var e = (method === closeReason)
        ? fmt("Operation failed: %s; %s",
              methodName(method), closeMsg(err))
        : fmt("Channel closed by server: %s", closeMsg(err));
      var closeFrameError = new Error(e);
      closeFrameError.code = err.fields.replyCode;
      closeFrameError.classId = err.fields.classId;
      closeFrameError.methodId = err.fields.methodId;
      return cb(closeFrameError);
    }
  }

  this.sendOrEnqueue(method, fields, reply);
};
// 使用rpc方式调用方法。可以保证，通过返回消息的id确认reply

// channel到底是如何处理每一个frame来保证通信的正确性和
// 持续性。

// 每一个消息都有几个部分组成，
// 第一部分是 消息的声明 accept为BasicDeliver or BasicGetOk
// 第二部分是 消息的头部 表示该消息的属性。
// 第三部分是 消息的内容，0或者多个frames.


// A trampolining state machine for message frames on a channel. A
// message arrives in at least two frames: first, a method announcing
// the message (either a BasicDeliver or BasicGetOk); then, a message
// header with the message properties; then, zero or more content
// frames.

// Keep the try/catch localised, in an attempt to avoid disabling
// optimisation
C.acceptMessageFrame = function(f) {
  try {
    this.handleMessage = this.handleMessage(f);
  }
  catch (msg) {
    if (typeof msg === 'string') {
      this.closeWithError(f.id, msg, defs.constants.UNEXPECTED_FRAME,
                          new Error(msg));
    }
    else if (msg instanceof Error) {
      this.closeWithError(f.id, 'Error while processing message',
                          defs.constants.INTERNAL_ERROR, msg);
    }
    else {
      this.closeWithError(f.id, 'Internal error while processing message',
                          defs.constants.INTERNAL_ERROR,
                          new Error(msg.toString()));
    }
  }
};


// 这行代码的玄妙之处在于，handleMessage是不断更新的回调函数，其实和上一次函数是一样的参数，
// 可能在于：不过会不断地改变上下文内容，应该需要的f.id是不断变化的，从
// BasicDeliver，BasicReturn ->(headers) BasicProperties->(contents)f.content->BasicDeliver，BasicReturn
// 组成一个循环不断的消息通信过程，
// 如果发生了错误，会抛出错误，然后结束。
this.handleMessage = this.handleMessage(f);

// Kick off a message delivery given a BasicDeliver or BasicReturn
// frame (BasicGet uses the RPC mechanism)
function acceptDeliveryOrReturn(f) {
  var event;
  if (f.id === defs.BasicDeliver) event = 'delivery';
  else if (f.id === defs.BasicReturn) event = 'return';
  else throw fmt("Expected BasicDeliver or BasicReturn; got %s",
                 inspect(f));

  var self = this;
  var fields = f.fields;
  return acceptMessage(function(message) {
    message.fields = fields;
    self.emit(event, message);
  });
}

// Move to the state of waiting for message frames (headers, then
// one or more content frames)
function acceptMessage(continuation) {
  var totalSize = 0, remaining = 0;
  var buffers = null;

  // 使用闭包，将消息的属性内容返回。而fields是回调函数自己指定的。
  var message = {
    fields: null,
    properties: null,
    content: null
  };

  // 指明下一个等待的消息类型
  return headers;

  // expect a headers frame
  function headers(f) {
    if (f.id === defs.BasicProperties) {
      message.properties = f.fields;
      totalSize = remaining = f.size;

      // for zero-length messages, content frames aren't required.
      if (totalSize === 0) {
        message.content = Buffer.alloc(0);
        continuation(message);
        // 此时结束了一个消息发送，回到原始状态
        return acceptDeliveryOrReturn;
      }
      else {
        // 指明下一个等待的消息类型
        return content;
      }
    }
    else {
      throw "Expected headers frame after delivery";
    }
  }

  // expect a content frame
  // %%% TODO cancelled messages (sent as zero-length content frame)
  function content(f) {
    if (f.content) {
      var size = f.content.length;
      remaining -= size;
      if (remaining === 0) {
        if (buffers !== null) {
          buffers.push(f.content);
          message.content = Buffer.concat(buffers);
        }
        else {
          message.content = f.content;
        }
        continuation(message);
        return acceptDeliveryOrReturn;
      }
      else if (remaining < 0) {
        throw fmt("Too much content sent! Expected %d bytes",
                  totalSize);
      }
      else {
        if (buffers !== null)
          buffers.push(f.content);
        else
          buffers = [f.content];
        return content;
      }
    }
    else throw "Expected content frame after headers"
  }
}

C.handleConfirm = function(handle, f) {
  var tag = f.deliveryTag;
  var multi = f.multiple;

  if (multi) {
    var confirmed = this.unconfirmed.splice(0, tag - this.lwm + 1);
    this.lwm = tag + 1;
    confirmed.forEach(handle);
  }
  else {
    var c;
    if (tag === this.lwm) {
      c = this.unconfirmed.shift();
      this.lwm++;
      // Advance the LWM and the window to the next non-gap, or
      // possibly to the end
      while (this.unconfirmed[0] === null) {
        this.unconfirmed.shift();
        this.lwm++;
      }
    }
    else {
      c = this.unconfirmed[tag - this.lwm];
      this.unconfirmed[tag - this.lwm] = null;
    }
    // Technically, in the single-deliveryTag case, I should report a
    // protocol breach if it's already been confirmed.
    handle(c);
  }
};

C.pushConfirmCallback = function(cb) {
  // `null` is used specifically for marking already confirmed slots,
  // so I coerce `undefined` and `null` to false; functions are never
  // falsey.
  this.unconfirmed.push(cb || false);
};

// Interface for connection to use

C.accept = function(f) {

  switch (f.id) {

    // Message frames
  case undefined: // content frame!
  case defs.BasicDeliver:
  case defs.BasicReturn:
  case defs.BasicProperties:
    return this.acceptMessageFrame(f);

    // confirmations, need to do confirm.select first
  case defs.BasicAck:
    return this.emit('ack', f.fields);
  case defs.BasicNack:
    return this.emit('nack', f.fields);
  case defs.BasicCancel:
    // The broker can send this if e.g., the queue is deleted.
    return this.emit('cancel', f.fields);

  case defs.ChannelClose:
    // Any remote closure is an error to us. Reject the pending reply
    // with the close frame, so it can see whether it was that
    // operation that caused it to close.
    if (this.reply) {
      var reply = this.reply; this.reply = null;
      reply(f);
    }
    var emsg = "Channel closed by server: " + closeMsg(f);
    this.sendImmediately(defs.ChannelCloseOk, {});

    var error = new Error(emsg);
    error.code = f.fields.replyCode;
    error.classId = f.fields.classId;
    error.methodId = f.fields.methodId;
    this.emit('error', error);

    var s = stackCapture(emsg);
    this.toClosed(s);
    return;

  case defs.BasicFlow:
    // RabbitMQ doesn't send this, it just blocks the TCP socket
    return this.closeWithError(f.id, "Flow not implemented",
                               defs.constants.NOT_IMPLEMENTED,
                               new Error('Flow not implemented'));

  default: // assume all other things are replies
    // Resolving the reply may lead to another RPC; to make sure we
    // don't hold that up, clear this.reply
    var reply = this.reply; this.reply = null;
    // however, maybe there's an RPC waiting to go? If so, that'll
    // fill this.reply again, restoring the invariant. This does rely
    // on any response being recv'ed after resolving the promise,
    // below; hence, I use synchronous defer.
    if (this.pending.length > 0) {
      var send = this.pending.shift();
      this.reply = send.reply;
      this.sendImmediately(send.method, send.fields);
    }
    return reply(null, f);
  }
};







