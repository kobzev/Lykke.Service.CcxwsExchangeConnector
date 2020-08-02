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

        const suffixConfig = this._settings.Main.ExchangesNamesSuffix
        const suffix = suffixConfig ? suffixConfig : ""
        this._source = this._exchange.name.replace(this._exchange.version, "").trim()
    }

    // event handlers

    async tickerEventHandle(ticker) {
        let quote = this._mapCcxwsTickerToPublishQuote(ticker)

        let isValid = quote.ask > 0 && quote.bid > 0

        if (!isValid) {
            //sometimes ask and bid are null, has to be investigated
            //this._log.warn(`${quote.source} Quote is invalid: ${JSON.stringify(quote)}.`)
            return;
        }

        await this._publishQuote(quote)
    }

    async l2snapshotEventHandle(orderBook) {
        // update cache
        const internalOrderBook = this._mapCcxwsOrderBookToInternalOrderBook(orderBook)
        const key = orderBook.marketId
        this._orderBooks.set(key, internalOrderBook)

        // publish
        if (this._isTimeToPublishOrderBook(key))
        {
            const publishingOrderBook = this._mapInternalOrderBookToPublishOrderBook(internalOrderBook)
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
            const publishingOrderBook = this._mapInternalOrderBookToPublishOrderBook(internalOrderBook)
            await this._publishOrderBook(publishingOrderBook)

            this._lastTimePublished.set(key, moment.utc())
        }
    }

    async tradesEventHandle(trade) {
        await this._publishTrade(trade)
    }

    // publishing

    async _publishQuote(quote) {
        if (this._settings.Main.Events.Quotes.Publish)
            await this._rabbitMq.send(this._settings.RabbitMq.Quotes, quote)
    
        this._log.debug(`Quote: ${quote.source} ${quote.asset}, bid:${quote.bid}, ask:${quote.ask}.`)
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
    
    _mapInternalOrderBookToPublishOrderBook(internalOrderBook) {
        const symbol = mapping.MapAssetPairBackward(internalOrderBook.assetPair, this._settings)
    
        const base = symbol.substring(0, symbol.indexOf('/'))
        const quote = symbol.substring(symbol.indexOf("/") + 1)
        
        const publishingOrderBook = {}
        publishingOrderBook.source = this._source
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

    _mapCcxwsTickerToPublishQuote(ticker) {
        const quote = {}
        quote.source = this._source
        quote.assetPair = { 'base': ticker.base, 'quote': ticker.quote }
        quote.asset = ticker.base + ticker.quote
        quote.timestamp = moment(ticker.timestamp / 1000).toISOString()
        quote.bid = parseFloat(ticker.bid)
        quote.ask = parseFloat(ticker.ask)
    
        return quote
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