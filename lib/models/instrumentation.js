'use strict';

var fs = require('fs-extra');
var chalk = require('chalk');
var experiments = require('../experiments/');
var tree = require('heimdalljs-tree');
var utilsInstrumentation = require('../utilities/instrumentation');

var vizEnabled = utilsInstrumentation.vizEnabled;
var instrumentationEnabled = utilsInstrumentation.instrumentationEnabled;

function _enableFSMonitorIfInstrumentationEnabled() {
  var monitor;
  if (instrumentationEnabled()) {
    var FSMonitor = require('heimdalljs-fs-monitor');
    monitor = new FSMonitor();
    monitor.start();
  }
  return monitor;
}

_enableFSMonitorIfInstrumentationEnabled();


function Instrumentation (options) {
  this.ui = options.ui;

  // project constructor will set up bidirectional link
  this.project = null;

  this.instrumentations = {
    init: options.initInstrumentation,
    build: {
      cookie: null,
      node: null,
      count: 0,
    },
    command: {
      cookie: null,
      node: null,
    },
    shutdown: {
      cookie: null,
      node: null,
    },
  };

  this._heimdall = null;

  if (!options.initInstrumentation && this.isEnabled()) {
    this.instrumentations.init = {
      cookie: null,
      node: null,
    };
    this.start('init');

    this.ui.writeLine(chalk.yellow(
      'No init instrumentation passed to CLI.  Please update your global ember or ' +
      'invoke ember via the local executable within node_modules.  Init ' +
      'instrumentation will still be recorded, but some bootstraping will be ' +
      'omitted.'
    ));
  }
}

module.exports = Instrumentation;

Instrumentation.prototype._buildSummary = function (tree, result, resultAnnotation) {
  var buildSteps = 0;
  var totalTime = 0;

  var node;
  var statName;
  var statValue;
  var nodeItr;
  var statsItr;
  var nextNode;
  var nextStat;

  for (nodeItr = tree.preOrderIterator();;) {
    nextNode = nodeItr.next();
    if (nextNode.done) { break; }

    node = nextNode.value;
    if (node.label.broccoliNode && !node.label.broccoliCachedNode) {
      ++buildSteps;
    }

    for (statsItr = node.statsIterator();;) {
      nextStat = statsItr.next();
      if (nextStat.done) { break; }

      statName = nextStat.value[0];
      statValue = nextStat.value[1];

      if (statName === 'time.self') {
        totalTime += statValue;
      }
    }
  }

  var summary = {
    build: {
      type: resultAnnotation.type,
      count: this.instrumentations.build.count,
      outputChangedFiles: result.outputChanges,
    },
    output: result.directory,
    totalTime: totalTime,
    buildSteps: buildSteps,
  };

  if (resultAnnotation.type === 'rebuild') {
    summary.build.primaryFile = resultAnnotation.primaryFile;
    summary.build.changedFileCount = resultAnnotation.changedFiles.length;
    summary.build.changedFiles = resultAnnotation.changedFiles.slice(0, 10);
  }

  return summary;
};

function totalTime(tree) {
  var totalTime = 0;
  var nodeItr;
  var node;
  var statName;
  var statValue;
  var statsItr;
  var nextNode;
  var nextStat;

  for (nodeItr = tree.preOrderIterator();;) {
    nextNode = nodeItr.next();
    if (nextNode.done) { break; }

    node = nextNode.value;

    for (statsItr = node.statsIterator();;) {
      nextStat = statsItr.next();
      if (nextStat.done) { break; }

      statName = nextStat.value[0];
      statValue = nextStat.value[1];

      if (statName === 'time.self') {
        totalTime += statValue;
      }
    }
  }

  return totalTime;
}

Instrumentation.prototype._initSummary = function (tree) {
  return {
    totalTime: totalTime(tree)
  };
};

Instrumentation.prototype._commandSummary = function (tree) {
  return {
    totalTime: totalTime(tree)
  };
};

Instrumentation.prototype._shutdownSummary = function (tree) {
  return {
    totalTime: totalTime(tree)
  };
};

Instrumentation.prototype._instrumentationFor = function (name) {
  var instr = this.instrumentations[name];
  if (!instr) {
    throw new Error('No such instrumentation "' + name + '"');
  }
  return instr;
};

Instrumentation.prototype._instrumentationTreeFor = function(name) {
  return tree.loadFromNode(this.instrumentations[name].node);
};

Instrumentation.prototype._invokeAddonHook = function (name, instrumentationInfo) {
  if (!experiments.INSTRUMENTATION) { return; }

  if (this.project && this.project.addons.length) {
    this.project.addons.forEach(function (addon) {
      var hook = addon[experiments.INSTRUMENTATION];
      if (typeof hook === 'function') {
        hook.call(addon, name, instrumentationInfo);
      } else if (name === 'build') {
        hook = addon[experiments.BUILD_INSTRUMENTATION];
        if (typeof hook === 'function') {
          hook.call(addon, instrumentationInfo);
        }
      }
    });
  }
};

Instrumentation.prototype._writeInstrumentation = function (name, instrumentationInfo) {
  if (!vizEnabled()) { return; }

  var filename = 'broccoli-viz.' + name;
  if (name === 'build') {
    filename += '.' + this.instrumentations.build.count;
  }
  filename = filename + '.json';
  fs.writeJsonSync(filename, {
    summary: instrumentationInfo.summary,
    // we want to change this to tree, to be consistent with the hook, but first
    // we must update broccoli-viz
    // see see https://github.com/ember-cli/broccoli-viz/issues/35
    nodes: instrumentationInfo.tree.toJSON().nodes,
  });
};


Instrumentation.prototype.isVizEnabled = vizEnabled;
Instrumentation.prototype.isEnabled = instrumentationEnabled;

Instrumentation.prototype.start = function (name) {
  if (!instrumentationEnabled()) { return; }

  var instr = this._instrumentationFor(name);
  this._heimdall = this._heimdall || require('heimdalljs');

  var cookie = this._heimdall.start({ name: name, emberCLI: true });
  instr.cookie = cookie;
  instr.node = this._heimdall.current;
};

Instrumentation.prototype.stopAndReport = function(name) {
  if (!instrumentationEnabled()) { return; }

  var instr = this._instrumentationFor(name);
  if (!instr.cookie) {
    throw new Error('Cannot stop instrumentation "' + name + '".  It has not started.');
  }
  instr.cookie.stop();

  var instrSummaryName = '_' + name + 'Summary';
  if (!this[instrSummaryName]) {
    throw new Error('No summary found for "' + name + '"');
  }

  var tree = this._instrumentationTreeFor(name);
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift(tree);

  var instrInfo = {
    summary: this[instrSummaryName].apply(this, args),
    tree: tree
  };

  this._invokeAddonHook(name, instrInfo);
  this._writeInstrumentation(name, instrInfo);

  if (name === 'build') {
    instr.count++;
  }
};


// exported for testing
Instrumentation._enableFSMonitorIfInstrumentationEnabled = _enableFSMonitorIfInstrumentationEnabled;
Instrumentation._vizEnabled = vizEnabled();
Instrumentation._instrumentationEnabled = instrumentationEnabled();
