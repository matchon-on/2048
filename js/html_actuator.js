function HTMLActuator() {
  this.tileContainer = document.querySelector(".tile-container");
  this.scoreContainer = document.querySelector(".score-container");
  this.bestContainer = document.querySelector(".best-container");
  this.messageContainer = document.querySelector(".game-message");

  this.matchingContainer = document.querySelector(".matching-message");
  this.hisScoreContainer = document.querySelector(".his-score-container");
  this.pkButton = document.querySelector(".pk-button");
  this.restartButton = document.querySelector(".restart-button");
  this.gameClockShow = document.querySelector(".title");

  this.score = 0;
  this.hisScore = 0;
}

HTMLActuator.prototype.actuate = function(grid, metadata) {
  var self = this;

  window.requestAnimationFrame(function() {
    self.clearContainer(self.tileContainer);

    grid.cells.forEach(function(column) {
      column.forEach(function(cell) {
        if (cell) {
          self.addTile(cell);
        }
      });
    });

    self.updateScore(metadata.score);
    self.updateBestScore(metadata.bestScore);

    if (metadata.terminated) {
      if (metadata.over) {
        self.message(false);
        console.log("lost");
      } else if (metadata.won) {
        self.message(true);
      }
    }

  });
};

// Continues the game (both restart and keep playing)
HTMLActuator.prototype.continueGame = function() {
  this.clearMessage();
};

HTMLActuator.prototype.clearContainer = function(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
};

HTMLActuator.prototype.addTile = function(tile) {
  var self = this;

  var wrapper = document.createElement("div");
  var inner = document.createElement("div");
  var position = tile.previousPosition || {
    x: tile.x,
    y: tile.y
  };
  var positionClass = this.positionClass(position);

  // We can't use classlist because it somehow glitches when replacing classes
  var classes = ["tile", "tile-" + tile.value, positionClass];

  if (tile.value > 2048) classes.push("tile-super");

  this.applyClasses(wrapper, classes);

  inner.classList.add("tile-inner");
  inner.textContent = tile.value;

  if (tile.previousPosition) {
    // Make sure that the tile gets rendered in the previous position first
    window.requestAnimationFrame(function() {
      classes[2] = self.positionClass({
        x: tile.x,
        y: tile.y
      });
      self.applyClasses(wrapper, classes); // Update the position
    });
  } else if (tile.mergedFrom) {
    classes.push("tile-merged");
    this.applyClasses(wrapper, classes);

    // Render the tiles that merged
    tile.mergedFrom.forEach(function(merged) {
      self.addTile(merged);
    });
  } else {
    classes.push("tile-new");
    this.applyClasses(wrapper, classes);
  }

  // Add the inner part of the tile to the wrapper
  wrapper.appendChild(inner);

  // Put the tile on the board
  this.tileContainer.appendChild(wrapper);
};

HTMLActuator.prototype.applyClasses = function(element, classes) {
  element.setAttribute("class", classes.join(" "));
};

HTMLActuator.prototype.normalizePosition = function(position) {
  return {
    x: position.x + 1,
    y: position.y + 1
  };
};

HTMLActuator.prototype.positionClass = function(position) {
  position = this.normalizePosition(position);
  return "tile-position-" + position.x + "-" + position.y;
};

HTMLActuator.prototype.updateScore = function(score) {
  this.clearContainer(this.scoreContainer);

  var difference = score - this.score;
  this.score = score;

  this.scoreContainer.textContent = this.score;

  if (difference > 0) {
    var addition = document.createElement("div");
    addition.classList.add("score-addition");
    addition.textContent = "+" + difference;

    this.scoreContainer.appendChild(addition);
  }
};

HTMLActuator.prototype.updateHisScore = function(score) {

  this.clearContainer(this.hisScoreContainer);
  console.log(score + " : " + this.hisScore);

  var difference = score - this.hisScore;
  console.log("diff: " + difference);
  this.hisScore = score;

  this.hisScoreContainer.textContent = this.hisScore;

  if (difference > 0) {
    var addition = document.createElement("div");
    addition.classList.add("score-addition");
    addition.textContent = "+" + difference;

    this.hisScoreContainer.appendChild(addition);
  }
};


HTMLActuator.prototype.updateBestScore = function(bestScore) {
  this.bestContainer.textContent = bestScore;
};

HTMLActuator.prototype.message = function(won) {

  console.log("show message");

  var type = won ? "game-won" : "game-over";
  var message = won ? "You win!" : "Game over!";


  this.messageContainer.classList.add(type);
  this.messageContainer.getElementsByTagName("p")[0].textContent = message;

};

HTMLActuator.prototype.matchingMessage = function(message, command) {

  this.matchingContainer.getElementsByTagName("p")[0].textContent = message;
  this.matchingContainer.classList.add("show-matching");
  if (command) {
    this.matchingContainer.getElementsByTagName("a")[0].textContent = "再次匹配";
  } else {
    this.matchingContainer.getElementsByTagName("a")[0].textContent = "取消匹配";
  }
};

HTMLActuator.prototype.clearMatchingMessage = function(won) {

  this.matchingContainer.classList.remove("show-matching");

};



HTMLActuator.prototype.clearMessage = function() {
  // IE only takes one value to remove at a time.
  this.messageContainer.classList.remove("game-won");
  this.messageContainer.classList.remove("game-over");
};

HTMLActuator.prototype.pkButtonClick = function(tip) {
  this.pkButton.classList.remove("unclick");
  this.pkButton.textContent = tip ? tip : "对战";;
};

HTMLActuator.prototype.pkButtonUnclick = function(tip) {
  this.pkButton.classList.add("unclick");
  this.pkButton.textContent = tip ? tip : "网络连接错误";
};


HTMLActuator.prototype.restartButtonUnclick = function() {
  this.restartButton.classList.add("unclick");
};

HTMLActuator.prototype.restartButtonClick = function(tip) {
  this.restartButton.classList.remove("unclick");
};

HTMLActuator.prototype.hisScoreContainerShowCtl = function(show) {
  this.hisScoreContainer.textContent = 0;
  if (show) {
    this.hisScoreContainer.classList.remove("hidden");

  } else {
    this.hisScoreContainer.classList.add("hidden");
  }

};

HTMLActuator.prototype.gameClockUpdate = function(Clock, showit) {
  if (showit) {
    this.bestContainer.classList.add("hidden");
    this.gameClockShow.textContent = Clock;
  } else {
    this.bestContainer.classList.remove("hidden");
    this.gameClockShow.textContent = "2048";
  }
}

HTMLActuator.prototype.gameOverBefore = function(Clock) {
  this.message(false);
}

HTMLActuator.prototype.gameOverResult = function(won) {
  var message = won ? "你赢了" : "你输了";
  this.messageContainer.classList.add("game-over");
  this.messageContainer.getElementsByTagName("p")[0].textContent = message;
}