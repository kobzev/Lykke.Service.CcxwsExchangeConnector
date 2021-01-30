const prometheus = require('prom-client');

class Metrics {

    static order_book_in_count = new prometheus.Counter({
      name: 'order_book_in_count',
      help: 'Counter of received order book updates.',
      labelNames: ['exchange', 'symbol']
    });

    static order_book_in_delay = new prometheus.Histogram({
      name: 'order_book_in_delay',
      help: 'Histogram of received order book delay.',
      buckets: [0.1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 5000]
    });

    static order_book_in_delay_ms = new prometheus.Gauge({
      name: 'order_book_in_delay_ms',
      help: 'Gauge of received order book delay.',
      labelNames: ['exchange', 'symbol']
    });

    static order_book_out_side_price = new prometheus.Gauge({
      name: 'order_book_out_side_price',
      help: 'Gauge of received order book side price.',
      labelNames: ['exchange', 'symbol', 'side']
    });

    static order_book_out_count = new prometheus.Counter({
      name: 'order_book_out_count',
      help: 'Counter of published order book updates.',
      labelNames: ['exchange', 'symbol']
    });

    static order_book_out_delay_ms = new prometheus.Gauge({
      name: 'order_book_out_delay_ms',
      help: 'Gauge of published order book delay.',
      labelNames: ['exchange', 'symbol']
    });
}

module.exports = Metrics