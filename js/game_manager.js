function GameManager(size, InputManager, Actuator, StorageManager, MatchOn) {
  // 发布版配置
  var options = {
    gameID: '308407e2-df2f-4b1d-ac8d-1c36b9438af0',
    secrete: '6547835ef62bc6faa98035b9aff26bd7581f2b58'
  };
  //测试版配置
  // var options = {
  //   gameID: 'e21766fc-1e86-4735-9216-bf4ab3a7d882',
  //   secrete: '01717aa4cd7eecfe125939cef3fc33e432175c93'
  // };
  this.heartBeatTimer = undefined;

  this.gameClock = 59;

  this.gameClockCtrol = undefined;

  //游戏时间到
  this.gameClockAtTime = false;

  this.lastHeartBeat = 0;

  this.pkStatus = "none";

  this.hisScore = 0;
  /* PK 我的匹配对战状态：
     none: 未进行pk
     unfind:未找到
     matching: 匹配中
     ongoging: 正在进行
     ended: 结束
     cancelled: 已取消
   */

  //标记我当前游戏的状态，是否是在时间内提前game over
  this.pkGameDieBefore = false;

  this.opponenterStatus = "none";

  /* PK 对手的对战状态：
     none:未匹配
     ongoging: 正在进行
     timedout: 超时
     ended: 结束
     cancelled: 已取消
   */

  this.initServerAdressStatus = false;

  /* PK 服务器地址薄状态：
     true: 获取
     false: 为获取
   */

  this.lastGameType = "alone";

  /*
     记录本地游戏的类型，对战还是单机
     alone : 单机
     multiplayer : 对战;
    */

  this.playerID = uuid.v4();

  this.size = size; // Size of the grid
  this.inputManager = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator = new Actuator;

  this.mo = new MatchOn(options);

  this.startTiles = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));
  this.inputManager.on("newMatch", this.newMatch.bind(this));
  this.inputManager.on("cancelMatching", this.cancelMatching.bind(this));
  this.inputManager.on("retry", this.retry.bind(this));

  this.mo.on("initSucceeded", this.moInitSucceeded.bind(this));

  this.mo.on("newMatchSucceeded", this.moNewMatchSucceeded.bind(this));

  this.mo.on("newMatchTimeout", this.moNewMatchTimeout.bind(this));

  this.mo.on("newMatchError", this.moNewMatchError.bind(this));


  this.mo.on("openSocketSucceeded", this.openSocketSucceeded.bind(this));

  this.mo.on("cancelMatchingSucceeded", this.cancelMatchingSucceeded.bind(this));

  this.mo.on("message", this.messageReceived.bind(this));

  this.mo.on("matching", this.moMatching.bind(this));

  // this.mo.init();

  this.setup();

}

GameManager.prototype.moInitSucceeded = function() {

  this.initServerAdressStatus = true;
  this.moMatching();
  console.log("init succeeded" + this.initServerAdressStatus);

}

GameManager.prototype.moMatching = function() {

  this.actuator.matchingMessage("正在寻找对手", 0);

  this.actuator.pkButtonUnclick("匹配中");
  this.actuator.restartButtonUnclick();

  this.requestID = uuid.v4();

  this.algo = "0";

  //    if( this.pkStatus === "ongoing" ) {


  // //Send out the cancel message.
  // this.mo.sendMessage(JSON.stringify({ type: "06", score: self.score }));

  // this.mo.disconnect();
  // this.pkStatus = "cancelled";

  // window.clearInterval(this.heartBeatTimer);

  //    }


  this.mo.newMatch({
    playerID: this.playerID,
    requestID: this.requestID,
    algo: this.algo
  });

  this.pkStatus = "matching";

}

GameManager.prototype.openSocketSucceeded = function() {
  this.hisScore = 0;
  console.log("open socket succeeded");

  this.actuator.clearMatchingMessage();
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();

  this.pkStatus = "ongoing";
  this.opponenterStatus = "ongoing";

  this.heartBeatTimer = window.setInterval(this.sendHearBeat.bind(this), 1000);

  this.actuator.pkButtonClick("逃跑~");
  this.actuator.hisScoreContainerShowCtl(true);
  this.gameClockAtTime = false;
  this.moMatchGameClock();
  console.log("openSocketSucceeded");
}

