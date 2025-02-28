'use strict';

var bitcore = require('bitcore-lib-zen');
var async = require('async');
var TxController = require('./transactions');
var Common = require('./common');

function AddressController(node) {
  this.node = node;
  this.txController = new TxController(node);
  this.common = new Common({log: this.node.log});
}

AddressController.prototype.show = function(req, res) {
  var self = this;
  var options = {
    noTxList: parseInt(req.query.noTxList),
    showImmatureBalance: req.query.showImmatureBalance ? req.query.showImmatureBalance : 0
  };

  if (req.query.from && req.query.to) {
    options.from = parseInt(req.query.from);
    options.to = parseInt(req.query.to);
  }

  this.getAddressSummary(req.addr, options, function(err, data) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    res.jsonp(data);
  });
};

AddressController.prototype.balance = function(req, res) {
  var options = {
    showImmatureBalance: req.query.showImmatureBalance ? req.query.showImmatureBalance : 0
  };
  this.addressSummarySubQuery(req, res, options, 'balanceSat');
};

AddressController.prototype.totalReceived = function(req, res) {
  this.addressSummarySubQuery(req, res, {}, 'totalReceivedSat');
};

AddressController.prototype.totalSent = function(req, res) {
  this.addressSummarySubQuery(req, res, {}, 'totalSentSat');
};

AddressController.prototype.unconfirmedBalance = function(req, res) {
  var options = {
    showImmatureBalance: req.query.showImmatureBalance ? req.query.showImmatureBalance : 0
  };
  this.addressSummarySubQuery(req, res, options, 'unconfirmedBalanceSat');
};

AddressController.prototype.immatureBalance = function(req, res) {
  this.addressSummarySubQuery(req, res, {}, 'immatureBalanceSat');
};

AddressController.prototype.addressSummarySubQuery = function(req, res, options, param) {
  var self = this;
  this.getAddressSummary(req.addr, options, function(err, data) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    res.jsonp(data[param]);
  });
};

AddressController.prototype.getAddressSummary = function(address, options, callback) {

  this.node.getAddressSummary(address, options, function(err, summary) {
    if(err) {
      return callback(err);
    }

    var transformed = {
      addrStr: address,
      balance: summary.balance / 1e8,
      balanceSat: summary.balance,
      totalReceived: summary.totalReceived / 1e8,
      totalReceivedSat: summary.totalReceived,
      totalSent: summary.totalSpent / 1e8,
      totalSentSat: summary.totalSpent,
      unconfirmedBalance: summary.unconfirmedBalance / 1e8,
      unconfirmedBalanceSat: summary.unconfirmedBalance,
      immatureBalance: summary.immatureBalance / 1e8,
      immatureBalanceSat: summary.immatureBalance,
      unconfirmedTxApperances: summary.unconfirmedAppearances, // misspelling - ew
      unconfirmedTxAppearances: summary.unconfirmedAppearances,
      txApperances: summary.appearances, // yuck
      txAppearances: summary.appearances,
      transactions: summary.txids
    };

    callback(null, transformed);
  });
};

AddressController.prototype.checkAddr = function(req, res, next) {
  req.addr = req.params.addr;
  this.check(req, res, next, [req.addr]);
};

AddressController.prototype.checkAddrs = function(req, res, next) {
  if(req.body.addrs) {
    req.addrs = req.body.addrs.split(',');
  } else {
    req.addrs = req.params.addrs.split(',');
  }

  this.check(req, res, next, req.addrs);
};

AddressController.prototype.check = function(req, res, next, addresses) {
  var self = this;
  if(!addresses.length || !addresses[0]) {
    return self.common.handleErrors({
      message: 'Must include address',
      code: 1
    }, res);
  }

  for(var i = 0; i < addresses.length; i++) {
    try {
      var a = new bitcore.Address(addresses[i]);
    } catch(e) {
      return self.common.handleErrors({
        message: 'Invalid address: ' + e.message,
        code: 1
      }, res);
    }
  }

  next();
};

