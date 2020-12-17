const express = require('express')
const path = require('path');
const packageJson = require('../package.json')
const LogFactory =  require('../utils/logFactory')
const prometheus = require('prom-client')

let _log

async function startWebServer(loggingLevel) {
    _log = LogFactory.create(path.basename(__filename), loggingLevel)
    
    const response = {
        "Author": "Swisschain",
        "Name": "Lykke.Service.CcxwsExchangeConnectorSwisschain",
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

    app.get('/metrics', async function(req, res) {
        const metrics = await prometheus.register.metrics()
        res.send(metrics)
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