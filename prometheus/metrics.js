const prometheus = require('prom-client');

class Metrics {

    static received_order_book_update_counter = new prometheus.Counter({
      name: 'received_order_book_update_count',
      help: 'Counter of received order book updates.'
    });

    static received_order_book_snapshot_counter = new prometheus.Counter({
      name: 'received_order_book_snapshot_count',
      help: 'Counter of received order book snapshots.'
    });

}

module.exports = Metrics