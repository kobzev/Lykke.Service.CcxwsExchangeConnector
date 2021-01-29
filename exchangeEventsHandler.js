const moment = require('moment');
const path = require('path');
const LogFactory =  require('./utils/logFactory')
const mapping = require('./utils/assetPairsMapping')
const getSocketIO = require('./socketio/socketio')
const getZeroMq = require('./zeromq/zeromq')
const prometheus = require('prom-client');
const Metrics = require('./prometheus/metrics')

class ExchangeEventsHandler {
    constructor(exchange, settings, rabbitMq) {
        this.i = 0;

        this._exchange = exchange
        this._settings = settings
        this._rabbitMq = rabbitMq
        this._socketio = getSocketIO(settings)
        this._zeroMq = getZeroMq(settings)
        this._orderBooks = new Map()
        this._lastTimePublished = new Map()
        this._log = LogFactory.create(path.basename(__filename), settings.Main.LoggingLevel)

        const suffixConfig = this._settings.Main.ExchangesNamesSuffix
        const suffix = suffixConfig ? suffixConfig : ""
        this._source = this._exchange.name.replace(this._exchange.version, "").trim()
        this._source = this._source + suffix
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
        // metrics
        Metrics.order_book_in_count.labels(orderBook.exchange, `${orderBook.base}/${orderBook.quote}`).inc()
        if (orderBook.timestampMs){
            const delayMs = moment.utc().unix() - moment(orderBook.timestampMs).unix()
            Metrics.order_book_in_delay_ms.labels(orderBook.exchange, `${orderBook.base}/${orderBook.quote}`).set(delayMs)
        }

        // update cache
        const internalOrderBook = this._mapCcxwsOrderBookToInternalOrderBook(orderBook)
        const key = orderBook.marketId
        this._orderBooks.set(key, internalOrderBook)

        // metrics
        const ob = internalOrderBook
        Metrics.order_book_out_side_price.labels(ob.source, `${ob.assetPair}`, 'bid').set(ob.bids.keys().next().value)
        Metrics.order_book_out_side_price.labels(ob.source, `${ob.assetPair}`, 'ask').set(ob.asks.keys().next().value)

        // publish
        if (this._isTimeToPublishOrderBook(key))
        {
            const publishingOrderBook = this._mapInternalOrderBookToPublishOrderBook(internalOrderBook)
            await this._publishOrderBook(publishingOrderBook)

            this._lastTimePublished.set(key, moment.utc())
        }
    }

    async l2updateEventHandle(updateOrderBook) {
        Metrics.order_book_in_count.labels(updateOrderBook.exchange, `${updateOrderBook.base}/${updateOrderBook.quote}`).inc()
        if (updateOrderBook.timestampMs){
            const delayMs = moment.utc().unix() - moment(updateOrderBook.timestampMs).unix()
            Metrics.order_book_in_delay_ms.labels(updateOrderBook.exchange, `${updateOrderBook.base}/${updateOrderBook.quote}`).set(delayMs)
        }

        const key = updateOrderBook.marketId

        // update cache

        const internalOrderBook = this._orderBooks.get(key)

        if (!internalOrderBook) {
            this._log.warn(`Order book ${this._exchange.name} ${key} was not found in the cache during the 'order book update' event.`)
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

        internalOrderBook.timestampMs = updateOrderBook.timestampMs // optional, not available on most exchanges
        if (internalOrderBook.timestampMs)
            internalOrderBook.timestamp = moment(internalOrderBook.timestampMs)
        else
            internalOrderBook.timestamp = moment.utc()

        // metrics
        const ob = internalOrderBook
        Metrics.order_book_out_side_price.labels(ob.source, `${ob.assetPair}`, 'bid').set(ob.bids.keys().next().value)
        Metrics.order_book_out_side_price.labels(ob.source, `${ob.assetPair}`, 'ask').set(ob.asks.keys().next().value)

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
        {
            await this._rabbitMq.send(this._settings.RabbitMq.Quotes, quote)

            this._log.debug(`Quote: ${quote.source} ${quote.asset}, bid:${quote.bid}, ask:${quote.ask}, timestamp:${quote.timestamp}.`)
        }
    }

    async _publishOrderBook(orderBook) {
        if (this._settings.Main.Events.OrderBooks.Publish)
        {
            await this._rabbitMq.send(this._settings.RabbitMq.OrderBooks, orderBook)

            if (!this._settings.SocketIO.Disabled && this._socketio != null)
                this._socketio.sockets.send(orderBook);

            if (!this._settings.ZeroMq.Disabled && this._zeroMq != null) {
                this._zeroMq.send(["orderbooks", JSON.stringify(orderBook)]);
                this._log.debug(`Order Book: ${orderBook.source} ${orderBook.asset}, bids:${orderBook.bids.length}, asks:${orderBook.asks.length}, best bid:${orderBook.bids[0].price}, best ask:${orderBook.asks[0].price}, timestamp: ${orderBook.timestamp}.`)
            }

            Metrics.order_book_out_count.labels(orderBook.source, `${orderBook.base}/${orderBook.quote}`).inc()

            let a = moment.utc().unix()
            let b = moment(orderBook.timestamp).unix()
            const delayMs = a - b
            Metrics.order_book_out_delay_ms.labels(orderBook.source, `${orderBook.assetPair.base}/${orderBook.assetPair.quote}`).set(delayMs)

            // this._log.debug(`Order Book: ${orderBook.source} ${orderBook.asset}, bids:${orderBook.bids.length}, asks:${orderBook.asks.length}, best bid:${orderBook.bids[0].price}, best ask:${orderBook.asks[0].price}, timestamp: ${orderBook.timestamp}.`)
        }
    }

    async _publishTrade(trade) {
        if (this._settings.Main.Events.Trades.Publish)
        {
            await this._rabbitMq.send(this._settings.RabbitMq.Trades, trade)

            this._log.debug(`Trade: ${trade.exchange}, ${trade.base}/${trade.quote}, price: ${trade.price}, amount: ${trade.amount}, side: ${trade.side}.`)
        }
    }

    // mapping

    _mapCcxwsTickerToPublishQuote(ticker) {
        const quote = {}
        quote.source = this._source
        quote.assetPair = { 'base': ticker.base, 'quote': ticker.quote }
        quote.asset = ticker.base + ticker.quote
        quote.timestamp = moment(ticker.timestamp).toISOString()
        quote.timestampMs = ticker.timestamp
        quote.bid = parseFloat(ticker.bid)
        quote.ask = parseFloat(ticker.ask)
    
        return quote
    }
    
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

        internalOrderBook.timestampMs = ccxwsOrderBook.timestampMs // optional, not available on most exchanges
        if (internalOrderBook.timestampMs)
            internalOrderBook.timestamp = moment(internalOrderBook.timestampMs)
        else
            internalOrderBook.timestamp = moment.utc()

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
        publishingOrderBook.timestampMs = internalOrderBook.timestampMs // optional, not available on most exchanges
    
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

            // TODO: only best bid, remove to have full OrderBooks
            //if (bids.length >= 1)
            //    break;
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

            // TODO: only best ask, remove to have full OrderBooks
            //if (asks.length >= 1)
            //    break;
        }
        publishingOrderBook.asks = asks
    
        return publishingOrderBook
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