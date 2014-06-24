(function() {

	/**
	 * The Battleship AI Random Shooter class for test purposes
	 * Includes basic seek and destroy logic
	 * @constructor
	 */
	function BattleshipAIRandom() {
		this.board = make2dArray(10, 10, -1);
		this.state = State.Seeking;
		this.lastHit = [0, 0];
	}

	var Orientation = {
		Horizontal: 0,
		Vertical: 1
	};

	var Direction = {
		Left: 0,
		Right: 1,
		Up: 2,
		Down: 3
	};

	var State = {
		Seeking: 0,
		Destroying: 1
	};

	var HitState = {
		Unknown: -1,
		Miss: 0,
		Hit: 1,
		Sunk: 2
	};

	/**
	 * Get the starting board formatted for the API
	 * @returns {Array}
	 */
	BattleshipAIRandom.prototype.generateBoard = function() {
		var board = make2dArray(10, 10, '');

		// place each ship
		[2, 3, 3, 4, 5].forEach(function placeShip(length) {
			var x = getRandomInt(0, 10 - length);
			var y = getRandomInt(0, 10 - length);
			var direction = getRandomBool() ? Orientation.Horizontal : Orientation.Vertical;

			if (shipFits(board, x, y, length, direction)) {
				for (var i = 0; i < length; i++) {
					board[x][y] = length;
					if (direction == Orientation.Horizontal) {
						x++;
					} else {
						y++;
					}
				}
				return;
			}

			// didn't fit, try again
			placeShip(length);
		});

		return board;
	};

	/**
	 * return a representation of the game board
	 * -1: unknown, 0: miss, 1: hit, 2: sunk
	 * @returns {Array|*}
	 */
	BattleshipAIRandom.prototype.getBoardState = function() {
		return this.board;
	};

	/**
	 * return the probability distribution of potential hits on the game board
	 * values range 0 to 1 (least likely to most likely)
	 * @returns {Array|*}
	 */
	BattleshipAIRandom.prototype.getPredictionBoard = function() {
		return make2dArray(10, 10, 1);
	};

	/**
	 * Get the next move in Battleship Coordinates
	 * @returns {string}
	 */
	BattleshipAIRandom.prototype.getNextMove = function() {
		switch (this.state) {
		case State.Seeking:
			return this.getSeekingMove();

		case State.Destroying:
			return this.getDestroyingMove();
		}

		throw 'Invalid AI State';
	};

	/**
	 * Record a Hit
	 * @param {string} location
	 * @param {int|bool} sunk
	 */
	BattleshipAIRandom.prototype.hit = function(location, sunk) {
		var hit = fromCoordinate(location);
		this.board[hit[0]][hit[1]] = sunk ? HitState.Sunk : HitState.Hit;
		this.lastHit = hit;
		if (!sunk) {
			this.state = State.Destroying;
		} else {
			this.state = State.Seeking;
		}
	};

	/**
	 * Record a Miss
	 * @param {string} location
	 */
	BattleshipAIRandom.prototype.miss = function(location) {
		var miss = fromCoordinate(location);
		this.board[miss[0]][miss[1]] = HitState.Miss;
	};

	/**
	 * Get the move for seeking mode
	 * @returns {string}
	 */
	BattleshipAIRandom.prototype.getSeekingMove = function() {
		var maxAttempts = 10000;
		while (maxAttempts-- > 0) {
			var x = getRandomInt(0, 9);
			var y = getRandomInt(0, 9);
			if (this.board[x][y] == -1) {
				return makeCoordinate(x, y);
			}
		}
		throw 'Unable to find a move';
	};

	/**
	 * Get the move for destroying mode
	 * @returns {string}
	 */
	BattleshipAIRandom.prototype.getDestroyingMove = function() {
		var x;
		var y = this.lastHit[1];

		for (x = this.lastHit[0] - 1; x >= 0; x--) {
			if (this.board[x][y] == 0) {
				break;
			}
			if (this.board[x][y] == -1) {
				return makeCoordinate(x, y);
			}
		}

		for (x = this.lastHit[0] + 1; x < 10; x++) {
			if (this.board[x][y] == 0) {
				break;
			}
			if (this.board[x][y] == -1) {
				return makeCoordinate(x, y);
			}
		}

		x = this.lastHit[0];
		for (y = this.lastHit[1] - 1; y >= 0; y--) {
			if (this.board[x][y] == 0) {
				break;
			}
			if (this.board[x][y] == -1) {
				return makeCoordinate(x, y);
			}
		}

		for (y = this.lastHit[1] + 1; y < 10; y++) {
			if (this.board[x][y] == 0) {
				break;
			}
			if (this.board[x][y] == -1) {
				return makeCoordinate(x, y);
			}
		}

		// no more destroying moves, return to seeking
		this.state = State.Seeking;
		return this.getSeekingMove();
	};

	/**
	 * Convert x,y coordinate into battleship notation
	 * @param {int} x
	 * @param {int} y
	 * @returns {string}
	 */
	function makeCoordinate(x, y) {
		if (x < 0 || y < 0 || x > 9 || y > 9) {
			throw 'Invalid coordinates';
		}
		return 'ABCDEFGHIJ'[x] + (y + 1);
	}

	/**
	 * Convert from battleship notation into [x,y] integers
	 * @param {string} coordinate
	 * @returns {[int,int]}
	 */
	function fromCoordinate(coordinate) {
		if (!coordinate || coordinate.length < 2 || coordinate.length > 3) {
			throw 'Invalid coordinate notation';
		}
		return [coordinate.charCodeAt(0) - 'A'.charCodeAt(0), parseInt(coordinate.substr(1)) - 1];
	}

	/**
	 * Check if a ship fits on a board given the position/length/direction
	 * @param board
	 * @param x
	 * @param y
	 * @param length
	 * @param orientation
	 * @returns {boolean}
	 */
	function shipFits(board, x, y, length, orientation) {
		if (orientation == Orientation.Horizontal) {
			for (var x2 = x; x2 < x + length && x2 < 10; x2++) {
				if (board[x2][y] > 0) {
					return false;
				}
			}
		} else {
			for (var y2 = y; y2 < y + length && y2 < 10; y2++) {
				if (board[x][y2] > 0) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * Create a 2 dimensional array and fill it with fillValue
	 * @param {int} width
	 * @param {int} height
	 * @param fillValue
	 * @returns {Array}
	 */
	function make2dArray(width, height, fillValue) {
		var array = [];
		for (var i = 0; i < width; i++) {
			var item = [];
			for (var j = 0; j < height; j++) {
				item.push(fillValue);
			}
			array.push(item);
		}
		return array;
	}

	/**
	 * Returns a random integer between min (inclusive) and max (inclusive)
	 * Using Math.round() will give you a non-uniform distribution!
	 * (credit: Mozilla dev center)
	 * @param {int} min
	 * @param {int} max
	 */
	function getRandomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	/**
	 * Get a uniformly distributed boolean value
	 * @returns {boolean}
	 */
	function getRandomBool() {
		return !Math.floor(Math.random() * 2);
	}

	// export
	this.BattleshipAIRandom = BattleshipAIRandom;
})();