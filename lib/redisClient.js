'use strict';

const redis = require('redis');

module.exports = function(config) {

    const client = redis.createClient({
        'password': config.redisPassword
    });

    client.on("ready", function () {
        //console.log("Redis Ready");
    });

    client.on("reconnecting", function () {
        //console.log("Redis Reconnecting");
    });

    client.on("error", function (err) {
        console.log("Redis Error " + err);
    });

    return client;
}
