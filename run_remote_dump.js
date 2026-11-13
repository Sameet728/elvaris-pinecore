const { scpUpload, runRemote } = require("./vps_tool");
scpUpload("dump_pine_db.js", "/home/ubuntu/dump_pine_db.js");
console.log(runRemote("node /home/ubuntu/dump_pine_db.js"));
