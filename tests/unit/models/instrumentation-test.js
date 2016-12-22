var Heimdall = require('heimdalljs/heimdall');
var chai = require('../../chai');
var td = require('testdouble');
var fs = require('fs');
var MockUI = require('console-ui/mock');
var MockProject = require('../../helpers/mock-project');
var chalk = require('chalk');
var experiments = require('../../../lib/experiments/');
var Instrumentation = require('../../../lib/models/instrumentation');

var expect = chai.expect;

var instrumentation;

describe('models/instrumentation.js', function() {
  afterEach( function() {
    delete process.env.BROCCOLI_VIZ;
    delete process.env.EMBER_CLI_INSTRUMENTATION;
  });

  describe('._enableFSMonitorIfInstrumentationEnabled', function() {
    var originalBroccoliViz = process.env.BROCCOLI_VIZ;
    var originalStatSync = fs.statSync;

    beforeEach(function () {
      expect(!!process.env.BROCCOLI_VIZ).to.eql(false);
    });

    afterEach(function() {
      td.reset();
      delete process.env.BROCCOLI_VIZ;
      delete process.env.EMBER_CLI_INSTRUMENTATION;
    });

    it('if VIZ is NOT enabled, do not monitor', function() {
      var monitor = Instrumentation._enableFSMonitorIfInstrumentationEnabled();
      try {
        expect(fs.statSync).to.equal(originalStatSync);
        expect(monitor).to.eql(undefined);
      } finally {
        if (monitor) {
          monitor.stop();
        }
      }
    });

    it('if VIZ is enabled, monitor', function() {
      process.env.BROCCOLI_VIZ = '1';
      var monitor = Instrumentation._enableFSMonitorIfInstrumentationEnabled();
      try {
        expect(fs.statSync).to.not.equal(originalStatSync);
      } finally {
        if (monitor) {
          monitor.stop();
        }
      }
    });

    it('if instrumentation is enabled, monitor', function() {
      process.env.EMBER_CLI_INSTRUMENTATION = '1';
      var monitor = Instrumentation._enableFSMonitorIfInstrumentationEnabled();
      try {
        expect(fs.statSync, 'fs.statSync').to.not.equal(originalStatSync, '[original] fs.statSync');
      } finally {
        if (monitor) {
          monitor.stop();
        }
      }
    });
  });

  describe('constructor', function() {
    var heimdall = require('heimdalljs');
    var heimdallStart;

    beforeEach( function() {
      heimdallStart = td.replace(heimdall, 'start');
    });

    afterEach( function() {
      delete process.env.EMBER_CLI_INSTRUMENTATION;
      td.reset();
    });

    describe('when instrumentation is enabled', function() {
      beforeEach( function() {
        process.env.EMBER_CLI_INSTRUMENTATION = '1';
      });

      it('starts an init node if init instrumentation is missing', function() {
        var mockCookie = {};

        td.when(heimdallStart(td.matchers.contains({
          name: 'init',
          emberCLI: true,
        }))).thenReturn(mockCookie);

        var instrumentation = new Instrumentation({
          ui: new MockUI(),
        });

        expect(instrumentation.instrumentations.init).to.not.equal(undefined);
        expect(instrumentation.instrumentations.init.cookie).to.equal(mockCookie);
        expect(instrumentation.instrumentations.init.node).to.not.equal(undefined);
      });

      it('does not create an init node if init instrumentation is included', function() {
        var mockCookie = {};
        var mockInstrumentation = {};

        td.when(heimdallStart('init')).thenReturn(mockCookie);

        var instrumentation = new Instrumentation({
          initInstrumentation: mockInstrumentation,
        });

        expect(instrumentation.instrumentations.init).to.eql(mockInstrumentation);
        td.verify(heimdallStart(), { times: 0, ignoreExtraArgs: true });
      });

      it('warns if no init instrumentation is included', function() {
        td.when(heimdallStart('init'));

        var ui = new MockUI();
        var instrumentation = new Instrumentation({
          ui: ui,
        });

        expect(ui.output).to.eql(chalk.yellow(
          'No init instrumentation passed to CLI.  Please update your global ember or ' +
          'invoke ember via the local executable within node_modules.  Init ' +
          'instrumentation will still be recorded, but some bootstraping will be ' +
          'omitted.'
        ) + '\n');
      });

      it('does not warn if init instrumentation is included', function() {
        td.when(heimdallStart('init'));

        var mockInstrumentation = {};

        var ui = new MockUI();
        var instrumentation = new Instrumentation({
          ui: ui,
          initInstrumentation: mockInstrumentation,
        });

        expect(ui.output.trim()).to.eql('');
      });
    });

    describe('when instrumentation is not enabled', function() {
      beforeEach( function() {
        expect(process.env.EMBER_CLI_INSTRUMENTATION).to.eql(undefined);
      });

      it('does not create an init node if init instrumentation is missing', function() {
        var mockCookie = {};
        var mockInstrumentation = {};

        td.when(heimdallStart('init')).thenReturn(mockCookie);

        var instrumentation = new Instrumentation({});

        expect(instrumentation.instrumentations.init).to.eql(undefined);
        td.verify(heimdallStart(), { times: 0, ignoreExtraArgs: true });
      });

      it('does not warn when init instrumentation is missing', function() {
        td.when(heimdallStart('init'));

        var ui = new MockUI();
        var instrumentation = new Instrumentation({
          ui: ui,
        });

        expect(ui.output.trim()).to.eql('');
      });
    });
  });

  describe('.isVizEnabled', function() {
    var originalWarn = console.warn;
    var warnInvocations;

    beforeEach(function() {
      instrumentation = new Instrumentation({
        ui: new MockUI(),
      });

      delete process.env.BROCCOLI_VIZ;
      delete process.env.EMBER_CLI_INSTRUMENTATION;
      warnInvocations = [];
      console.warn = function () {
        warnInvocations.push.apply(warnInvocations, Array.prototype.slice.call(arguments));
      };
    });

    it('is true and does not warn if BROCCOLI_VIZ=1', function() {
      process.env.BROCCOLI_VIZ = '1';
      expect(instrumentation.isVizEnabled()).to.eql(true);
      expect(warnInvocations).to.eql([]);
    });

    it('is true and warns at most once if BROCCOLI_VIZ is set but not 1', function() {
      process.env.BROCCOLI_VIZ = 'on';
      expect(instrumentation.isVizEnabled()).to.eql(true);
      expect(instrumentation.isVizEnabled()).to.eql(true);
      expect(warnInvocations).to.eql([
        "Please set BROCCOLI_VIZ=1 to enable visual instrumentation, rather than 'on'"
      ]);
    });

    it('is false if BROCCOLI_VIZ is unset', function() {
      expect('BROCCOLI_VIZ' in process.env).to.eql(false);
      expect(instrumentation.isVizEnabled()).to.eql(false);
      expect(warnInvocations).to.eql([]);
    });
  });

  describe('.isEnabled', function() {
    beforeEach(function() {
      instrumentation = new Instrumentation({
        ui: new MockUI(),
      });
      delete process.env.BROCCOLI_VIZ;
      delete process.env.EMBER_CLI_INSTRUMENTATION;
    });

    it('is true if BROCCOLI_VIZ=1', function() {
      process.env.BROCCOLI_VIZ = '1';
      expect(instrumentation.isEnabled()).to.eql(true);
    });

    it('is true if EMBER_CLI_INSTRUMENTATION=1', function() {
      process.env.EMBER_CLI_INSTRUMENTATION = '1';
      expect(instrumentation.isEnabled()).to.eql(true);
    });

    it('is false if EMBER_CLI_INSTRUMENTATION != 1', function() {
      process.env.EMBER_CLI_INSTRUMENTATION = 'on';
      expect(instrumentation.isEnabled()).to.eql(false);
    });

    it('is false if both BROCCOLI_VIZ and EMBER_CLI_INSTRUMENTATION are unset', function() {
      expect('BROCCOLI_VIZ' in process.env).to.eql(false);
      expect('EMBER_CLI_INSTRUMENTATION' in process.env).to.eql(false);
      expect(instrumentation.isEnabled()).to.eql(false);
    });
  });

  describe('.start', function() {
    var project;
    var instrumentation;
    var heimdall;

    beforeEach( function() {
      project = new MockProject();
      instrumentation = project.instrumentation;
      instrumentation._heimdall = heimdall = new Heimdall();
      process.env.EMBER_CLI_INSTRUMENTATION = '1';
    });

    it('starts a new subtree for name', function() {
      var heimdallStart = td.replace(heimdall, 'start');

      instrumentation.start('init');

      td.verify(heimdallStart(td.matchers.contains({
        name: 'init',
        emberCLI: true,
      })));

      instrumentation.start('build');

      td.verify(heimdallStart(td.matchers.contains({
        name: 'build',
        emberCLI: true,
      })));

      instrumentation.start('command');

      td.verify(heimdallStart(td.matchers.contains({
        name: 'command',
        emberCLI: true,
      })));

      instrumentation.start('shutdown');

      td.verify(heimdallStart(td.matchers.contains({
        name: 'shutdown',
        emberCLI: true,
      })));
    });

    it('does not start a subtree if instrumentation is disabled', function() {
      process.env.EMBER_CLI_INSTRUMENTATION = 'no thanks';

      var heimdallStart = td.replace(heimdall, 'start');

      instrumentation.start('init');

      td.verify(heimdallStart(), { times: 0, ignoreExtraArgs: true });
    });

    it('throws if name is unexpected', function() {
      expect(function () {
        instrumentation.start('a party!');
      }).to.throw('No such instrumentation "a party!"');
    });
  });

  describe('.stopAndReport', function() {
    var project;
    var instrumentation;
    var addon;

    beforeEach( function() {
      project = new MockProject();
      instrumentation = project.instrumentation;
      process.env.EMBER_CLI_INSTRUMENTATION = '1';

      addon = {
        name: 'Test Addon',
      };
      project.addons = [{
        name: 'Some Other Addon',
      }, addon];
    });

    it('throws if name is unexpected', function() {
      expect(function () {
        instrumentation.stopAndReport('the weather');
      }).to.throw('No such instrumentation "the weather"');
    });

    it('throws if name has not yet started', function() {
      expect(function () {
        instrumentation.stopAndReport('init');
      }).to.throw('Cannot stop instrumentation "init".  It has not started.');
    });

    it.only('computes summary for name', function() {
      var buildSummary = td.replace(instrumentation, '_buildSummary');
      var initSummary = td.replace(instrumentation, '_initSummary');
      var treeFor = td.replace(instrumentation, '_instrumentationTreeFor');

      var invokeAddonHook = td.replace(instrumentation, '_invokeAddonHook');
      var writeInstrumentation = td.replace(instrumentation, '_writeInstrumentation');

      var mockInitSummary = 'init summary';
      var mockBuildSummary = 'build summary';
      var mockInitTree = 'init tree';
      var mockBuildTree = 'build tree';

      td.when(initSummary()).thenReturn(mockInitSummary);
      td.when(buildSummary()).thenReturn(mockBuildSummary);
      td.when(treeFor('init')).thenReturn(mockInitTree);
      td.when(treeFor('build')).thenReturn(mockBuildTree);

      td.verify(invokeAddonHook(), { ignoreExtraArgs: true, times: 0 });
      td.verify(writeInstrumentation(), { ignoreExtraArgs: true, times: 0 });

      instrumentation.start('init');
      instrumentation.stopAndReport('init');

      td.verify(invokeAddonHook('init', {
        summary: mockInitSummary,
        tree: mockInitTree,
      }), { ignoreExtraArgs: true, times: 1 });

      td.verify(writeInstrumentation('init', {
        summary: mockInitSummary,
        tree: mockInitTree,
      }), { ignoreExtraArgs: true, times: 1 });


      td.verify(invokeAddonHook(), { ignoreExtraArgs: true, times: 1 });
      td.verify(writeInstrumentation(), { ignoreExtraArgs: true, times: 1 });

      instrumentation.start('build');
      instrumentation.stopAndReport('build');

      td.verify(invokeAddonHook('build', {
        summary: mockBuildSummary,
        tree: mockBuildTree,
      }), { ignoreExtraArgs: true, times: 1 });

      td.verify(writeInstrumentation('build', {
        summary: mockBuildSummary,
        tree: mockBuildTree,
      }), { ignoreExtraArgs: true, times: 1 });
    });

    it('writes instrumentation info if viz is enabled', function() {
      expect('assertions exist').to.eql(true);
    });

    it('does not write instrumentation info if viz is disabled', function() {
      expect('assertions exist').to.eql(true);
    });

    if (experiments.INSTRUMENTATION) {
      it('invokes addons that have [INSTRUMENTATION] for init', function() {
        expect('assertions exist').to.eql(true);
      });

      it('invokes addons that have [INSTRUMENTATION] for build', function() {
        expect('assertions exist').to.eql(true);
      });

      it('does not invoke addons if instrumentation is disabled', function() {
        expect('assertions exist').to.eql(true);
      });
    }

    describe('(build)', function() {
      if (experiments.BUILD_INSTRUMENTATION) {
        it('invokes addons that have [BUILD_INSTRUMENTATION] and not [INSTRUMENTATION]', function() {
          expect('assertions exist').to.eql(true);
        });
      }

      if (experiments.BUILD_INSTRUMENTATION && experiments.INSTRUMENTATION) {
        it('prefers [INSTRUMENTATION] to [BUILD_INSTRUMENTATION]', function() {
          expect('assertions exist').to.eql(true);
        });
      }
    });
  });

  describe('._instrumenationTreeFor', function() {
    it('produces a valid tree for init', function() {
      expect('assertions exist').to.eql(true);
    });

    it('produces a valid tree for build', function() {
      expect('assertions exist').to.eql(true);
    });
  });

  describe('._buildSummary', function() {
  });

  describe('._initSummary', function() {

  });




  // TODO: verify these cases are preserved

  describe('instrumentation', function() {
    beforeEach(function() {
      return mkTmpDirIn(tmproot).then(function (dir) {
        process.chdir(dir);
      });
    });

    afterEach(function() {
      delete process.env.EMBER_CLI_INSTRUMENTATION;

      process.chdir(root);
      return remove(tmproot);
    });

    if (experiments.BUILD_INSTRUMENTATION) {
      it('invokes build instrumentation hook when EMBER_CLI_INSTRUMENTATION=1', function() {
        process.env.EMBER_CLI_INSTRUMENTATION = '1';
        var mockVizInfo = Object.create(null);
        var mockResultAnnotation = Object.create(null);

        var computeVizInfo = td.function();
        builder._computeVizInfo = computeVizInfo;

        td.when(
          computeVizInfo(td.matchers.isA(Number), buildResults, mockResultAnnotation)
        ).thenReturn(mockVizInfo);

        return builder.build(null, mockResultAnnotation).then(function() {
          expect(hooksCalled).to.include('buildInstrumentation');
          expect(instrumentationArg).to.equal(mockVizInfo);
        });
      });
    }

    it('writes and invokes build instrumentation hook when BROCCOLI_VIZ=1', function() {
      process.env.BROCCOLI_VIZ = '1';
      var mockVizInfo = Object.create(null);
      var mockResultAnnotation = Object.create(null);

      buildResults = mockBuildResultsWithHeimdallSubgraph;

      var computeVizInfo = td.function();
      td.when(
        computeVizInfo(td.matchers.isA(Number), buildResults, mockResultAnnotation)
      ).thenReturn(mockVizInfo);

      builder._computeVizInfo = computeVizInfo;

      return builder.build(null, mockResultAnnotation).then(function() {
        if (experiments.BUILD_INSTRUMENTATION) {
          expect(hooksCalled).to.include('buildInstrumentation');
          expect(instrumentationArg).to.equal(mockVizInfo);
        }

        var vizFiles = walkSync('.', { globs: ['broccoli-viz.*.json'] });
        expect(vizFiles.length).to.equal(1);
        var vizFile = vizFiles[0];
        var vizInfo = fse.readJSONSync(vizFile);

        expect(Object.keys(vizInfo)).to.eql(['nodes']);
      });
    });

    it('does not invoke build instrumentation hook without BROCCOLI_VIZ or EMBER_CLI_INSTRUMENTATION', function() {
      var mockVizInfo = Object.create(null);
      var mockResultAnnotation = Object.create(null);

      var computeVizInfo = td.function();
      builder._computeVizInfo = computeVizInfo;

      td.when(
        computeVizInfo(td.matchers.isA(Number), buildResults, mockResultAnnotation)
      ).thenReturn(mockVizInfo);

      return builder.build(null, mockResultAnnotation).then(function() {
        expect(hooksCalled).to.not.include('buildInstrumentation');
        expect(instrumentationArg).to.equal(undefined);
      });
    });
  });

  describe('._computeVizInfo', function() {

    var buildResults;
    var resultAnnotation;

    beforeEach(function() {
      var heimdall = new Heimdall();

      // a
      // ├── b1
      // │   └── c1
      // └── b2
      //     ├── c2
      //     │   └── d1
      //     └── c3
      heimdall.registerMonitor('mystats', StatsSchema);
      var a = heimdall.start('a');
      var b1 = heimdall.start({ name: 'b1', broccoliNode: true, broccoliCachedNode: false });
      var c1 = heimdall.start('c1');
      heimdall.statsFor('mystats').x = 3;
      heimdall.statsFor('mystats').y = 4;
      c1.stop();
      b1.stop();
      var b2 = heimdall.start('b2');
      var c2 = heimdall.start({ name: 'c2', broccoliNode: true, broccoliCachedNode: false });
      var d1 = heimdall.start({ name: 'd1', broccoliNode: true, broccoliCachedNode: true });
      d1.stop();
      c2.stop();
      var c3 = heimdall.start('c3');
      c3.stop();
      b2.stop();
      a.stop();

      buildResults = {
        outputChanges: [
          'assets/app.js',
          'assets/app.css'
        ],
        graph: {
          __heimdall__: heimdall.root._children[0],
        },
        directory: 'tmp/something-abc',
      };
    });

    it('returns a pojo with the expected JSON format for initial builds', function() {
      resultAnnotation = {
        type: 'initial'
      };

      var result = Builder._computeVizInfo(0, buildResults, resultAnnotation);

      expect(result.summary.build).to.eql({
        type: 'initial',
        count: 0,
        outputChangedFiles: [
          'assets/app.js',
          'assets/app.css'
        ],
      });

      expect(result.summary.output).to.eql('tmp/something-abc');
      expect(result.summary.totalTime).to.be.within(0, 2000000); //2ms (in nanoseconds)
      expect(result.summary.buildSteps).to.eql(2); // 2 nodes with broccoliNode: true

      var buildJSON = result.buildTree.toJSON();

      expect(Object.keys(buildJSON)).to.eql(['nodes']);
      expect(buildJSON.nodes.length).to.eql(6);

      expect(buildJSON.nodes.map(function(x) { return x.id; })).to.eql([
        1, 2, 3, 4, 5, 6
      ]);

      expect(buildJSON.nodes.map(function(x) { return x.label; })).to.eql([
        { name: 'a' },
        { name: 'b1', broccoliNode: true },
        { name: 'c1' },
        { name: 'b2' },
        { name: 'c2', broccoliNode: true },
        { name: 'c3' },
      ]);

      expect(buildJSON.nodes.map(function (x) { return x.children;})).to.eql([
        [2, 4],
        [3],
        [],
        [5, 6],
        [],
        []
      ]);

      var stats = buildJSON.nodes.map(function (x) { return x.stats; });
      stats.forEach(function (nodeStats) {
        expect('own' in nodeStats).to.eql(true);
        expect('time' in nodeStats).to.eql(true);
        expect(nodeStats.time.self).to.be.within(0, 2000000); //2ms in nanoseconds
      });

      var c1Stats = stats[2];
      expect(c1Stats.mystats).to.eql({
        x: 3,
        y: 4,
      });
    });

    it('returns a pojo with the extra summary information for rebuilds', function() {
      resultAnnotation = {
        type: 'rebuild',
        changedFileCount: 7,
        primaryFile: 'a',
        changedFiles: [
          'a',
          'b',
          'c',
          'd',
          'e',
          'f',
          'g',
          'h',
          'i',
          'j',
          'k',
        ],
      };
      var result = Builder._computeVizInfo(0, buildResults, resultAnnotation);

      expect(result.summary.build).to.eql({
        type: 'rebuild',
        count: 0,
        outputChangedFiles: [
          'assets/app.js',
          'assets/app.css'
        ],
        primaryFile: 'a',
        changedFileCount: 11,
        changedFiles: [
          'a',
          'b',
          'c',
          'd',
          'e',
          'f',
          'g',
          'h',
          'i',
          'j',
        ],
      });
    });

    it('returns an object with buildTree that supports the expected API', function() {
      resultAnnotation = {
        type: 'initial'
      };
      var result = Builder._computeVizInfo(0, buildResults, resultAnnotation);
      var buildTree = result.buildTree;

      var preOrderNames = itr2Array(buildTree.preOrderIterator()).map(function (x) { return x.label.name; });
      expect(preOrderNames, 'pre order').to.eql([
        'a', 'b1', 'c1', 'b2', 'c2', 'c3'
      ]);

      var postOrderNames = itr2Array(buildTree.postOrderIterator()).map(function (x) { return x.label.name; });
      expect(postOrderNames, 'post order').to.eql([
        'c1', 'b1', 'c2', 'c3', 'b2', 'a'
      ]);

      var c2 = itr2Array(buildTree.preOrderIterator()).filter(function (x) {
        return x.label.name === 'c2';
      })[0];

      var ancestorNames = itr2Array(c2.ancestorsIterator()).map(function (x) { return x.label.name;});
      expect(ancestorNames).to.eql([
        'b2', 'a'
      ]);
    });
  });

});
