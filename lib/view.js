'use strict';

const fs = require('fs');


module.exports = function(config) {
    let template = '';

    fs.readFile(config.template, 'utf8', function(err, data) {
        if (err) throw err;
        template = data;
    });

    this.genView = function(host, ip, pathname, count, exlogin) {
        return template.replaceAll('\\<\\?\\= host \\?\\>', host).replaceAll('\\<\\?\= ip \\?\\>', ip).replaceAll('\\<\\?\\= pathname \\?>', pathname).replaceAll('<\\?\\= count \\?>', count.toString()).replaceAll('<\\?\\= loginurl \\?>', exlogin);
    }
}
