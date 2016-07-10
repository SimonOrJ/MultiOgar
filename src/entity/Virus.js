var Cell = require('./Cell');
var Logger = require('../modules/Logger');

function Virus() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 2;
    this.isSpiked = true;
    this.fed = 0;
    this.isMotherCell = false; // Not to confuse bots
    this.setColor({ r: 0, g: 255, b: 0 });
}

module.exports = Virus;
Virus.prototype = new Cell();

// Main Functions

Virus.prototype.canEat = function (cell) {
    return cell.cellType == 3; // virus can eat ejected mass only
};

Virus.prototype.onEat = function (prey) {
    // Called to eat prey cell
    this.setSize(Math.sqrt(this.getSizeSquared() + prey.getSizeSquared()));

    if (this.getSize() >= this.gameServer.config.virusMaxSize) {
        this.setSize(this.gameServer.config.virusMinSize); // Reset mass
        this.gameServer.shootVirus(this, prey.getAngle());
    }
};

Virus.prototype.onEaten = function(consumer) {
    var client = consumer.owner;
    if (client == null) return;
    
    var maxSplit = this.gameServer.config.playerMaxCells - consumer.owner.cells.length;
    var masses = this.gameServer.splitMass(consumer.getMass(), maxSplit + 1);
    if (masses.length < 2) {
        return;
    }
    
    // Balance mass around center & skip first mass (==consumer mass)
    var massesMix = [];
    for (var i = 1; i < masses.length; i += 2)
        massesMix.push(masses[i]);
    for (var i = 2; i < masses.length; i += 2)
        massesMix.push(masses[i]);
    masses = massesMix;
    
    // Blow up the cell...
/*    var angle = 2 * Math.PI * Math.random();
    var step = 2 * Math.PI / masses.length;
    for (var i = 0; i < masses.length; i++) {
        if (!this.gameServer.splitPlayerCell(client, consumer, angle, masses[i])) {
            break;
        }
        angle += step;
        if (angle >= 2 * Math.PI) {
            angle -= 2 * Math.PI;
        }
    }
*/
    var angleDivisionConstant = 6.28/masses.length,
        angle = Math.random() * 6.28, // Random directions
        shape = Math.floor(Math.random() * 5),
        maxSplitSpeed = Math.min(Math.pow(client.getScore()/100,0.2) * 650, 6200);
        sAngle = 0;
    switch (shape) {
    case 0: // Circle
        for (var k = masses.length-1; k >= 0; k--) {
            angle += angleDivisionConstant;
            if (!this.gameServer.splitPlayerCell(client, consumer, angle, masses[k], maxSplitSpeed))
                break;
        }
        break;
    case 1: // Sprial
        var speedInterval = Math.floor(maxSplitSpeed/masses.length);
        for (var k = 0; k < masses.length; k++) {
            angle += angleDivisionConstant;
            if (!this.gameServer.splitPlayerCell(client, consumer, angle, masses[k], maxSplitSpeed))
                break;
            maxSplitSpeed -= speedInterval;
        }
        break;
    case 2: // Square
        for (var k = 0; k < masses.length; k++) {
            var splitSpeed = maxSplitSpeed * (Math.pow(sAngle,2)/2.5-0.628*sAngle+1)
            sAngle = (sAngle + angleDivisionConstant)%1.57;
            angle += angleDivisionConstant;
            if (!this.gameServer.splitPlayerCell(client, consumer, angle, masses[k], splitSpeed))
                break;
        }
        break;
    case 3: // star
        angleDivisionConstant *= 2;
        for (var k = 0; k < masses.length; k++) {
            var splitSpeed = maxSplitSpeed * (Math.pow(sAngle,2)/3.5-0.718*sAngle+1)
            sAngle = (sAngle + angleDivisionConstant)%2.513;
            angle += angleDivisionConstant;
            if (!this.gameServer.splitPlayerCell(client, consumer, angle, masses[k], splitSpeed))
                break;
        }
        break;
    case 4: // an X or +
        var lineCells = Math.ceil(masses.length/4),
            splitSpeed = maxSplitSpeed,
            speedInterval = maxSplitSpeed/lineCells;
        for (var k = 0; k < masses.length; k++) {
            if (!this.gameServer.splitPlayerCell(client, consumer, angle, masses[k], splitSpeed))
                break;
            if(k % 4 == 3) splitSpeed -= speedInterval;
            angle += 1.57;
        }
        break;
    }


};

Virus.prototype.onAdd = function(gameServer) {
    gameServer.nodesVirus.push(this);
};

Virus.prototype.onRemove = function(gameServer) {
    var index = gameServer.nodesVirus.indexOf(this);
    if (index != -1) {
        gameServer.nodesVirus.splice(index, 1);
    } else {
        Logger.error("Virus.onRemove: Tried to remove a non existing virus!");
    }
};
