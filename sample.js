var dgram = require('dgram');
var GELFManager = require('gelf-manager');

var server = dgram.createSocket('udp4');
var gelfManager = new GELFManager({ debug: true });

server.on('message', function (msg, rinfo) {
  gelfManager.feed(msg);
});

gelfManager.on('message', function(msg) {
  console.log(msg);
});

gelfManager.on('error', function(err) {
  console.log(util.inspect(err));
});

server.on("listening", function () {
  var address = server.address();
  console.log("server listening " + address.address + ":" + address.port);
});

server.bind(12201);
