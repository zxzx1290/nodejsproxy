"use strict";


module.exports = {
    template: "template.html",
    loginNotify: "https://notify.example.com/?text=",
    secret: "THE_KEY", // hash key, must be random
    maxretry: 3, // max login try
    redisPassword: "THE_PASSWORD", // redis server password
    defaultLoginAliveSec: 86400, // default login alive time in second
    longLoginAliveSec: 604800, // default login alive time for remember me in second
    frontendTunnel: { // the proxy for listening reuqest
        "login.example.com": {
            "exroot": "/", // the login page url, use for after login redirect
            "exlogin": "/login", // the login post url
            "login": "/login", // use for internal login path, useful when using url rewrite
            "logout": "/logout", // use for internal logout path, useful when using url rewrite
            "account": {
                "c9": { // username
                    "totpsecret": "K5BFI6ZBHFEHGRLLNBAGKYKEJ5CTIYRUPFJGK6SFJURXATSPNVKA", //totp secret
                    "backend": "backend1" // proxy backend
                },
                "guest": { // username
                    "totpsecret": "FRLGSZDHORND6UZDEQYHWV2HPVTDCSLBPJ5D62LPJI5HQMTLJ43A", //totp secret
                    "backend": "backend2" // proxy backend
                },
            }
        }
    },
    backendTunnel: {
        "backend1": {
            "host": "localhost", // replace request host header
            "forward": "localhost", // the target domain you want to forward the request
            "port": 8888 // the target port you want to forward the request
        },
        "backend2": {
            "host": "localhost.com",
            "forward": "localhost",
            "port": 9999
        }
    },
}