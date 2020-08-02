const ccxws = require("ccxws");

function MapExchangeCcxtToCcxws(ccxtExchangeName){
    switch(ccxtExchangeName) {
        case 'bibox':
            return new ccxws.Bibox()
        case 'binance':
            return new ccxws.Binance()
        case 'bitfinex':
            return new ccxws.Bitfinex()
        case 'bitflyer':
            return new ccxws.Bitflyer()
        case 'bitmex':
            return new ccxws.BitMEX()
        case 'bitstamp':
            return new ccxws.Bitstamp()
        case 'bittrex':
            return new ccxws.Bittrex()
        case 'cex':
            return new ccxws.cex()
        case 'coinex':
            return new ccxws.coinex()
        case 'coinbasepro':
            return new ccxws.coinbasepro()
        case 'ftx':
            return new ccxws.ftx()
        case 'gateio':
            return new ccxws.Gateio()
        case 'gemini':
            return new ccxws.Gemini()
        case 'hitbtc':
            return new ccxws.hitbtc2()
        case 'huobipro':
            return new ccxws.huobipro()
        case 'kraken':
            return new ccxws.kraken()
        case 'kucoin':
            return new ccxws.kucoin()
        case 'liquid':
            return new ccxws.liquid()
        case 'okex':
            return new ccxws.OKEx()
        case 'poloniex':
            return new ccxws.Poloniex()
        case 'upbit':
            return new ccxws.Upbit()
        case 'zb':
            return new ccxws.zb()
        default:
            console.log('*******')
            console.log(ccxtExchangeName)
            throw "This point can't be reached."
    }
}

module.exports.MapExchangeCcxtToCcxws = MapExchangeCcxtToCcxws