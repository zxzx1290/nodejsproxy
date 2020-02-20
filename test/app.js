'use strict';

const expect = require('expect.js');

let config;
switch (process.env.NODE_ENV) {
    case 'prod':
        config = require('../config-prod.js');
        break;
    case 'test':
        config = require('../config-test.js');
        break;
    default:
        console.error('unknown config type');
        process.exit()
}

const tunnel = new(require('../lib/tunnels.js'))(config);

const net = require("net");

const session = 'test session';

let socket = new net.Socket();
socket.id = 'testid';


describe('#tunnels.js', function() {
    it('setWebSocket should return true', function() {
        expect(tunnel.setWebSocket(session, socket)).to.be.ok();
    });

    it('removeWebSocket should return true', function() {
        expect(tunnel.removeWebSocket(session)).to.be.ok();
    });
});

const util = require('../lib/util.js');
util.config(config);

describe('#util.js', function() {
    it('md5 should return correctly', function() {
        expect(util.md5('UtWtT8QxI54YaYC9rXfFUjPbtrOJDgsT')).to.eql('cd12ddb1c72030e6af3c5347f611cbed');
    });

    it('sha512 should return correctly', function() {
        expect(util.sha512('UtWtT8QxI54YaYC9rXfFUjPbtrOJDgsT')).to.eql('e6b3068636b82a7fb7becf7f40152a94c7bd3ef261b8b83f146ec9adbdefc50ffbbf9327a3d79db35ed5304c39229dd326553b11696d0eb9bf1021104237dc8d');
    });

    it('getPrefixURL should return correctly', function() {
        expect(util.getPrefixURL('example.com', 'login')).to.eql('/login');
    });

    it('sendLineBot should return true', function() {
        expect(util.sendLineBot('')).to.be.ok();
    });

    it('randomString should return string', function() {
        expect(util.randomString()).to.be.an('string');
    });
});

const view = new (require('../lib/view.js'))(config);

describe('#view.js', function() {
    it('view should return string', function() {
        expect(view.genView('example.com', '1.1.1.1', '/', 0, util.getPrefixURL('example.com', 'exlogin'))).to.be.an('string');
    });
});