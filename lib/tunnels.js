'use strict';

const httpProxy = require('http-proxy');

module.exports = function(config) {
    // proxy server物件
    let tunnelobj = {};
    // proxy websocket物件(依user)
    let websocketObj = {};

    // init tunnel
    for(let [tu,content] of Object.entries(config.backendTunnel)){
        console.log('init backend tunnel : ' + tu + ' on host ' + content['host'] + ' port ' + content['port']);
        const proxy = new httpProxy.createProxyServer({
            target: {
                host: content['forward'],
                ws: true,
                port: content['port'],
            },
            headers: {
                host: content['host'],
            }
        });

        // handle error
        proxy.on('error', function(err, req, res) {
            console.log('=== begin log error ===');
            console.log(err);
            console.log('=== end log error ===');

            if (!res.headersSent) {
                if (typeof res.writeHead === 'function') {
                    res.writeHead(500, {
                        'Content-Type': 'text/plain'
                    });
                }
            }

            res.end('The website is down or error occurred');
        });

        // handle proxy websocket request
        proxy.on('proxyReqWs', function(proxyReq, req, socket, options, head) {
            // console.log(socket);
            // console.log(socket.id);
            // console.log(socket._readableState);
            // console.log(socket._readableState.pipes.id);
        });

        // handle proxy websocket close
        proxy.on('close', function (res, socket, head) {
            console.log(socket);
            if(socket._readableState.pipes === null){
                console.log('no socket id match, fallback use other');
                console.log('=== begin experiment ===');
                Object.keys(websocketObj).map(function(sess){
                    Object.keys(websocketObj[sess]).map(function(ws){
                        if(typeof(websocketObj[sess][ws].id) === 'undefined'){
                            delete websocketObj[sess][ws];
                            console.log('delete empty id socket');
                        }
                    });
                });
                console.log('=== end experiment ===');
            }else{
                let cid = socket._readableState.pipes.id;
                Object.keys(websocketObj).map(function(sess){
                    Object.keys(websocketObj[sess]).map(function(ws){
                        if(websocketObj[sess][ws].id === cid){
                            delete websocketObj[sess][ws];
                        }
                    });
                });
            }

        });
        tunnelobj[tu] = proxy;
    }

    this.passProxy = function(domain, reply, req, res, socket, head) {
        let t = null;
        try {
            t = config.frontendTunnel[domain]['account'][Buffer.from(reply, 'base64').toString()]['backend'];
        } catch (err) {
            console.log('domain ' + domain + ' account ' + Buffer.from(reply, 'base64').toString() + ' can\'t find backend');
            return false;
        }

        if (typeof tunnelobj[t] === 'undefined') {
            console.log('unknown tunnel');
            return false;
        }
        if (typeof socket === 'undefined') {
            // normal req
            tunnelobj[t].web(req, res);
        } else {
            // socket req
            tunnelobj[t].ws(req, socket, head);
        }

        return true;
    }

    this.setWebSocket = function(session, socket) {
        if(typeof websocketObj[session] === 'undefined'){
            websocketObj[session] = {};
        }
        websocketObj[session][socket.id] = socket;
        console.log('socket id: '+socket.id+' set ok');
        return true;
    }

    this.removeWebSocket = function(session) {
        if(typeof websocketObj[session] !== 'undefined'){
            Object.keys(websocketObj[session]).map(function(ws){
                websocketObj[session][ws].destroy();
            });
        }
        delete websocketObj[session];
        return true;
    }
}
