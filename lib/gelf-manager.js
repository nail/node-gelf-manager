require('buffertools');

var EventEmitter = require('events').EventEmitter
  , zlib = require('zlib')
  , util = require('util')
  , GELFManagerError = require('./gelf-manager-error.js');

var GELF_TYPE = {
  'chunked': 0x1e0f, // 7695
  'gzip': 0x1f8b, // 8075
  'zlib': 0x789c, // 30876
};

/**
 * GELFManager - Handles GELF messages
 *
 * Example:
 *
 *  var manager = new GELFManager();
 *  manager.on('message', function(msg) { console.log(msg); });
 *  manager.feed(rawUDPMessage);
 */
function GELFManager(options) {

  if (typeof options === 'undefined') options = {};
  for (k in GELFManager.options)
    if (typeof options[k] === 'undefined')
      options[k] = GELFManager.options[k];

  this.debug        = options.debug;
  this.chunkTimeout = options.chunkTimeout;
  this.gcTimeout    = options.gcTimeout;

  EventEmitter.call(this);
  this.chunksPool = {};

  process.nextTick(this._gc.bind(this));

}

GELFManager.prototype.__proto__ = EventEmitter.prototype;

/* Defaults */
GELFManager.options = {
  debug: false,
  chunkTimeout: 20000,
  gcTimeout: 10000
}

/**
 * Feed the manager with the raw (udp) data received.
 * It will handle gzip'd / zlib'd and chunked GELF messages.
 *
 * @param (Buffer) msg Raw GELF data
 */
GELFManager.prototype.feed = function(msg) {
  var self = this;

  if (!Buffer.isBuffer(msg) || msg.length < 2) {
    self._error("Invalid message");
    return;
  }

  var messageType = msg.readUInt16BE(0);

  switch (messageType) {
    case GELF_TYPE.gzip:
    case GELF_TYPE.zlib:
      self._uncompressMessage(msg);
      break;

    case GELF_TYPE.chunked:
      self._handleChunk(msg);
      break;

    default:
      self._error(util.format('Unknown message type (0x%s)', messageType.toString(16)));
      break;
  }
}

/**
 * Uncompress a GELF message (gzip/zlib)
 *
 * On successful uncompression, it will emit a 'message' event with 
 * the JSON object as argument. 
 *
 * @param (Buffer) msg GZIP'd or ZLIB'd compressed stream.
 */
GELFManager.prototype._uncompressMessage = function(msg) {
  var self = this;
  var uncompress;

  if (!Buffer.isBuffer(msg) || msg.length < 2) {
    self._error("Invalid message");
    return
  }

  switch(msg.readUInt16BE(0)) {
    case GELF_TYPE.gzip:
      uncompress = zlib.gunzip;
      break;
    case GELF_TYPE.zlib:
      uncompress = zlib.inflate;
      break;
    default:
      self._error(util.format('Invalid compression type (0x%s)', msg.readUInt16BE(0).toString(16)));
      return;
  }

  uncompress(msg, function(err, result) {
    if (err) {
      self._error(err);
    } else {
      try {
        var jsonMsg = JSON.parse(result.toString('utf8'));
        self.emit("message", jsonMsg);
      } catch (err) {
        self._error(e);
      }
    }
  });
}

/**
 * Collects chunks and uncompress the full message when complete.
 *
 * @param (Buffer) msg Chunk-type GELF stream
 */
GELFManager.prototype._handleChunk = function(msg) {
  var self = this;

  if (!Buffer.isBuffer(msg) || msg.length <= 12) {
    self._error('Invalid chunked message');
    return;
  }

  var msgId = msg.slice(2, 10).toString('base64');
  var seqNumber = msg.readUInt8(10);
  var seqTotal = msg.readUInt8(11);

  self._log('Chunked GELF received - MsgId: %s - seqNumber: %d - seqTotal %d',
                msgId, seqNumber, seqTotal);

  if (!self.chunksPool[msgId]) {
    self.chunksPool[msgId] = {
      chunks: {},
      count: 0,
      total: seqTotal,
      start: new Date()
    }
  }

  if (!self.chunksPool[msgId].chunks[seqNumber]) {
    self.chunksPool[msgId].count++;
    self.chunksPool[msgId].chunks[seqNumber] = msg.slice(12);
    if (self.chunksPool[msgId].count === self.chunksPool[msgId].total) {
      self._log('Multipart message [%s] complete.', msgId);
      var orderedBuffers = [];
      for (var i = 0; i < self.chunksPool[msgId].total; i++) {
        orderedBuffers.push(self.chunksPool[msgId].chunks[i]);
      }
      delete self.chunksPool[msgId];
      var completeMsg = buffertools.concat.apply(buffertools, orderedBuffers);
      self._uncompressMessage(completeMsg);
    }
  }
}


/**
 * Emits an error
 *
 * @param (String/Error) err
 */
GELFManager.prototype._error = function(err) {
  var self = this;
  if (!util.isError(err)) err = new GELFManagerError(err);
  self.emit('error', err);
}

/**
 * Outputs to console if debug is enabled
 */
GELFManager.prototype._log = function() {
  var self = this;
  if (self.debug)
    console.log.apply(self, arguments);
}

/**
 * Garbage collector.
 * If a chunked message has been waiting for missing parts during more than
 * 'chunkTimeout', delete it.
 */
GELFManager.prototype._gc = function() {
  var self = this;
  for (var msgId in self.chunksPool) {
    if ((self.chunksPool[msgId].start.getTime() + self.chunkTimeout) < new Date().getTime()) {
      self._log('Timeout for chunked message [%s], cleaning...', msgId);
      delete self.chunksPool[msgId];
    }
  }
  setTimeout(self._gc.bind(self), self.gcTimeout);
}

module.exports = GELFManager;
