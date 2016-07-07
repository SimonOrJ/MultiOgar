var Packet = require('./packet');
var GameServer = require('./GameServer');

function PlayerTracker(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
    this.pID = -1;
    this.isRemoved = false;
    this.isCloseRequested = false;
    this.name = "";
    this.skin = "";
    this.color = { r: 0, g: 0, b: 0 };
    this.visibleNodes = [];
    this.cells = [];
    this.mergeOverride = false; // Triggered by console command
    this.score = 0; // Needed for leaderboard
    this.scale = 1;
    this.isMassChanged = true;
    this.borderCounter = 0;

    this.mouse = {
        x: 0,
        y: 0
    };
    this.tickLeaderboard = 0;

    this.team = 0;
    this.spectate = false;
    this.freeRoam = false;      // Free-roam mode enables player to move in spectate mode
    this.spectateTarget = null; // Spectate target, null for largest player
    this.lastSpectateSwitchTick = 0;

    this.centerPos = {
        x: 0,
        y: 0
    };
    this.viewBox = {
        minx: 0,
        miny: 0,
        maxx: 0,
        maxy: 0,
        width: 0,
        height: 0,
        halfWidth: 0,
        halfHeight: 0
    };

    // Scramble the coordinate system for anti-raga
    this.scrambleX = 0;
    this.scrambleY = 0;
    this.scrambleId = 0;

    // Gamemode function
    if (gameServer) {
        this.centerPos.x = gameServer.border.centerx;
        this.centerPos.y = gameServer.border.centery;
        // Player id
        this.pID = gameServer.getNewPlayerID();
        // Gamemode function
        gameServer.gameMode.onPlayerInit(this);
        // Only scramble if enabled in config
        this.scramble();
    }
}

module.exports = PlayerTracker;

// Setters/Getters

PlayerTracker.prototype.scramble = function () {
    if (!this.gameServer.config.serverScrambleCoords) {
        this.scrambleId = 0;
        this.scrambleX = 0;
        this.scrambleY = 0;
    } else {
        this.scrambleId = (Math.random() * 0xFFFFFFFF) >>> 0;
        // avoid mouse packet limitations
        var maxx = Math.max(0, 32767 - 1000 - this.gameServer.border.width);
        var maxy = Math.max(0, 32767 - 1000 - this.gameServer.border.height);
        var x = maxx * Math.random();
        var y = maxy * Math.random();
        if (Math.random() >= 0.5) x = -x;
        if (Math.random() >= 0.5) y = -y;
        this.scrambleX = x;
        this.scrambleY = y;
    }
    this.borderCounter = 0;
};

PlayerTracker.prototype.getFriendlyName = function () {
    var name = this.getName();
    if (!name) name = "";
    name = name.trim();
    if (name.length == 0)
        name = "An unnamed cell";
    return name;
};

PlayerTracker.prototype.setName = function(name) {
    var n = name.toLowerCase();
    if (n.indexOf("team") >= 0 && n.indexOf("no") < 0 && n.indexOf("n't") < 0 && n.indexOf("stop") < 0 && n.indexOf("hate") < 0) {
        this.name = "I HATE TEAMING";
        return;
    }
    var na = name;
    if (n.indexOf("bitch") >= 0)
        na = name.replace(/bitch/ig, "coast");
    if (n.indexOf("fuck") >= 0)
        na = name.replace(/fuck/ig, "ahhh");
    if (n.indexOf("shit") >= 0 || n.indexOf("crap") >= 0)
        na = name.replace(/shit|crap/ig, "gold");
    if (n.indexOf("damn") >= 0)
        na = name.replace(/damn/ig, "wall");
    if (n.indexOf("dick") >= 0)
        na = name.replace(/dick/ig, "ohhh");
    this.name = na;
};

PlayerTracker.prototype.getName = function() {
    return this.name;
};

PlayerTracker.prototype.setSkin = function (skin) {
    this.skin = skin;
};

PlayerTracker.prototype.getSkin = function () {
    if (this.gameServer.gameMode.haveTeams) {
        return "";
    }
    return this.skin;
};

PlayerTracker.prototype.getColor = function (color) {
    return this.color;
};

PlayerTracker.prototype.setColor = function (color) {
    this.color.r = color.r;
    this.color.g = color.g;
    this.color.b = color.b;
};

PlayerTracker.prototype.getTeam = function () {
    return this.team;
};

PlayerTracker.prototype.getScore = function () {
    if (this.isMassChanged)
        this.updateMass();
    return this.score;
};

