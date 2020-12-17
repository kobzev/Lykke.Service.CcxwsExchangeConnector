const prometheus = require('prom-client');

class Metrics {

    static tick_order_book_in_count = new prometheus.Counter({
      name: 'tick_order_book_count',
      help: 'Counter of received order book updates.',
      labelNames: ['exchange', 'symbol']
    });

    static tick_order_book_in_delay_ms = new prometheus.Gauge({
      name: 'tick_order_book_in_delay_ms',
      help: 'Gauge of received order book updates.',
      labelNames: ['exchange', 'symbol']
    });

    static tick_order_book_bid = new prometheus.Gauge({
      name: 'tick_order_book_bid',
      help: 'Gauge of received order book bid.',
      labelNames: ['exchange', 'symbol']
    });

    static tick_order_book_ask = new prometheus.Gauge({
      name: 'tick_order_book_ask',
      help: 'Gauge of received order book ask.',
      labelNames: ['exchange', 'symbol']
    });

}

module.exports = Metrics