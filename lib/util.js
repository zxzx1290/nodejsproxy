'use strict';

const crypto = require('crypto');
const speakeasy = require('speakeasy');


function md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

function sha512(data) {
    return crypto.createHash('sha512').update(data).digest('hex');
}

function getPrefixURL(config, domain, type) {
    if (typeof config.frontendTunnel[domain][type] === 'undefined') {
        return '/';
    } else {
        return config.frontendTunnel[domain][type];
    }
}

function checkUser(config, host, username, password) {
    if (typeof config.frontendTunnel[host] === 'undefined') {
        // no match domain
        return false;
    } else {
        if (config.frontendTunnel[host]['account'].hasOwnProperty(username)) {

            // test regexp
            if(!/^[0-9]{6}$/.test(password)){
                return false;
            }

            // TOTP
            // Verify a given token
            let tokenValidates = speakeasy.totp.verify({
                secret: config.frontendTunnel[host]['account'][username]['totpsecret'],
                encoding: 'base32',
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

function randomString(count) {
    let _sym = 'abcdefghijklmnopqrstuvwxyz1234567890';
    let str = '';

    for (let i = 0; i < count; i++) {
        str += _sym[parseInt(Math.random() * (_sym.length), 10)];
    }
    return str;
}

function loginSuccess(client, proxysession, username, lognlive, config, req, res, callback) {

    // redis儲存用
    let loginAliveSec = config.defaultLoginAliveSec;
    // cookie用
    let cookieAliveSec = '0';
    // check remember me
    if(lognlive){
        loginAliveSec = config.longLoginAliveSec;
        cookieAliveSec = new Date(new Date().getTime() + (config.longLoginAliveSec * 1000)).toUTCString();
    }

    let rediskey = sha512(proxysession + req.headers.host + config.secret);

    client.set(rediskey, Buffer.from(username).toString('base64'), 'EX', loginAliveSec, function(err, reply) {

        if(err) {
            callback(false);
        }else{
            // console.log('user '+post.username+' login success');
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Set-Cookie',
            [
                'proxysession=' + proxysession + ';path=/;Expires=' + cookieAliveSec + ';httpOnly;Secure',
                'proxyuser=' + username + ';path=/;Expires=' + cookieAliveSec + ';',
                'proxyhash=' + md5(username + config.usersalt) + ';path=/;Expires=' + cookieAliveSec + ';',
            ]);
            res.write(JSON.stringify({'code':'1','data':getPrefixURL(config, req.headers.host, 'exroot')}));
            res.end();
            callback(true);
        }
        
    });
}

String.prototype.replaceAll = function(search, replacement) {
    return this.replace(new RegExp(search, 'g'), replacement);
};

// time
function twoDigits(d) {
    if (0 <= d && d < 10) return '0' + d.toString();
    if (-10 < d && d < 0) return '-0' + (-1 * d).toString();
    return d.toString();
}

Date.prototype.toMysqlFormatPlus8 = function() {
    let d = new Date(Date.UTC(this.getUTCFullYear(), this.getUTCMonth(), this.getUTCDate(), this.getUTCHours(), this.getUTCMinutes(), this.getUTCSeconds()));
    d.setUTCHours(d.getUTCHours() + 8);
    return d.getUTCFullYear() + '-' + twoDigits(1 + d.getUTCMonth()) + '-' + twoDigits(d.getUTCDate()) + ' ' + twoDigits(d.getUTCHours()) + ':' + twoDigits(d.getUTCMinutes()) + ':' + twoDigits(d.getUTCSeconds());
}

module.exports = {
    md5: md5,
    sha512: sha512,
    randomString: randomString,
    getPrefixURL: getPrefixURL,
    checkUser: checkUser,
    loginSuccess: loginSuccess
}
