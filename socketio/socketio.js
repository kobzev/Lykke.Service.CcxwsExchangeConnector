const socketioServer = require('socket.io')

var socketio = null

function getSocketIO(settings) {

  if (socketio != null)
    return socketio

  const isDisabled = settings.SocketIO.Disabled
  const port = settings.SocketIO.Port

  if (!isDisabled)
    socketio = socketioServer.listen(port)

  return socketio
}

module.exports = getSocketIO