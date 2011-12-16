# node-gelf-manager

Manages raw [GELF messages](https://github.com/Graylog2/graylog2-docs/wiki/GELF).

This module is an EventEmitter, you feed it with raw messages (GZIP'd, ZLIB'd or Chunked)
and it will emit a 'message' whenever there's one ready to handle

## Methods

### GELFManager.feed(buffer)

Feed the manager with the raw (udp) data received.

## Events

### Event: 'message'

function(data) { }

The 'message' event emits a `js object` (parsed JSON) when the manager has re-assembled the chunks
(if needed) and uncompressed the data.

### Event: 'error'

function(error) { }

Emitted when an error occurs. This passes an `Error` object.

