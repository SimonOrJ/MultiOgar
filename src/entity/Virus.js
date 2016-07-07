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

    var maxSplits = Math.floor(consumer.getMass() / 16) - 1; // Maximum amount of splits
    var numSplits = this.gameServer.config.playerMaxCells - client.cells.length; // Get number of splits
    numSplits = Math.min(numSplits, maxSplits);
    var splitMass = Math.min(consumer.getMass() / (numSplits + 1), 24); // Maximum size of new splits

    // Cell cannot split any further
    if (numSplits <= 0) {
        return;
    }

    var mass = consumer.getMass(); // Mass of the consumer
    var bigSplits = []; // Big splits

    // Big cells will split into cells larger than 24 mass
    // won't do the regular way unless it can split more than 4 times
    if (numSplits == 1) bigSplits = [mass / 2];
    else if (numSplits == 2) bigSplits = [mass / 4, mass / 4];
    else if (numSplits == 3) bigSplits = [mass / 4, mass / 4, mass / 7];
    else if (numSplits == 4) bigSplits = [mass / 5, mass / 7, mass / 8, mass / 10];
    else {
        var endMass = mass - numSplits * splitMass;
        var m = endMass,
            i = 0;
        if (m > 2100) { // Threshold, default: 466
            // While can split into an even smaller cell (10000 => 2500, 1000, etc)
            var mult = 4;
            while (m / mult > 24) {
                m /= mult;
                mult = 2.5; // First mult 4, the next ones 2.5
                bigSplits.push(m >> 0);
                i++;
            }
        }
    }
    numSplits -= bigSplits.length;

    for (var k = 0; k < bigSplits.length; k++) {
        angle = Math.random() * 2 * Math.PI; // Random directions
        this.gameServer.splitPlayerCell(client, consumer, angle, bigSplits[k]);
    }

    /* Splitting
    for (var k = 0; k < numSplits; k++) {
        angle = Math.random() * 2 * Math.PI; // Random directions
        this.gameServer.splitPlayerCell(client, consumer, angle, splitMass);
    }*/
    
    var angleDivisionConstant = 6.28/numSplits,
        angle = Math.random() * 6.28, // Random directions
        shape = Math.floor(Math.random() * 5),
        maxSplitSpeed = Math.min(Math.pow(client.getScore(),0.2) * 650, 6200);
        sAngle = 0;
    switch (shape) {
    case 0: // Circle
        for (var k = 0; k < numSplits; k++) {
            angle += angleDivisionConstant;
            this.gameServer.splitPlayerCell(client, consumer, angle, splitMass, maxSplitSpeed);
        }
        break;
    case 1: // Sprial
        var speedInterval = Math.floor(maxSplitSpeed/numSplits);
        for (var k = 0; k < numSplits; k++) {
            angle += angleDivisionConstant;
            this.gameServer.splitPlayerCell(client, consumer, angle, splitMass, maxSplitSpeed);
            maxSplitSpeed -= speedInterval;
        }
        break;
    case 2: // Square
        for (var k = 0; k < numSplits; k++) {
            var splitSpeed = maxSplitSpeed * (Math.pow(sAngle,2)/2.5-0.628*sAngle+1)
            sAngle = (sAngle + angleDivisionConstant)%1.57;
            angle += angleDivisionConstant;
            this.gameServer.splitPlayerCell(client, consumer, angle, splitMass, splitSpeed);
        }
        break;
    case 3: // star
        angleDivisionConstant *= 2;
        for (var k = 0; k < numSplits; k++) {
            var splitSpeed = maxSplitSpeed * (Math.pow(sAngle,2)/3.5-0.718*sAngle+1)
            sAngle = (sAngle + angleDivisionConstant)%2.513;
            angle += angleDivisionConstant;
            this.gameServer.splitPlayerCell(client, consumer, angle, splitMass, splitSpeed);
        } break;
    case 4: // an X or +
        var lineCells = Math.ceil(numSplits/4),
            splitSpeed = maxSplitSpeed,
            speedInterval = maxSplitSpeed/lineCells;
        for (var k = 0; k < numSplits; k++) {
            this.gameServer.splitPlayerCell(client, consumer, angle, splitMass, splitSpeed);
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
