const zmq = require('zeromq')
const LogFactory =  require('../utils/logFactory')
const path = require('path');

var zeromq = null
let _log

function getZeroMq(settings) {

  if (zeromq != null)
    return zeromq

  _log = LogFactory.create(path.basename(__filename), settings.Main.LoggingLevel)

  const isDisabled = settings.ZeroMq.Disabled
  const port = settings.ZeroMq.Port
  
  zeromq = zmq.socket("pub");
  if (!isDisabled){
    zeromq.bindSync("tcp://127.0.0.1:" + port);
  }

  _log.info(`Publisher bound to port ${port}`)

  return zeromq
}

module.exports = getZeroMq