const express = require('express')
const path = require('path');
const packageJson = require('../package.json')
const LogFactory =  require('../utils/logFactory')

let _log

async function startWebServer(loggingLevel) {
    _log = LogFactory.create(path.basename(__filename), loggingLevel)
    
    const response = {
        "Author": "Swisschain",
        "Name": "Lykke.Service.CcxwsExchangeConnector",
        "Version": packageJson.version,
        "Env": null,
        "IsDebug": false,
        "IssueIndicators": []
      }
      
    const app = express()

    app.get('/api/isAlive', function (req, res) {
        res.header("Content-Type",'application/json')
        res.send(JSON.stringify(response, null, 4))
    })

    const server = app.listen(5000, function () {
        let host = server.address().address
        const port = server.address().port

        if (host === "::") { 
           host = "localhost"
        }

        _log.info(`Listening at http://${host}:${port}`)
    })
}

module.exports = startWebServer