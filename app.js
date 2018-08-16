'use strict';

const http = require('http');

const httpProxy = require('http-proxy');
const url = require('url');
const cookie = require('cookie');
const qs = require('querystring');
const request = require('request');

let config;
switch(process.env.NODE_ENV){
    case 'prod':
        config = require('./config-prod.js');
        break;
    case 'test':
        config = require('./config-test.js');
        break;
    default:
        console.error('unknown config type');
        return;
}


const util = require('./lib/util.js');
const client = new (require('./lib/redisClient.js'))(config);
const view = new (require('./lib/view.js'))(config);
const tunnel = new (require('./lib/tunnels.js'))(config);


// 算法
// id + req.headers.host + secret






const proxyServer = http.createServer(function(req, res) {
    let ip = req.headers['x-real-ip'];
    let cookies = cookie.parse(req.headers.cookie || '');
    let path = url.parse(req.url);

    if (path.pathname === '/favicon.ico') {
        res.writeHead(302, {
            'Location': 'https://testused.com/favicon.ico'
        });
        res.end();
        return;
    }

    client.get(util.md5(ip), function(err, reply) {
        if (reply !== null && parseInt(reply, 10) >= config.maxretry) {
            res.write('banned ip ' + ip);
            res.end();
            console.log('banned ip ' + ip);
        } else {
            if (err !== null) {
                res.write('auth unavailable');
                res.end();
                console.log('auth unavailable'+err);
                return;
            }
            // not ban
            if (typeof cookies['proxysession'] !== 'undefined') {
                if (path.pathname === (util.getPrefixURL(config, req.headers.host, 'logout'))) {
                    // logout
                    let timeObj = new Date(new Date().getTime() - 432000000).toUTCString(); // 5 days ago(ms)
                    res.writeHead(200, {
                        'Content-Type': 'text/html',
                        'Set-Cookie': 'proxysession=;path=/;Expires=' + timeObj + ';httpOnly;Secure'
                    });
                    res.write('<script>window.location.href="' + util.getPrefixURL(config, req.headers.host, "exroot") + '";</script>');
                    if (typeof cookies['proxysession'] !== 'undefined') {
                        let key = util.sha512(cookies['proxysession'] + req.headers.host + config.secret);
                        // remove websocket
                        tunnel.removeWebSocket(key);
                        client.del(key, function(err, reply) {
                            res.end();
                        });
                    } else {
                        res.end();
                    }
                } else {
                    // check session
                    client.get(util.sha512(cookies['proxysession'] + req.headers.host + config.secret), function(err, reply) {
                        if (reply === null) {
                            // session not found
                            client.incr(util.md5(ip), function(err, reply) {
                                client.get(util.md5(ip), function(err, reply) {
                                    res.writeHead(200, {
                                        'Content-Type': 'text/html'
                                    });
                                    let timeObj = new Date(new Date().getTime() - 432000000).toUTCString(); // 5 days ago(ms)
                                    res.writeHead(200, {
                                        'Content-Type': 'text/html',
                                        'Set-Cookie': 'proxysession=;path=/;Expires=' + timeObj + ';httpOnly;Secure'
                                    });

                                    res.write(view.genView(req.headers.host, ip, path.pathname, reply, util.getPrefixURL(config, req.headers.host, 'exlogin')));
                                    res.end();
                                });
                            });
                        } else {
                            // auth ok
                            tunnel.passProxy(req.headers.host, reply, req, res);
                        }
                    });
                }
            } else {
                // no session
                if (req.method === 'POST' && path.pathname === (util.getPrefixURL(config, req.headers.host, 'login'))) {
                    //login
                    let body = '';
                    req.on('data', function(data) {
                        body += data;
                        // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
                        if (body.length > 1000) {
                            // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
                            req.connection.destroy();
                        }
                    });
                    req.on('end', function() {
                        let post = qs.parse(body);
                        if (typeof post.username !== 'undefined' && typeof post.password !== 'undefined') {
                            let isok = util.checkUser(config, req.headers.host, post.username, post.password);
                            if (isok) {
                                //login success
                                //generate id
                                let id = util.sha512(util.randomString(32)+Date.now().toString());
                                if (typeof (id) === 'undefined' || id === '') {
                                    res.writeHead(500, {
                                        'Content-Type': 'text/html'
                                    });
                                    res.write('generate ID fail');
                                    res.end();
                                    console.log('generate ID fail');
                                    return;
                                }
                                let rediskey = util.sha512(id + req.headers.host + config.secret);

                                // line bot
                                request({
                                    method: 'GET',
                                    url: config.loginNotify + encodeURIComponent(post.username + ' 於 ' + req.headers['x-real-ip'] + ' 登入 ' + req.headers.host + '\r\nsession ' + rediskey.substring(0,5))
                                }, function(error, response, body) {});

                                // del ban record
                                client.del(util.md5(ip), function(err, reply) {
                                    // set session
                                    // redis儲存用
                                    let loginAliveSec = config.defaultLoginAliveSec;
                                    // cookie用
                                    let cookieAliveSec = '0';
                                    // check remember me
                                    if(post.rememberme === 'true'){
                                        loginAliveSec = config.longLoginAliveSec;
                                        cookieAliveSec = new Date(new Date().getTime() + (config.longLoginAliveSec * 1000)).toUTCString();
                                    }

                                    // redis use seconds
                                    client.set(rediskey, Buffer.from(post.username).toString('base64'), 'EX', loginAliveSec, function(err, reply) {
                                        // console.log('user '+post.username+' login success');
                                        res.setHeader('Content-Type', 'text/html');
                                        res.setHeader('Set-Cookie',
                                        [
                                            'proxysession=' + id + ';path=/;Expires=' + cookieAliveSec + ';httpOnly;Secure',
                                            'proxyuser=' + post.username + ';path=/;Expires=' + cookieAliveSec + ';httpOnly;Secure',
                                            'proxyhash=' + util.md5(post.username + config.usersalt) + ';path=/;Expires=' + cookieAliveSec + ';httpOnly;Secure',
                                        ]);
                                        res.write(JSON.stringify({'code':'1','data':util.getPrefixURL(config, req.headers.host, 'exroot')}));
                                        res.end();
                                    });
                                });
                            } else {
                                // login fail
                                client.incr(util.md5(ip), function(err, reply) {
                                    client.get(util.md5(ip), function(err, reply) {
                                        res.writeHead(200, {
                                            'Content-Type': 'text/html'
                                        });
                                        res.write(JSON.stringify({'code':'2','data':reply}));
                                        res.end();
                                    });
                                });
                            }
                        } else {
                            res.writeHead(200, {
                                'Content-Type': 'text/html'
                            });
                            res.write(JSON.stringify({'code':'3'}));
                            res.end();
                        }
                    });
                } else {
                    res.writeHead(200, {
                        'Content-Type': 'text/html'
                    });
                    if(reply===null){
                        reply=0;
                    }
                    res.write(view.genView(req.headers.host, ip, path.pathname, reply, util.getPrefixURL(config, req.headers.host, 'exlogin')));
                    res.end();
                }
            }
        }
    });
});


