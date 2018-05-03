"use strict";

const http = require("http");
const fs = require("fs");

const httpProxy = require("http-proxy");
const url = require("url");
const cookie = require("cookie");
const redis = require("redis");
const qs = require("querystring");
const request = require("request");
const speakeasy = require("speakeasy");
const crypto = require("crypto");

const config = require("./config.js");

let template = "";

// 取得template內容
fs.readFile(config.template, "utf8", function(err, data) {
    if (err) throw err;
    template = data;
});


// 算法
// id + req.headers.host + secret
// proxy server物件
let tunnelobj = {};
// proxy websocket物件(依user)
let websocketObj = {};

const client = redis.createClient({
    "password": config.redisPassword
});

function md5(data) {
    return crypto.createHash("md5").update(data).digest("hex");
}

function sha512(data) {
    return crypto.createHash("sha512").update(data).digest("hex");
}

String.prototype.replaceAll = function(search, replacement) {
    return this.replace(new RegExp(search, "g"), replacement);
};

// time
function twoDigits(d) {
    if (0 <= d && d < 10) return "0" + d.toString();
    if (-10 < d && d < 0) return "-0" + (-1 * d).toString();
    return d.toString();
}

Date.prototype.toMysqlFormatPlus8 = function() {
    let d = new Date(Date.UTC(this.getUTCFullYear(), this.getUTCMonth(), this.getUTCDate(), this.getUTCHours(), this.getUTCMinutes(), this.getUTCSeconds()));
    d.setUTCHours(d.getUTCHours() + 8);
    return d.getUTCFullYear() + "-" + twoDigits(1 + d.getUTCMonth()) + "-" + twoDigits(d.getUTCDate()) + " " + twoDigits(d.getUTCHours()) + ":" + twoDigits(d.getUTCMinutes()) + ":" + twoDigits(d.getUTCSeconds());
}

function checkuser(req, username, password) {
    if (typeof config.frontendTunnel[req.headers.host] === "undefined") {
        // no match domain
        return false;
    } else {
        if (config.frontendTunnel[req.headers.host]["account"].hasOwnProperty(username)) {

            // test regexp
            if(!/^[0-9]{6}$/.test(password)){
                return false;
            }

            // TOTP
            // Verify a given token
            let tokenValidates = speakeasy.totp.verify({
                secret: config.frontendTunnel[req.headers.host]["account"][username]["totpsecret"],
                encoding: "base32",
                token: password,
                window: 1 // allow 1 step offset, 1 step is 30 sec
            });

            if(!tokenValidates){
                return false;
            }

            return true;
        }
        return false;
    }
}

function passproxy(domain, reply, req, res, socket, head) {
    let t = null;
    try {
        t = config.frontendTunnel[domain]["account"][Buffer.from(reply, "base64").toString()]["backend"];
    } catch (err) {
        console.log("domain " + domain + " account " + Buffer.from(reply, "base64").toString() + " can't find backend");
        return "unknown account or tunnel";
    }

    if (typeof tunnelobj[t] === "undefined") {
        return "unknown tunnel";
    }
    if (typeof socket === "undefined") {
        // normal req
        tunnelobj[t].web(req, res);
    } else {
        // socket req
        tunnelobj[t].ws(req, socket, head);
    }
}

function getprefixurl(domain, type) {
    if (typeof config.frontendTunnel[domain][type] === "undefined") {
        return "/";
    } else {
        return config.frontendTunnel[domain][type];
    }
}

function generateString(count) {
    let _sym = "abcdefghijklmnopqrstuvwxyz1234567890";
    let str = "";

    for (let i = 0; i < count; i++) {
        str += _sym[parseInt(Math.random() * (_sym.length), 10)];
    }
    return str;
}

function genResponse(host, ip, pathname, count) {
    count = count.toString();
    return template.replaceAll("\\<\\?\\= host \\?\\>", host).replaceAll("\\<\\?\= ip \\?\\>", ip).replaceAll("\\<\\?\\= pathname \\?>", pathname).replaceAll("<\\?\\= count \\?>", count).replaceAll("<\\?\\= loginurl \\?>", getprefixurl(host, "exlogin"));
}