AddressController.prototype.utxo = function(req, res) {
  var self = this;
  var showImmatureBTs = req.query.showImmatureBTs ? req.query.showImmatureBTs : 0;
  var options = {};
  options.showImmatureBTs = showImmatureBTs;

  this.node.getAddressUnspentOutputs(req.addr, options, function(err, utxos) {
    if(err) {
      return self.common.handleErrors(err, res);
    } else if (!utxos.length) {
      return res.jsonp([]);
    }
    res.jsonp(utxos.map(self.transformUtxo.bind(self)));
  });
};

AddressController.prototype.multiutxo = function(req, res) {
  var self = this;
  var showImmatureBTs = req.query.showImmatureBTs ? 
                          req.query.showImmatureBTs : req.body.showImmatureBTs ? 
                            req.body.showImmatureBTs : 0;
  var options = {};
  options.showImmatureBTs = showImmatureBTs;
  options.queryMempool = true;
  
  this.node.getAddressUnspentOutputs(req.addrs, options, function(err, utxos) {
    if(err && err.code === -5) {
      return res.jsonp([]);
    } else if(err) {
      return self.common.handleErrors(err, res);
    }

    res.jsonp(utxos.map(self.transformUtxo.bind(self)));
  });
};

AddressController.prototype.transformUtxo = function(utxoArg) {
  var utxo = {
    address: utxoArg.address,
    txid: utxoArg.txid,
    vout: utxoArg.outputIndex,
    scriptPubKey: utxoArg.script,
    amount: utxoArg.satoshis / 1e8,
    satoshis: utxoArg.satoshis
  };
  if (utxoArg.height && utxoArg.height > 0) {
    utxo.height = utxoArg.height;
    utxo.confirmations = this.node.services.bitcoind.height - utxoArg.height + 1;
  } else {
    utxo.confirmations = 0;
  }
  if (utxoArg.timestamp) {
    utxo.ts = utxoArg.timestamp;
  }
  if (utxoArg.backwardTransfer && utxoArg.backwardTransfer == true) {
    utxo.backwardTransfer = true;
    utxo.mature = utxoArg.mature;
    utxo.maturityHeight = utxoArg.maturityHeight;
    utxo.blocksToMaturity = utxoArg.blocksToMaturity;
  }
  if (utxoArg.outstatus && utxoArg.outstatus == 1 || //TOP QUALITY CERT
    (utxoArg.outstatus && utxoArg.outstatus == 2)) { //LOW QUALITY CERT
      utxo.backwardTransfer = true;
      utxo.mature = false;
      utxo.maturityHeight = -1; //Verify with the getcertmaturityinfo
      utxo.blocksToMaturity = -1; //Verify with the getcertmaturityinfo
    }
  return utxo;
};

AddressController.prototype._getTransformOptions = function(req) {
  return {
    noAsm: parseInt(req.query.noAsm) ? true : false,
    noScriptSig: parseInt(req.query.noScriptSig) ? true : false,
    noSpent: parseInt(req.query.noSpent) ? true : false
  };
};

AddressController.prototype.multitxs = function(req, res, next) {
  var self = this;

  var options = {
    from: parseInt(req.query.from) || parseInt(req.body.from) || 0
  };
  var showImmatureBTs = req.query.showImmatureBTs ? 
                          req.query.showImmatureBTs : req.body.showImmatureBTs ? 
                            req.body.showImmatureBTs : 0;
                              
  options.to = parseInt(req.query.to) || parseInt(req.body.to) || parseInt(options.from) + 10;
  options.showImmatureBTs = showImmatureBTs;

  self.node.getAddressHistory(req.addrs, options, function(err, result) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    var transformOptions = self._getTransformOptions(req);

    self.transformAddressHistoryForMultiTxs(result.items, showImmatureBTs, transformOptions, function(err, items) {
      if (err) {
        return self.common.handleErrors(err, res);
      }
      res.jsonp({
        totalItems: result.totalCount,
        from: options.from,
        to: Math.min(options.to, result.totalCount),
        items: items
      });
    });

  });
};

AddressController.prototype.transformAddressHistoryForMultiTxs = function(txinfos, showImmatureBTs, options, callback) {
  var self = this;

  var items = txinfos.map(function(txinfo) {
    return txinfo.tx;
  }).filter(function(value, index, self) {
    return self.indexOf(value) === index;
  });

  async.map(
    items,
    function(item, next) {
      self.txController.transformTransaction(item, showImmatureBTs, options, next);
    },
    callback
  );
};



module.exports = AddressController;
