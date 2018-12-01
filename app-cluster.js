"use strict";

const cluster = require("cluster");
//const num = require("os").cpus().length;
const num = 2;

if (cluster.isMaster) {
    console.log("master start...");

    // Fork workers.
    for (var i = 0; i < num; i++) {
        cluster.fork();
    }

    cluster.on("listening", function(worker, address) {
        console.log("listening: worker " + worker.process.pid + ", Address: " + address.address + ":" + address.port);
    });

    cluster.on("exit", function(worker, code, signal) {
        console.log("worker " + worker.process.pid + " died");
    });
} else {

    require("./src/app.js");

}