PlayerTracker.prototype.getScale = function () {
    if (this.isMassChanged)
        this.updateMass();
    return this.scale;
};

PlayerTracker.prototype.updateMass = function () {
    var totalSize = 0;
    var totalMass = 0;
    for (var i = 0; i < this.cells.length; i++) {
        var node = this.cells[i];
        if (node == null) continue;
        totalSize += node.getSize();
        totalMass += node.getMass();
    }
    if (totalSize == 0) {
        //do not change scale for spectators or not in game players
        this.score = 0;
    } else {
        this.score = totalMass;
        this.scale = Math.pow(Math.min(64 / totalSize, 1), 0.4);
    }
    this.isMassChanged = false;
};

PlayerTracker.prototype.massChanged = function () {
    this.isMassChanged = true;    
};

// Functions

PlayerTracker.prototype.joinGame = function (name, skin) {
    if (this.cells.length > 0) return;
    if (name == null) name = "";
    this.setName(name);
    if (skin != null)    
        this.setSkin(skin);
    this.spectate = false;
    this.freeRoam = false;
    this.spectateTarget = null;

    // some old clients don't understand ClearAll message
    // so we will send update for them
    if (this.socket.packetHandler.protocol < 6) {
        this.socket.sendPacket(new Packet.UpdateNodes(this, [], [], [], this.visibleNodes));
    }
    this.socket.sendPacket(new Packet.ClearAll());
    this.visibleNodes = [];
    this.scramble();
    if (this.gameServer.config.serverScrambleCoords < 2) {
        // no scramble / lightweight scramble
        this.socket.sendPacket(new Packet.SetBorder(this, this.gameServer.border));
    }
    if (this.gameServer.config.serverScrambleCoords == 3) {
        // Scramble level 3 (no border)
        // Unsupported on some clients! (include vanilla)
        // ogar.mivabe.nl works ok
        // Ruins most known minimaps
        this.socket.sendPacket(new Packet.SetBorder(this, {minx:1/0,miny:1/0,maxx:1/0,maxy:1/0}));
    }
    this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
};

