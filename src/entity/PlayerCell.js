var Cell = require('./Cell');

function PlayerCell() {
    Cell.apply(this, Array.prototype.slice.call(arguments));
    
    this.cellType = 0;
    this._canRemerge = false;
}

module.exports = PlayerCell;
PlayerCell.prototype = new Cell();

// Main Functions

PlayerCell.prototype.updateRemerge = function () {
    var age = this.getAge(this.gameServer.getTick());
    if (age < 15) {
        // do not remerge if cell age is smaller than 15 ticks
        this._canRemerge = false;
        return;
    }
    this._canRemerge = age > 20 || this.getSize() < 315;
}

PlayerCell.prototype.canRemerge = function () {
    return this._canRemerge;
};

PlayerCell.prototype.canEat = function (cell) {
    // player cell can eat anyone
    return true;
};

PlayerCell.prototype.getSplitSize = function () {
    return this.getSize() * splitMultiplier;
};

var splitMultiplier = 1 / Math.sqrt(2);

// Movement

PlayerCell.prototype.moveUser = function (border) {
    if (this.owner == null || this.owner.socket.isConnected === false) {
        return;
    }
    var x = this.owner.mouse.x;
    var y = this.owner.mouse.y;
    if (isNaN(x) || isNaN(y)) {
        return;
    }
    var dx = x - this.position.x;
    var dy = y - this.position.y;
    var squared = dx * dx + dy * dy;
    if (squared < 1) return;
    
    // distance
    var d = Math.sqrt(squared);
    
    // normal
    var invd = 1 / d;
    var nx = dx * invd;
    var ny = dy * invd;
    
    // normalized distance (0..1)
    d = Math.min(d, 32) / 32;
    var speed = this.getSpeed() * d;
    if (speed <= 0) return;
    
    this.position.x += nx * speed;
    this.position.y += ny * speed;
    this.checkBorder(border);
};

// Override

PlayerCell.prototype.onAdd = function(gameServer) {
    // Gamemode actions
    gameServer.gameMode.onCellAdd(this);
};

PlayerCell.prototype.onRemove = function(gameServer) {
    var index;
    // Remove from player cell list
    index = this.owner.cells.indexOf(this);
    if (index != -1) {
        this.owner.cells.splice(index, 1);
    }
    // Gamemode actions
    gameServer.gameMode.onCellRemove(this);
};
