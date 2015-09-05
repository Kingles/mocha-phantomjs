var Reporter;
var USAGE;
var config;
var fs;
var mocha;
var reporter;
var system;
var webpage;
var bind = function (fn, me) {
    return function () {
        return fn.apply(me, arguments);
    };
};

system = require('system');

webpage = require('webpage');

fs = require('fs');

USAGE = 'Usage: phantomjs mocha-phantomjs.coffee URL REPORTER [CONFIG]';

Reporter = (function () {
    function Reporter(reporter1, config1) {
        this.reporter = reporter1;
        this.config = config1;
        this.checkStarted = bind(this.checkStarted, this);
        this.waitForRunMocha = bind(this.waitForRunMocha, this);
        this.waitForInitMocha = bind(this.waitForInitMocha, this);
        this.waitForMocha = bind(this.waitForMocha, this);
        this.url = system.args[1];
        this.columns = parseInt(system.env.COLUMNS || 75, 10) * .75 | 0;
        this.mochaStartWait = this.config.timeout || 6000;
        this.startTime = Date.now();
        this.output = this.config.file ? fs.open(this.config.file, 'w') : system.stdout;
        if (!this.url) {
            this.fail(USAGE);
        }
    }

    Reporter.prototype.run = function () {
        this.initPage();
        return this.loadPage();
    };

    Reporter.prototype.customizeMocha = function (options) {
        return Mocha.reporters.Base.window.width = options.columns;
    };

    Reporter.prototype.customizeOptions = function () {
        return {
            columns: this.columns,
        };
    };

    Reporter.prototype.fail = function (msg, errno) {
        if (this.output && this.config.file) {
            this.output.close();
        }
        if (msg) {
            console.log(msg);
        }
        return phantom.exit(errno || 1);
    };

    Reporter.prototype.finish = function () {
        if (this.config.file) {
            this.output.close();
        }
    };

    Reporter.prototype.initPage = function () {
        var cookie;
        var i;
        var len;
        var ref;
        var self = this;
        this.page = webpage.create({
            settings: this.config.settings,
        });
        if (this.config.headers) {
            this.page.customHeaders = this.config.headers;
        }
        ref = this.config.cookies || [];
        for (i = 0, len = ref.length; i < len; i++) {
            cookie = ref[i];
            this.page.addCookie(cookie);
        }
        if (this.config.viewportSize) {
            this.page.viewportSize = this.config.viewportSize;
        }
        this.page.onConsoleMessage = function (msg) {
            if (msg === '[WDS] App hot update...' || msg === '[WDS] App updated. Reloading...') {
                self.page.reload();
            // TODO: Make this smarter.
            }
            return system.stdout.writeLine(msg);
        };
        this.page.onResourceError = (function (_this) {
            return function (resErr) {
                if (!_this.config.ignoreResourceErrors) {
                    return system.stdout.writeLine('Error loading resource ' + resErr.url + ' (' + resErr.errorCode + '). Details: ' + resErr.errorString);
                }
            };
        })(this);
        this.page.onError = (function (_this) {
            return function (msg, traces) {
                var file;
                var index;
                var j;
                var len1;
                var line;
                var ref1;
                if (_this.page.evaluate(function () {
                        return window.onerror != null;
                    })) {
                    return;
                }
                for (index = j = 0, len1 = traces.length; j < len1; index = ++j) {
                    ref1 = traces[index], line = ref1.line, file = ref1.file;
                    traces[index] = '  ' + file + ':' + line;
                }
                return _this.fail(msg + '\n\n' + (traces.join('\n')));
            };
        })(this);
        return this.page.onInitialized = (function (_this) {
            return function () {
                return _this.page.evaluate(function (env) {
                    return window.mochaPhantomJS = {
                        env: env,
                        failures: 0,
                        ended: false,
                        started: false,
                        run: function () {
                            mochaPhantomJS.runArgs = arguments;
                            mochaPhantomJS.started = true;
                            window.callPhantom({
                                'mochaPhantomJS.run': true,
                            });
                            return mochaPhantomJS.runner;
                        },
                    };
                }, system.env);
            };
        })(this);
    };

    Reporter.prototype.loadPage = function () {
        this.page.open(this.url);
        this.page.onLoadFinished = (function (_this) {
            return function (status) {
                _this.page.onLoadFinished = function () {};
                if (status !== 'success') {
                    _this.onLoadFailed();
                }
                return _this.waitForInitMocha();
            };
        })(this);
        return this.page.onCallback = (function (_this) {
            return function (data) {
                if (data != null ? data.hasOwnProperty('Mocha.process.stdout.write') : void 0) {
                    _this.output.write(data['Mocha.process.stdout.write']);
                } else if (data != null ? data.hasOwnProperty('mochaPhantomJS.run') : void 0) {
                    if (_this.injectJS()) {
                        _this.waitForRunMocha();
                    }
                } else if (typeof (data != null ? data.screenshot : void 0) === 'string') {
                    _this.page.render(data.screenshot + '.png');
                }
                return true;
            };
        })(this);
    };

    Reporter.prototype.onLoadFailed = function () {
        return this.fail('Failed to load the page. Check the url: ' + this.url);
    };

    Reporter.prototype.injectJS = function () {
        if (this.page.evaluate(function () {
                return window.mocha != null;
            })) {
            this.page.injectJs('mocha-phantomjs/core_extensions.js');
            this.page.evaluate(this.customizeMocha, this.customizeOptions());
            return true;
        } else {
            this.fail('Failed to find mocha on the page.');
            return false;
        }
    };

    Reporter.prototype.runMocha = function () {
        var base;
        var customReporter;
        var wrappedReporter;
        var wrapper;
        this.page.evaluate(function (config) {
            mocha.useColors(config.useColors);
            mocha.bail(config.bail);
            if (config.grep) {
                mocha.grep(config.grep);
            }
            if (config.invert) {
                return mocha.invert();
            }
        }, this.config);
        if (typeof (base = this.config.hooks).beforeStart === 'function') {
            base.beforeStart(this);
        }
        if (this.page.evaluate(this.setupReporter, this.reporter) !== true) {
            customReporter = fs.read(this.reporter);
            wrapper = function () {
                var exports;
                var module;
                var process;
                var require;
                require = function (what) {
                    var r;
                    what = what.replace(/[^a-zA-Z0-9]/g, '');
                    for (r in Mocha.reporters) {
                        if (r.toLowerCase() === what) {
                            return Mocha.reporters[r];
                        }
                    }
                    throw new Error("Your custom reporter tried to require '" + what + "', but Mocha is not running in Node.js in mocha-phantomjs, so Node modules cannot be required - only other reporters");
                };
                module = {};
                exports = void 0;
                process = Mocha.process;
                'customreporter';
                return Mocha.reporters.Custom = exports || module.exports;
            };
            wrappedReporter = wrapper.toString().replace("'customreporter'", '(function() {' + (customReporter.toString()) + '})()');
            this.page.evaluate(wrappedReporter);
            if (this.page.evaluate(function () {
                    return !Mocha.reporters.Custom;
                }) || this.page.evaluate(this.setupReporter) !== true) {
                this.fail('Failed to use load and use the custom reporter ' + this.reporter);
            }
        }
        if (this.page.evaluate(this.runner)) {
            this.mochaRunAt = new Date().getTime();
            return this.waitForMocha();
        } else {
            return this.fail('Failed to start mocha.');
        }
    };

    Reporter.prototype.waitForMocha = function () {
        var base;
        var ended;
        ended = this.page.evaluate(function () {
            return mochaPhantomJS.ended;
        });
        if (ended) {
            if (typeof (base = this.config.hooks).afterEnd === 'function') {
                base.afterEnd(this);
            }
            return this.finish();
        } else {
            return setTimeout(this.waitForMocha, 100);
        }
    };

    Reporter.prototype.waitForInitMocha = function () {
        if (!this.checkStarted()) {
            return setTimeout(this.waitForInitMocha, 100);
        }
    };

    Reporter.prototype.waitForRunMocha = function () {
        if (this.checkStarted()) {
            return this.runMocha();
        } else {
            return setTimeout(this.waitForRunMocha, 100);
        }
    };

    Reporter.prototype.checkStarted = function () {
        var started;
        started = this.page.evaluate(function () {
            return mochaPhantomJS.started;
        });
        if (!started && this.mochaStartWait && this.startTime + this.mochaStartWait < Date.now()) {
            this.fail('Failed to start mocha: Init timeout', 255);
        }
        return started;
    };

    Reporter.prototype.setupReporter = function (reporter) {
        var error;
        var error1;
        try {
            mocha.setup({
                reporter: reporter || Mocha.reporters.Custom,
            });
            return true;
        } catch (error1) {
            error = error1;
            return error;
        }
    };

    Reporter.prototype.runner = function () {
        var cleanup;
        var error;
        var error1;
        var ref;
        var ref1;
        try {
            mochaPhantomJS.runner = mocha.run.apply(mocha, mochaPhantomJS.runArgs);
            if (mochaPhantomJS.runner) {
                cleanup = function () {
                    mochaPhantomJS.failures = mochaPhantomJS.runner.failures;
                    return mochaPhantomJS.ended = true;
                };
                if ((ref = mochaPhantomJS.runner) != null ? (ref1 = ref.stats) != null ? ref1.end : void 0 : void 0) {
                    cleanup();
                } else {
                    mochaPhantomJS.runner.on('end', cleanup);
                }
            }
            return !!mochaPhantomJS.runner;
        } catch (error1) {
            error = error1;
            return false;
        }
    };

    return Reporter;

})();

if (phantom.version.major < 1 || (phantom.version.major === 1 && phantom.version.minor < 9)) {
    console.log('mocha-phantomjs requires PhantomJS > 1.9.1');
    phantom.exit(-1);
}

reporter = system.args[2] || 'spec';

config = JSON.parse(system.args[3] || '{}');

if (config.hooks) {
    config.hooks = require(config.hooks);
} else {
    config.hooks = {};
}

mocha = new Reporter(reporter, config);

mocha.run();