// init tunnel
for(let [tu,content] of Object.entries(config.backendTunnel)){
    console.log("init backend tunnel : " + tu + " on host " + content["host"] + " port " + content["port"]);
    const proxy = new httpProxy.createProxyServer({
        target: {
            host: content["forward"],
            ws: true,
            port: content["port"],
        },
        headers: {
            host: content["host"],
        }
    });
    // handle error
    proxy.on("error", function(err, req, res) {
        console.log("=== begin log error ===");
        console.log(err);
        console.log("=== end log error ===");

        if (!res.headersSent) {
            if (typeof res.writeHead === "function") {
                res.writeHead(500, {
                    "Content-Type": "text/plain"
                });
            }
        }

        res.end("The website is down or error occurred");
    });
    // handle proxy websocket close
    proxy.on("close", function (res, socket, head) {
        // view disconnected websocket connections
        let cid = socket._readableState.pipes.id;
        Object.keys(websocketObj).map(function(sess){
            Object.keys(websocketObj[sess]).map(function(ws){
                if(websocketObj[sess][ws].id === cid){
                    delete websocketObj[sess][ws];
                }
            });
        });
    });
    tunnelobj[tu] = proxy;
}



const proxyServer = http.createServer(function(req, res) {
    let ip = req.headers["x-real-ip"];
    let cookies = cookie.parse(req.headers.cookie || "");
    let path = url.parse(req.url);

    if (path.pathname === "/favicon.ico") {
        res.writeHead(302, {
            "Location": "https://testused.com/favicon.ico"
        });
        res.end();
        return;
    }

    client.get(md5(ip), function(err, reply) {
        if (reply !== null && parseInt(reply, 10) >= config.maxretry) {
            res.write("banned ip " + ip);
            res.end();
        } else {
            if (err !== null) {
                res.write("auth unavailable");
                res.end();
                return;
            }
            // not ban
            if (typeof cookies["proxysession"] !== "undefined") {
                if (path.pathname === (getprefixurl(req.headers.host, "logout"))) {
                    // logout
                    let timeObj = new Date(new Date().getTime() - 432000000).toUTCString(); // 5 days ago(ms)
                    res.writeHead(200, {
                        "Content-Type": "text/html",
                        "Set-Cookie": "proxysession=;path=/;Expires=" + timeObj + ";httpOnly;Secure"
                    });
                    res.write("<script>window.location.href=\"" + getprefixurl(req.headers.host, "exroot") + "\";</script>");
                    if (typeof cookies["proxysession"] !== "undefined") {
                        let key = sha512(cookies["proxysession"] + req.headers.host + config.secret);
                        if(typeof websocketObj[key] !== "undefined"){
                            Object.keys(websocketObj[key]).map(function(ws){
                                websocketObj[key][ws].destroy();
                            });
                        }
                        client.del(key, function(err, reply) {
                            delete websocketObj[key];
                            res.end();
                        });
                    } else {
                        res.end();
                    }
                } else {
                    // check session
                    client.get(sha512(cookies["proxysession"] + req.headers.host + config.secret), function(err, reply) {
                        if (reply === null) {
                            // session not found
                            client.incr(md5(ip), function(err, reply) {
                                client.get(md5(ip), function(err, reply) {
                                    res.writeHead(200, {
                                        "Content-Type": "text/html"
                                    });
                                    let timeObj = new Date(new Date().getTime() - 432000000).toUTCString(); // 5 days ago(ms)
                                    res.writeHead(200, {
                                        "Content-Type": "text/html",
                                        "Set-Cookie": "proxysession=;path=/;Expires=" + timeObj + ";httpOnly;Secure"
                                    });

                                    res.write(genResponse(req.headers.host, ip, path.pathname, reply));
                                    res.end();
                                });
                            });
                        } else {
                            // auth ok
                            passproxy(req.headers.host, reply, req, res);
                        }
                    });
                }
            } else {
                // no session
                if (req.method === "POST" && path.pathname === (getprefixurl(req.headers.host, "login"))) {
                    //login
                    let body = "";
                    req.on("data", function(data) {
                        body += data;
                        // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
                        if (body.length > 1000) {
                            // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
                            req.connection.destroy();
                        }
                    });
                    req.on("end", function() {
                        let post = qs.parse(body);
                        if (typeof post.username !== "undefined" && typeof post.password !== "undefined") {
                            let isok = checkuser(req, post.username, post.password);
                            if (isok) {
                                //login success
                                //generate id
                                let id = sha512(generateString(32)+Date.now().toString());
                                if (typeof (id) === "undefined" || id === "") {
                                    res.writeHead(500, {
                                        "Content-Type": "text/html"
                                    });
                                    res.write("generate ID fail");
                                    res.end();
                                    return;
                                }
                                let rediskey = sha512(id + req.headers.host + config.secret);

                                // line bot
                                request({
                                    method: "GET",
                                    url: config.loginNotify + encodeURIComponent(post.username + " 於 " + req.headers["x-real-ip"] + " 登入 " + req.headers.host + "\r\nsession " + rediskey.substring(0,5))
                                }, function(error, response, body) {});

                                // del ban record
                                client.del(md5(ip), function(err, reply) {
                                    // set session
                                    // redis儲存用
                                    let loginAliveSec = config.defaultLoginAliveSec;
                                    // cookie用
                                    let cookieAliveSec = "0";
                                    // check remember me
                                    if(post.rememberme === "true"){
                                        loginAliveSec = config.longLoginAliveSec;
                                        cookieAliveSec = new Date(new Date().getTime() + (config.longLoginAliveSec * 1000)).toUTCString();
                                    }

                                    // redis use seconds
                                    client.set(rediskey, Buffer.from(post.username).toString("base64"), "EX", loginAliveSec, function(err, reply) {
                                        // console.log("user "+post.username+" login success");
                                        res.writeHead(200, {
                                            "Content-Type": "text/html",
                                            "Set-Cookie": "proxysession=" + id + ";path=/;Expires=" + cookieAliveSec + ";httpOnly;Secure"
                                        });
                                        res.write(JSON.stringify({"code":"1","data":getprefixurl(req.headers.host, "exroot")}));
                                        res.end();
                                    });
                                });
                            } else {
                                // login fail
                                client.incr(md5(ip), function(err, reply) {
                                    client.get(md5(ip), function(err, reply) {
                                        res.writeHead(200, {
                                            "Content-Type": "text/html"
                                        });
                                        res.write(JSON.stringify({"code":"2","data":reply}));
                                        res.end();
                                    });
                                });
                            }
                        } else {
                            res.writeHead(200, {
                                "Content-Type": "text/html"
                            });
                            res.write(JSON.stringify({"code":"3"}));
                            res.end();
                        }
                    });
                } else {
                    res.writeHead(200, {
                        "Content-Type": "text/html"
                    });
                    if(reply===null){
                        reply=0;
                    }
                    res.write(genResponse(req.headers.host, ip, path.pathname, reply));
                    res.end();
                }
            }
        }
    });
});