GameManager.prototype.sendHearBeat = function() {

  this.mo.sendMessage("02", this.score);

}

GameManager.prototype.messageReceived = function(e) {
  var message = e.message;
  if (message.data.type === "02") {
    this.hisScore = message.data.content;
    console.log("sending his score: " + this.hisScore);
    this.actuator.updateHisScore(this.hisScore);
  } else if (message.data.type === "06") { // 对方结束比赛
    this.mo.disconnect();
    window.clearInterval(this.heartBeatTimer);
    this.opponenterStatus = "ended";
    this.hisScore = message.data.content;
    this.actuator.updateHisScore(this.hisScore);
    console.log("对方已经结束比赛");
  } else if (message.data.type === "07") {

    this.lastHeartBeat = Date.now();

  }
};


GameManager.prototype.moNewMatchSucceeded = function(e) {

  this.actuator.clearMatchingMessage();

  this.matchID = e.data.matchID;

  console.log(this.matchID);

  this.mo.openSocket({
    playerID: this.playerID,
    matchID: this.matchID
  });

  console.log("moNewMatchSucceeded");

}


// Restart the game
GameManager.prototype.restart = function() {
  if (this.pkStatus == "matching" || this.pkStatus == "ongoing") {
    return;
  }
  this.actuator.gameClockUpdate("00:00", false);
  this.actuator.hisScoreContainerShowCtl(false);
  this.pkStatus = "none";
  this.actuator.pkButtonClick("对战");
  this.actuator.clearMatchingMessage();
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.lastGameType = "alone";
  this.setup();
};

// Retry the game
GameManager.prototype.retry = function() {
  if (this.lastGameType == "multiplayer") {
    if (this.pkStatus == "ongoing" && !this.gameClockAtTime) {
      console.log("提前结束，再来一局");
      this.actuator.clearMatchingMessage();
      this.storageManager.clearGameState();
      this.actuator.continueGame(); // Clear the game won/lost message
      this.setup();
    } else {
      window.clearInterval(this.heartBeatTimer);
      this.newMatch();
    }
  } else if (this.lastGameType == "alone") {
    this.restart();
  }
};

// matching the game
GameManager.prototype.newMatch = function() {

  //进行游戏中 该按钮为 放弃比赛（连接）
  if (this.pkStatus == "ongoing") {
    //Send out the cancel message.
    this.mo.sendMessage("06", this.score);

    this.mo.disconnect();
    this.pkStatus = "cancelled";
    this.actuator.continueGame();
    window.clearInterval(this.heartBeatTimer);
    this.actuator.pkButtonClick("对战");
    this.actuator.restartButtonClick();
    this.actuator.hisScoreContainerShowCtl(0);
    this.actuator.gameClockUpdate("", false);
    this.moGameClockClear();
    return;
  }

  //匹配中 则该按钮不做任何操作
  if (this.pkStatus == "matching" || this.pkStatus == "unfind") {
    return;
  }
  this.actuator.continueGame();
  this.lastGameType = "multiplayer";
  //地址簿初始化状态
  this.pkStatus = "none";
  this.mo.disconnect();
  if (!this.initServerAdressStatus) {
    this.mo.init();
  } else {
    this.moMatching();
  }
};

GameManager.prototype.cancelMatchingSucceeded = function() {
  this.actuator.clearMatchingMessage();
}

GameManager.prototype.moNewMatchError = function(e) {

  if (e.para.requestID == this.requestID) {
    console.log("3:" + e.para.requestID);
    if (this.pkStatus != "cancelled") {
      this.actuator.matchingMessage("未找到对手！", 1);
      this.pkStatus = "unfind"
      this.actuator.restartButtonClick();
    }
  } else {
    console.log("4:" + e.para.requestID);
  }

}

