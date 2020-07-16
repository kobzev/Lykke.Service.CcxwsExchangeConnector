const moment = require('moment');
const path = require('path');
const LogFactory =  require('./utils/logFactory')
const mapping = require('./utils/assetPairsMapping')

class ExchangeEventsHandler {
    
    constructor(exchange, settings, rabbitMq) {
        this._exchange = exchange
        this._settings = settings
        this._rabbitMq = rabbitMq
        this._orderBooks = new Map()
        this._lastTimePublished = new Map()
        this._log = LogFactory.create(path.basename(__filename), settings.Main.LoggingLevel)
    }

    // event handlers

    async tickerEventHandle(ticker) {
        let tickPrice = this._mapCcxwsTickerToPublishingTickPrice(ticker)

        let isValid = tickPrice.ask > 0 && tickPrice.bid > 0

        if (!isValid) {
            this._log.warn(`Quote is invalid: ${tickPrice}.`)
            return;
        }

        await this._publishTickPrice(tickPrice)
    }

    async l2snapshotEventHandle(orderBook) {
        // update cache
        const internalOrderBook = this._mapCcxwsOrderBookToInternalOrderBook(orderBook)
        const key = orderBook.marketId
        this._orderBooks.set(key, internalOrderBook)

        // publish
        if (this._isTimeToPublishOrderBook(key))
        {
            const publishingOrderBook = this._mapInternalOrderBookToPublishingOrderBook(internalOrderBook)
            await this._publishOrderBook(publishingOrderBook)

            this._lastTimePublished.set(key, moment.utc())
        }
    }

    async l2updateEventHandle(updateOrderBook) {
        const key = updateOrderBook.marketId

        // update cache

        const internalOrderBook = this._orderBooks.get(key)

        if (!internalOrderBook) {
            this._log.warn(`Internal order book ${this._exchange.name} ${key} is not found during update.`)
            return
        }

        updateOrderBook.asks.forEach(ask => {
            const updateAskPrice = parseFloat(ask.price)
            const updateAskSize = parseFloat(ask.size)

            internalOrderBook.asks.delete(updateAskPrice)
            
            if (updateAskSize !== 0)
                internalOrderBook.asks.set(updateAskPrice, updateAskSize)
        });

        updateOrderBook.bids.forEach(bid => {
            const updateBidPrice = parseFloat(bid.price)
            const updateBidSize = parseFloat(bid.size)

            internalOrderBook.bids.delete(updateBidPrice)

            if (updateBidSize !== 0)
                internalOrderBook.bids.set(updateBidPrice, updateBidSize)
        });

        internalOrderBook.timestamp = moment.utc()

        // publish

        if (this._isTimeToPublishOrderBook(key))
        {
            const publishingOrderBook = this._mapInternalOrderBookToPublishingOrderBook(internalOrderBook)
            await this._publishOrderBook(publishingOrderBook)

            this._lastTimePublished.set(key, moment.utc())
        }
    }

    async tradesEventHandle(trade) {
        await this._publishTrade(trade)
    }

    // publishing

    async _publishTickPrice(tickPrice) {
        if (this._settings.Main.Events.Quotes.Publish)
            await this._rabbitMq.send(this._settings.RabbitMq.Quotes, tickPrice)
    
        this._log.debug(`Quote: ${tickPrice.source} ${tickPrice.asset}, bid:${tickPrice.bid}, ask:${tickPrice.ask}.`)
    }

    async _publishOrderBook(orderBook) {
        if (this._settings.Main.Events.OrderBooks.Publish)
            await this._rabbitMq.send(this._settings.RabbitMq.OrderBooks, orderBook)
    
        this._log.debug(`Order Book: ${orderBook.source} ${orderBook.asset}, bids:${orderBook.bids.length}, asks:${orderBook.asks.length}, best bid:${orderBook.bids[0].price}, best ask:${orderBook.asks[0].price}.`)
    }

    async _publishTrade(trade) {
        if (this._settings.Main.Events.Trades.Publish)
            await this._rabbitMq.send(this._settings.RabbitMq.Trades, trade)
        
        this._log.debug(`Trade: ${trade.exchange}, ${trade.base}/${trade.quote}, price: ${trade.price}, amount: ${trade.amount}, side: ${trade.side}.`)
    }

