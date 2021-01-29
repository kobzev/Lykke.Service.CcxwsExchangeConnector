var PROTO_PATH = __dirname + '/orderbooks.proto';
const LogFactory =  require('../utils/logFactory')
var grpc = require('@grpc/grpc-js');
var protoLoader = require('@grpc/proto-loader');
let _log
var server = null;
const path = require('path');

function getGrpc(settings){
  if (server != null)
    return server;

  const isDisabled = settings.gRPC.Disabled
  const port = settings.gRPC.Port
  
  if (isDisabled)
    return null;

  _log = LogFactory.create(path.basename(__filename), settings.Main.LoggingLevel)

  server = new grpc.Server();
  server.bindAsync('0.0.0.0:' + port, grpc.ServerCredentials.createInsecure(), () => {
    server.start();
  });
  _log.info(`Publisher bound to port ${port}`)


  var packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
      {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });
    var protoPackage = grpc.loadPackageDefinition(packageDefinition).common;
  server.addService(protoPackage.OrderBooks.service, {GetOrderBooks: GetOrderBooks});

  return server;
}

function GetOrderBooks(call) {
  call.write({ message: responseMessage });
  call.end();
}

module.exports = getGrpc