GameManager.prototype.moNewMatchTimeout = function(e) {

  if (e.para.requestID == this.requestID) {
    console.log("1:" + e.para.requestID);
    if (this.pkStatus != "cancelled") {
      this.actuator.clearMatchingMessage();
      this.actuator.matchingMessage("网络异常", 1);
      this.pkStatus = "unfind";
      this.actuator.restartButtonClick();
    }
  } else {
    console.log("2:" + e.para.requestID);
  }
}

//定时器
GameManager.prototype.moMatchGameClock = function() {
  // var self = this;
  if (this.gameClock < 0) {
    this.moGameClockClear();
    this.gameClockAtTime = true;
    this.over = true;
    this.mo.sendMessage("06", this.score);
    // this.mo.disconnect();
    if (this.score > this.hisScore) {
      this.actuator.gameOverResult(1);
    } else {
      this.actuator.gameOverResult(0);
    }
    this.pkStatus = "ended";
    this.actuator.restartButtonClick();
    this.actuator.pkButtonClick("对战");
  } else {
    this.gameClockStr = Math.floor(this.gameClock / 60) < 10 ? "0" + Math.floor(this.gameClock / 60) : Math.floor(this.gameClock / 60);
    this.gameClockStr += ":";
    this.gameClockStr += (this.gameClock % 60) < 10 ? ("0" + this.gameClock % 60) : this.gameClock % 60;
    this.actuator.gameClockUpdate(this.gameClockStr, true);
    this.gameClock = this.gameClock - 1;
    this.gameClockCtrol = window.setTimeout(this.moMatchGameClock.bind(this), 1000);
  }
}

GameManager.prototype.moGameClockClear = function() {
  window.clearTimeout(this.gameClockCtrol);
  this.gameClock = 59;
}

GameManager.prototype.cancelMatching = function() {
  var req = {
    cancelID: uuid.v4(),
    playerID: this.playerID,
    originalAlgo: this.algo,
    originalRequestID: this.requestID
  }
  this.mo.cancelMatchingRequest(req);
  if (this.pkStatus == "matching") {
    // this.pkStatus = "cancelled";
    this.pkStatus = "cancelled";
    this.actuator.pkButtonClick("对战");
    this.actuator.restartButtonClick();
    this.actuator.clearMatchingMessage();
  } else {
    if (!this.initServerAdressStatus) {
      this.mo.init();
    } else {
      this.moMatching();
    }
  }

};


// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function() {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function() {
  return this.over || (this.won && !this.keepPlaying);
};

// Set up the game
GameManager.prototype.setup = function() {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid = new Grid(previousState.grid.size,
      previousState.grid.cells); // Reload grid
    this.score = previousState.score;
    this.over = previousState.over;
    this.won = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid = new Grid(this.size);
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function() {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function() {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function() {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score: this.score,
    over: this.over,
    won: this.won,
    bestScore: this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function() {
  return {
    grid: this.grid.serialize(),
    score: this.score,
    over: this.over,
    won: this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function() {
  this.grid.eachCell(function(x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function(tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function(direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function(x) {
    traversals.y.forEach(function(y) {
      cell = {
        x: x,
        y: y
      };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          console.log(self.pkStatus);
          if (self.pkStatus === "ongoing") {
            console.log("send score: " + self.score);

            self.mo.sendMessage("02", self.score);
          }

          // The mighty 2048 tile
          if (merged.value === 2048 && this.lastGameType == "alone") self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      console.log("game over");
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function(direction) {
  // Vectors representing tile movement
  var map = {
    0: {
      x: 0,
      y: -1
    }, // Up
    1: {
      x: 1,
      y: 0
    }, // Right
    2: {
      x: 0,
      y: 1
    }, // Down
    3: {
      x: -1,
      y: 0
    } // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function(vector) {
  var traversals = {
    x: [],
    y: []
  };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function(cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell = {
      x: previous.x + vector.x,
      y: previous.y + vector.y
    };
  } while (this.grid.withinBounds(cell) &&
    this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function() {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function() {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({
        x: x,
        y: y
      });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell = {
            x: x + vector.x,
            y: y + vector.y
          };

          var other = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function(first, second) {
  return first.x === second.x && first.y === second.y;
};