proxyServer.on('upgrade', function(req, socket, head) {
    let ip = req.headers['x-real-ip'];
    let cookies = cookie.parse(req.headers.cookie || '');
    client.get(util.md5(ip), function(err, reply) {
        if (reply !== null && parseInt(reply, 10) >= config.maxretry) {
            socket.write('HTTP/1.1 403 Forbidden\r\n' +
                'Access Denied: You are banned\r\n' +
                '\r\n');
            socket.end();
            console.log('You are banned');
        } else if (typeof cookies['proxysession'] !== 'undefined') {
            // check session
            let key = util.sha512(cookies['proxysession'] + req.headers.host + config.secret);
            client.get(key, function(err, reply) {
                if (reply === null) {
                    socket.write('HTTP/1.1 403 Forbidden\r\n' +
                        'Upgrade: WebSocket\r\n' +
                        'Connection: Close\r\n' +
                        'Access Denied: You are banned\r\n' +
                        '\r\n');
                    socket.end();
                    console.log('You are banned');
                } else {
                    // auth ok
                    // borken on socket interrupt, catch no work
                    tunnel.passProxy(req.headers.host, reply, req, null, socket, head);
                    socket.id = Math.random().toString(16).substring(2);
                    // store websocket
                    tunnel.setWebSocket(key, socket);
                }
            });
        } else {
            socket.write('HTTP/1.1 403 Forbidden\r\n' +
                'Access Denied: You are not allow\r\n' +
                '\r\n');
            socket.end();
            console.log('You are not allow');
        }
    });
});


proxyServer.listen(8600, '127.0.0.1');
