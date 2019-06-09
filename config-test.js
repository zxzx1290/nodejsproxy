"use strict";


module.exports = {
    template: "template.html",
    loginNotify: '',
    secret: "test-secret",
    usersalt: "test-salt",
    maxretry: 3,
    redisPassword: null,
    defaultLoginAliveSec: 86400, // 1 day
    longLoginAliveSec: 604800, // 7 days
    frontendTunnel: {
        "example.com": {
            "exroot": "/",
            "exlogin": "/login",
            "login": "/login",
            "logout": "/logout",
            "check": "/check",
            "extend": "/extend",
            "account": {
                "aaa": {
                    "totpsecret": null,
                    "backend": "b1"
                },
                "bbb": {
                    "totpsecret": null,
                    "backend": "b2"
                },
            }
        }
    },
    backendTunnel: {
        "b1": {
            "host": "localhost", // send to target
            "forward": "localhost",
            "port": 8888
        },
        "b2": {
            "host": "localhost",
            "forward": "localhost",
            "port": 8889
        }
    },
}