proxyServer.on("upgrade", function(req, socket, head) {
    let ip = req.headers["x-real-ip"];
    let cookies = cookie.parse(req.headers.cookie || "");
    client.get(md5(ip), function(err, reply) {
        if (reply !== null && parseInt(reply, 10) >= config.maxretry) {
            socket.write("HTTP/1.1 403 Forbidden\r\n" +
                "Access Denied: You are banned\r\n" +
                "\r\n");
            socket.end();
        } else if (typeof cookies["proxysession"] !== "undefined") {
            // check session
            let key = sha512(cookies["proxysession"] + req.headers.host + config.secret);
            client.get(key, function(err, reply) {
                if (reply === null) {
                    socket.write("HTTP/1.1 403 Forbidden\r\n" +
                        "Upgrade: WebSocket\r\n" +
                        "Connection: Close\r\n" +
                        "Access Denied: You are banned\r\n" +
                        "\r\n");
                    socket.end();
                } else {
                    // auth ok
                    // borken on socket interrupt, catch no work
                    passproxy(req.headers.host, reply, req, null, socket, head);
                    socket.id = Math.random().toString(16).substring(2);
                    if(typeof websocketObj[key] === "undefined"){
                        websocketObj[key] = {};
                    }
                    websocketObj[key][socket.id] = socket;
                }
            });
        } else {
            socket.write("HTTP/1.1 403 Forbidden\r\n" +
                "Access Denied: You are not allow\r\n" +
                "\r\n");
            socket.end();
        }
    });
});


proxyServer.listen(8600, "127.0.0.1");