    // mapping

    _mapCcxwsOrderBookToInternalOrderBook(ccxwsOrderBook) {
        const asks = new Map();
        ccxwsOrderBook.asks.forEach(ask => {
            const askPrice = parseFloat(ask.price)
            const askSize = parseFloat(ask.size)
    
            asks.set(askPrice, askSize)
        })
    
        const bids = new Map();
        ccxwsOrderBook.bids.forEach(bid => {
            const bidPrice = parseFloat(bid.price)
            const bidSize = parseFloat(bid.size)
    
            bids.set(bidPrice, bidSize)
        })
    
        const internalOrderBook = {}
        internalOrderBook.source = ccxwsOrderBook.exchange
        internalOrderBook.assetPair = ccxwsOrderBook.marketId
        internalOrderBook.asks = asks
        internalOrderBook.bids = bids
        internalOrderBook.timestamp = moment.utc()  // some exchanges may not have a timestamp (like Poloniex)
        
        return internalOrderBook
    }
    
    _mapInternalOrderBookToPublishingOrderBook(internalOrderBook) {
        const symbol = mapping.MapAssetPairBackward(internalOrderBook.assetPair, this._settings)
    
        const base = symbol.substring(0, symbol.indexOf('/'))
        const quote = symbol.substring(symbol.indexOf("/") + 1)
        const suffixConfig = this._settings.Main.ExchangesNamesSuffix
        const suffix = suffixConfig ? suffixConfig : ""
        const source = this._exchange.name.replace(this._exchange.version, "").trim()
        const publishingOrderBook = {}
        publishingOrderBook.source = source + suffix
        publishingOrderBook.asset = symbol.replace("/", "")
        publishingOrderBook.assetPair = { 'base': base, 'quote': quote }
        publishingOrderBook.timestamp = internalOrderBook.timestamp.toISOString()
    
        const descOrderedBidsPrices = Array.from(internalOrderBook.bids.keys())
                                           .sort(function(a, b) { return b-a; })
        const bids = []
        for(let price of descOrderedBidsPrices) {
            if (price == 0)
                continue
            let size = internalOrderBook.bids.get(price)
            if (size == 0)
                continue
    
            price = this._toFixedNumber(price)
            size = this._toFixedNumber(size)
    
            bids.push({ 'price': price, 'volume': size })
        }
        publishingOrderBook.bids = bids
    
        const ascOrderedAsksPrices = Array.from(internalOrderBook.asks.keys())
                                           .sort(function(a, b) { return a-b; })
        const asks = []
        for(let price of ascOrderedAsksPrices) {
            if (price == 0)
                continue
            let size = internalOrderBook.asks.get(price)
            if (size == 0)
                continue
    
            price = this._toFixedNumber(price)
            size = this._toFixedNumber(size)
    
            asks.push({ 'price': price, 'volume': size })
        }
        publishingOrderBook.asks = asks
    
        return publishingOrderBook
    }

    _mapCcxwsTickerToPublishingTickPrice(ticker) {
        const tickPrice = {}
        tickPrice.source = ticker.exchange
        tickPrice.assetPair = { 'base': ticker.base, 'quote': ticker.quote }
        tickPrice.asset = ticker.base + ticker.quote
        tickPrice.timestamp = moment(ticker.timestamp / 1000).toISOString()
        tickPrice.bid = parseFloat(ticker.bid)
        tickPrice.ask = parseFloat(ticker.ask)
    
        return tickPrice
    }
    
    // utils

    async _isTimeToPublishOrderBook(key) {
        const publishingIntervalMs = this._settings.Main.Events.OrderBooks.PublishingIntervalMs
        const lastTimePublished = this._lastTimePublished.get(key)
        const delaySinceLastTimePublished = moment.utc() - lastTimePublished
        const isFirstTimePublishing = !lastTimePublished
        const isTimeToPublish = delaySinceLastTimePublished > publishingIntervalMs

        return isFirstTimePublishing || isTimeToPublish
    }

    _toFixedNumber(number) {
        return number.toFixed(8).replace(/\.?0+$/,"")
    }
}

module.exports = ExchangeEventsHandler