PlayerTracker.prototype.update = function () {
    if (this.isRemoved) return;
    // Handles disconnection
    var time = +new Date;
    if (!this.socket.isConnected) {
        // wait for playerDisconnectTime
        var dt = (time - this.socket.closeTime) / 1000;
        if (this.cells.length == 0 || dt >= this.gameServer.config.playerDisconnectTime) {
            // Remove all client cells
            var cells = this.cells;
            this.cells = [];
            for (var i = 0; i < cells.length; i++) {
                this.gameServer.removeNode(cells[i]);
            }
            // Mark to remove
            this.isRemoved = true;
        }
        // update visible nodes/mouse (for spectators, if any)
        var nodes = this.getVisibleNodes();
        nodes.sort(function (a, b) { return a.nodeId - b.nodeId; });
        this.visibleNodes = nodes;
        this.mouse.x = this.centerPos.x;
        this.mouse.y = this.centerPos.y;
        this.socket.packetHandler.pressSpace = false;
        this.socket.packetHandler.pressW = false;
        this.socket.packetHandler.pressQ = false;
        return;
    }
    // Check timeout
    if (!this.isCloseRequested && this.gameServer.config.serverTimeout) {
        var dt = (time - this.socket.lastAliveTime) / 1000;
        if (dt >= this.gameServer.config.serverTimeout) {
            this.socket.close(1000, "Connection timeout");
            this.isCloseRequested = true;
        }
    }

    // if initialization is not complete yet then do not send update
    if (!this.socket.packetHandler.protocol)
        return;
    
    // Actions buffer (So that people cant spam packets)
    if (this.socket.packetHandler.pressSpace) { // Split cell
        this.pressSpace();
        this.socket.packetHandler.pressSpace = false;
    }
    
    if (this.socket.packetHandler.pressW) { // Eject mass
        this.pressW();
        this.socket.packetHandler.pressW = false;
    }
    
    if (this.socket.packetHandler.pressQ) { // Q Press
        this.pressQ();
        this.socket.packetHandler.pressQ = false;
    }
    
    var newVisible = this.getVisibleNodes();
    newVisible.sort(function (a, b) { return a.nodeId - b.nodeId; });
    var delNodes = [];
    var eatNodes = [];
    var addNodes = [];
    var updNodes = [];
    var newIndex = 0;
    var oldIndex = 0;
    for (; newIndex < newVisible.length && oldIndex < this.visibleNodes.length;) {
        if (newVisible[newIndex].nodeId < this.visibleNodes[oldIndex].nodeId) {
            addNodes.push(newVisible[newIndex]);
            newIndex++;
            continue;
        }
        if (newVisible[newIndex].nodeId > this.visibleNodes[oldIndex].nodeId) {
            var node = this.visibleNodes[oldIndex];
            if (node.isRemoved && node.getKiller() != null && node.owner != node.getKiller().owner)
                eatNodes.push(node);
            else
                delNodes.push(node);
            oldIndex++;
            continue;
        }
        var node = newVisible[newIndex];
        // skip food & eject if no moving
        if (node.isMoving || (node.cellType != 1 && node.cellType != 3))
            updNodes.push(node);
        newIndex++;
        oldIndex++;
    }
    for (; newIndex < newVisible.length; ) {
        var node = newVisible[newIndex];
        addNodes.push(newVisible[newIndex]);
        newIndex++;
    }
    for (; oldIndex < this.visibleNodes.length; ) {
        var node = this.visibleNodes[oldIndex];
        if (node.isRemoved && node.getKiller() != null && node.owner != node.getKiller().owner)
            eatNodes.push(node);
        else
            delNodes.push(node);
        oldIndex++;
    }
    this.visibleNodes = newVisible;
    
    if (this.gameServer.config.serverScrambleCoords == 2) {
        // moving border scramble
        if (this.borderCounter == 0) {
            var bound = {
                minx: Math.max(this.gameServer.border.minx, this.viewBox.minx - this.viewBox.halfWidth),
                miny: Math.max(this.gameServer.border.miny, this.viewBox.miny - this.viewBox.halfHeight),
                maxx: Math.min(this.gameServer.border.maxx, this.viewBox.maxx + this.viewBox.halfWidth),
                maxy: Math.min(this.gameServer.border.maxy, this.viewBox.maxy + this.viewBox.halfHeight)
            };
            this.socket.sendPacket(new Packet.SetBorder(this, bound));
        }
        this.borderCounter++;
        if (this.borderCounter >= 20)
            this.borderCounter = 0;
    }

    // Send packet
    this.socket.sendPacket(new Packet.UpdateNodes(
        this,
        addNodes,
        updNodes,
        eatNodes,
        delNodes));
    
    // Update leaderboard
    if (++this.tickLeaderboard > 25) {
        // 1 / 0.040 = 25 (once per second)
        this.tickLeaderboard = 0;
        if (this.gameServer.leaderboardType >= 0) {
            var packet = new Packet.UpdateLeaderboard(this, this.gameServer.leaderboard, this.gameServer.leaderboardType);
            this.socket.sendPacket(packet);
        }
    }
};

// Viewing box

PlayerTracker.prototype.updateCenterInGame = function() { // Get center of cells
    var len = this.cells.length;
    if (len <= 0) return;
    var cx = 0;
    var cy = 0;
    var count = 0;
    for (var i = 0; i < len; i++) {
        var node = this.cells[i];
        if (node == null) continue;
        cx += node.position.x;
        cy += node.position.y;
        count++;
    }
    if (count == 0) return;
    this.setCenterPos(cx / count, cy / count);
};

PlayerTracker.prototype.updateCenterFreeRoam = function () {
    var dx = this.mouse.x - this.centerPos.x;
    var dy = this.mouse.y - this.centerPos.y;
    var squared = dx * dx + dy * dy;
    if (squared < 1) return;     // stop threshold
    
    // distance
    var d = Math.sqrt(squared);
    
    var invd = 1 / d;
    var nx = dx * invd;
    var ny = dy * invd;
    
    var speed = Math.min(d, 32);
    if (speed <= 0) return;
    
    var x = this.centerPos.x + nx * speed;
    var y = this.centerPos.y + ny * speed;
    this.setCenterPos(x, y);
};

PlayerTracker.prototype.updateViewBox = function () {
    var scale = this.getScale();
    var width = (this.gameServer.config.serverViewBaseX + 100) / scale;
    var height = (this.gameServer.config.serverViewBaseY + 100) / scale;
    var halfWidth = width / 2;
    var halfHeight = height / 2;
    this.viewBox = {
        minx: this.centerPos.x - halfWidth,
        miny: this.centerPos.y - halfHeight,
        maxx: this.centerPos.x + halfWidth,
        maxy: this.centerPos.y + halfHeight,
        width: width,
        height: height,
        halfWidth: halfWidth,
        halfHeight: halfHeight
    };
};

