const amqp = require('amqplib')
const path = require('path');
const LogFactory = require('../utils/logFactory')

class RabbitMq {

    constructor(settings, loggingLevel) {
        this._settings = settings;
        this._log = LogFactory.create(path.basename(__filename), loggingLevel)
      }

    async getChannel() {
        if (!this._channel){
            this._channel = await this._createChannel()
            
            this._log.info(`RabbitMq channel has been created.`)
        }

        return this._channel
    }

    async _createChannel() {
        try
        {
            this._log.info(`Trying to connect to RabbitMq...`)

            const connection = await amqp.connect(this._settings.ConnectionString)

            this._log.info(`Has been connected to RabbitMq.`)

            this._log.info(`Trying to create channel to RabbitMq...`)

            const channel = await connection.createChannel()

            this._log.info(`Channel to RabbitMq has been created.`)

            this._log.info(`Asserting that RabbitMq exchange for 'Quotes' exists...`)

            await channel.assertExchange(this._settings.Quotes, 'fanout', {durable: false})
            
            this._log.info(`Asserted that RabbitMq exchange for 'Quotes' exists.`)

            this._log.info(`Asserting that RabbitMq exchange for 'OrderBooks' exists...`)

            await channel.assertExchange(this._settings.OrderBooks, 'fanout', {durable: false})
            
            this._log.info(`Asserted that RabbitMq exchange for 'OrderBooks' exists.`)

            this._log.info(`Asserting that RabbitMq exchange for 'Trades' exists...`)

            await channel.assertExchange(this._settings.Trades, 'fanout', {durable: false})
        
            this._log.info(`Asserted that RabbitMq exchange for 'Trades' exists.`)

            return channel
        }
        catch (e)
        {
            this._log.warn(`Exception while trying to create RabbitMq channel: ${e}, ${e.stack}.`)
        }
    }

    async send(rabbitExchange, object) {
        const objectJson = JSON.stringify(object)
    
        try {
            const channel = await this.getChannel()
            // todo: 'new Buffer' most probably is obsolete, has to be checked
            channel.publish(rabbitExchange, '', new Buffer(objectJson))
        }
        catch(e) {
            this._log.warn(`Error while sending a message to RabbitMq: ${e}, ${e.stack}.`)
        }
    }

}

module.exports = RabbitMq