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

    static quote_out_side_price = new prometheus.Gauge({
      name: 'quote_out_side_price',
      help: 'Gauge of received order book side price.',
      labelNames: ['exchange', 'symbol', 'side']
    });

}

module.exports = Metrics