PlayerTracker.prototype.pressQ = function () {
    if (this.spectate) {
        // Check for spam first (to prevent too many add/del updates)
        var tick = this.gameServer.getTick();
        if (tick - this.lastSpectateSwitchTick < 40)
            return;
        this.lastSpectateSwitchTick = tick;

        if (this.spectateTarget == null) {
            this.freeRoam = !this.freeRoam;
        }
        this.spectateTarget = null;
    }
    else if (this.gameServer.run) {
        this.gameServer.ejectMass(this, true);
    }
};

PlayerTracker.prototype.pressW = function () {
    if (this.spectate) {
        return;
    }
    else if (this.gameServer.run) {
        this.gameServer.ejectMass(this);
    }
};

PlayerTracker.prototype.pressSpace = function () {
    if (this.spectate) {
        // Check for spam first (to prevent too many add/del updates)
        var tick = this.gameServer.getTick();
        if (tick - this.lastSpectateSwitchTick < 40)
            return;
        this.lastSpectateSwitchTick = tick;

        // Space doesn't work for freeRoam mode
        if (this.freeRoam || this.gameServer.largestClient==null)
            return;
        this.nextSpectateTarget();
    } else if (this.gameServer.run) {
        if (this.mergeOverride)
            return;
        this.gameServer.splitCells(this);
    }
};

PlayerTracker.prototype.nextSpectateTarget = function () {
    if (this.spectateTarget == null) {
        this.spectateTarget = this.gameServer.largestClient;
        return;
    }
    // lookup for next spectate target
    var index = this.gameServer.clients.indexOf(this.spectateTarget.socket);
    if (index < 0) {
        this.spectateTarget = this.gameServer.largestClient;
        return;
    }
    // find next
    for (var i = index + 1; i < this.gameServer.clients.length; i++) {
        var player = this.gameServer.clients[i].playerTracker;
        if (player.cells.length > 0) {
            this.spectateTarget = player;
            return;
        }
    }
    for (var i = 0; i <= index; i++) {
        var player = this.gameServer.clients[i].playerTracker;
        if (player.cells.length > 0) {
            this.spectateTarget = player;
            return;
        }
    }
    // no alive players
    this.spectateTarget = null;
};

PlayerTracker.prototype.getSpectateTarget = function () {
    if (this.spectateTarget == null || this.spectateTarget.isRemoved || this.spectateTarget.cells.length < 1) {
        this.spectateTarget = null;
        return this.gameServer.largestClient;
    }
    return this.spectateTarget;
};

PlayerTracker.prototype.getVisibleNodes = function () {
    if (this.spectate) {
        if (!this.freeRoam) {
            var player = this.getSpectateTarget();
            if (player != null) {
                this.setCenterPos(player.centerPos.x, player.centerPos.y);
                this.scale = player.getScale();
                this.sendCameraPacket();
                this.updateViewBox();
                return player.visibleNodes.slice(0);
            }
        }
        // free roam spectate
        this.updateCenterFreeRoam();
        this.scale = this.gameServer.config.serverSpectatorScale;//0.25;
        this.sendCameraPacket();
    } else {
        // in game
        this.updateCenterInGame();
        // scale will be calculated on first call to this.getScale() inside updateViewBox()
    }
    this.updateViewBox();
    return this.calcVisibleNodes();
}

PlayerTracker.prototype.calcVisibleNodes = function() {
    var newVisible = [];
    var self = this;
    this.gameServer.quadTree.find(this.viewBox, function (quadItem) {
        if (quadItem.cell.owner != self)
            newVisible.push(quadItem.cell);
    });
    return newVisible.concat(this.cells);
};

PlayerTracker.prototype.setCenterPos = function(x, y) {
    if (isNaN(x) || isNaN(y)) {
        throw new TypeError("PlayerTracker.setCenterPos: NaN");
    }
    x = Math.max(x, this.gameServer.border.minx);
    y = Math.max(y, this.gameServer.border.miny);
    x = Math.min(x, this.gameServer.border.maxx);
    y = Math.min(y, this.gameServer.border.maxy);
    this.centerPos.x = x;
    this.centerPos.y = y;
};

PlayerTracker.prototype.sendCameraPacket = function() {
    this.socket.sendPacket(new Packet.UpdatePosition(
        this,
        this.centerPos.x,
        this.centerPos.y,
        this.getScale()
    ));
};
