(function() {

	/**
	 * The Advanced Battleship AI class
	 * Advanced prediction based targeting
	 * Advanced sunk ship resolution
	 * Protects against prediction based AIs with a more uniform distribution during board generation
	 * Combats advanced AI's that use non-normal distribution of ships during board generation
	 *  - Costs about 2 moves per game against a normal dist, can save up to 4 moves against non-normal dist
	 * Manages the server bug where ships of length 3 may be incorrectly reported as 'sunk'
	 *
	 * Should average about 40-45 moves to win against most opponents
	 *
	 * @author Levi Lansing
	 * June 2014
	 *
	 * @constructor
	 */
	function BattleshipAI() {
		this.board = make2dArray(10, 10, -1);
		this.predictionBoard = make2dArray(10, 10, 0);
		this.sunkShips = [false, false, false, false, false];
		/** @type {[{x:int,y:int,length:int}]} */
		this.unresolvedSinks = [];

		// can't trust a sink of length 3 (bug on server). if bug is fixed, change this to false
		this.manageSunk3Bug = true;
		this.sunkShip3Locations = [];
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
	BattleshipAI.prototype.generateBoard = function() {
		var board = make2dArray(10, 10, '');

		// defend against probability based AIs
		// adjust the distribution of ships to be more uniform
		// hand estimated values, optimal numbers could be determined with more time
		var distributionBySize = [
			[],
			[],
			[2, .5, 1, 1, 1, 1, 1, .5, 2],
			[3, 1, 1, 1, 1, 1, 1, 3],
			[4, 2, 2, 1, 2, 2, 4],
			[5, 3, 3, 3, 3, 5]
		];
		var rowColumnDistribution = [5, 5.5, 5, 5, 5, 5, 5, 5, 5.5, 5];
		var rowColumnDistributionShip2 = [9, .5, .1, .1, .1, .1, .1, .1, .5, 9];

		// place each ship
		[2, 3, 3, 4, 5].forEach(function placeShip(length) {
			// get random position based on distribution pattern
			var x = randomFromDistribution(distributionBySize[length]);
			var y;
			if (length == 2) {
				y = randomFromDistribution(rowColumnDistributionShip2);
			} else {
				y = randomFromDistribution(rowColumnDistribution);
			}

			var direction = Orientation.Horizontal;
			if (getRandomBool()) {
				direction = Orientation.Vertical;
				var temp = x;
				y = x;
				x = temp;
			}

			if (isValidPlacement(board, x, y, length, direction)) {
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

		// Consider adding clustering detection to not start games with too many ships touching

		return board;
	};

	/**
	 * Get a random number using the specified distribution
	 * the return value is in the set [0, distribution.length-1]
	 * @param distribution
	 * @returns {number}
	 */
	function randomFromDistribution(distribution) {
		var sum = 0;
		for (var i = 0; i < distribution.length; i++) {
			sum += distribution[i];
		}

		var value = Math.random();
		for (i = 0; i < distribution.length; i++) {
			value -= distribution[i] / sum;
			if (value < 0) {
				return i;
			}
		}
		return distribution.length - 1;
	}

	/**
	 * Returns a representation of the game board
	 * -1: unknown, 0: miss, 1: hit, 2: sunk
	 * @returns {Array|*}
	 */
	BattleshipAI.prototype.getBoardState = function() {
		return this.board;
	};

	/**
	 * Returns the probability distribution of potential hits on the game board
	 * values range 0 to 1 (least likely to most likely)
	 * @returns {Array|*}
	 */
	BattleshipAI.prototype.getPredictionBoard = function() {
		return this.predictionBoard;
	};

	/**
	 * Get the next move in Battleship Coordinates
	 * @returns {string}
	 */
	BattleshipAI.prototype.getNextMove = function() {
		this.resolveSinks();
		this.updateTargetedPredictions();
		return this.getMoveFromPredictions();
	};

	/**
	 * Record a Hit
	 * @param {string} location
	 * @param {int|bool} sunk
	 */
	BattleshipAI.prototype.hit = function(location, sunk) {
		var hit = fromCoordinate(location);

		this.board[hit.x][hit.y] = sunk ? HitState.Sunk : HitState.Hit;

		if (sunk > 0) {
			// can't trust a sink of length 3 (bug on server)
			var trustSink = sunk != 3;
			if (this.manageSunk3Bug && !trustSink) {
				this.sunkShip3Locations.push(hit);

				// attempt to verify
				var hits = findConnectedHits(this.board, hit.x, hit.y, Direction.Left);
				hits = hits.concat(findConnectedHits(this.board, hit.x, hit.y, Direction.Right));
				hits = hits.concat(findConnectedHits(this.board, hit.x, hit.y, Direction.Up));
				hits = hits.concat(findConnectedHits(this.board, hit.x, hit.y, Direction.Down));
				if (hits.length + 1 == sunk) {
					// in about 95% of cases this is a valid sink. more care could be taken to detect the outliers
					trustSink = true;
				}
			} else {
				trustSink = true;
			}

			if (!trustSink) {
				this.board[hit.x][hit.y] = HitState.Hit;
				// it's ok to mark one of the 3 length ships as sunk
				if (sunk == 3) {
					this.sunkShips[1] = true;
				}
			} else {
				// mark the sink as unresolved
				this.unresolvedSinks.push({x: hit.x, y: hit.y, length: sunk});
				if (sunk == 3 && this.sunkShips[1]) {
					// the other ship of length 3
					this.sunkShips[2] = true;
				} else {
					this.sunkShips[[-1, -1, 0, 1, 3, 4][sunk]] = true;
				}
			}
		}
	};

	/**
	 * Record a Miss
	 * @param {string} location
	 */
	BattleshipAI.prototype.miss = function(location) {
		var miss = fromCoordinate(location);
		this.board[miss.x][miss.y] = HitState.Miss;
	};

	/**
	 * Update the prediction board when in the Destroy state
	 */
	BattleshipAI.prototype.updateTargetedPredictions = function() {
		this.clearPredictions();
		this.updatePredictions();

		var nHits = 0;
		for (var x = 0; x < 10; x++) {
			for (var y = 0; y < 10; y++) {
				if (this.board[x][y] == HitState.Hit) {
					nHits++;
					this.addPredictionsForHit(x, y);
				}
			}
		}
	};

	/**
	 * Update the prediction board based on where ships could possibly fit
	 */
	BattleshipAI.prototype.updatePredictions = function() {
		var lengths = [2, 3, 3, 4, 5];
		for (var i = 0; i < lengths.length; i++) {
			if (this.sunkShips[i]) {
				continue;
			}

			var length = lengths[i];

			// attempt to place ship in every position
			for (var x = 0; x < 10; x++) {
				for (var y = 0; y < 10; y++) {
					if (shipFits(this.board, x, y, length, Orientation.Horizontal)) {
						for (var x2 = x; x2 < x + length; x2++) {
							this.predictionBoard[x2][y]++;
						}
					}
					if (shipFits(this.board, x, y, length, Orientation.Vertical)) {
						for (var y2 = y; y2 < y + length; y2++) {
							this.predictionBoard[x][y2]++;
						}
					}
				}
			}
		}
	};

	/**
	 * Add to the prediction board weights for ships that could be passing through
	 * the specified hit point
	 * @param hitX
	 * @param hitY
	 */
	BattleshipAI.prototype.addPredictionsForHit = function(hitX, hitY) {
		var lengths = [2, 3, 3, 4, 5];
		for (var i = 0; i < lengths.length; i++) {
			if (this.sunkShips[i]) {
				continue;
			}
			var length = lengths[i];
			var nHits, x2, y2;

			// horizontally
			for (var x = hitX - length + 1; x <= hitX; x++) {
				if (shipFits(this.board, x, hitY, length, Orientation.Horizontal)) {
					// count the hits
					nHits = 0;
					for (x2 = x; x2 < x + length; x2++) {
						if (this.board[x2][hitY] == HitState.Hit) {
							nHits++;
						}
					}
					// add to the prediction weights
					for (x2 = x; x2 < x + length; x2++) {
						// heavier weight for ships crossing existing hits
						if (this.board[x2][hitY] == HitState.Unknown) {
							this.predictionBoard[x2][hitY] += 2 + 10 * nHits / length;
						}
					}
				}
			}

			// vertically
			for (var y = hitY - length + 1; y <= hitY; y++) {
				if (shipFits(this.board, hitX, y, length, Orientation.Vertical)) {
					// count the hits
					nHits = 0;
					for (y2 = y; y2 < y + length; y2++) {
						if (this.board[hitX][y2] == HitState.Hit) {
							nHits++;
						}
					}
					// add to the prediction weights
					for (y2 = y; y2 < y + length; y2++) {
						// heavier weight for ships crossing existing hits
						if (this.board[hitX][y2] == HitState.Unknown) {
							this.predictionBoard[hitX][y2] += 2 + 10 * nHits / length;
						}
					}
				}
			}
		}
	};

	/**
	 * Normalize the prediction board
	 * Warning: only call this once after the predictions are generated!
	 * successive calls will apply the inverse distribution multiple times
	 */
	BattleshipAI.prototype.normalizePredictions = function() {
		var x, y, max = 0;
		for (x = 0; x < 10; x++) {
			for (y = 0; y < 10; y++) {
				// add protection against AI's that have more uniform or unique distributions of ships
				this.predictionBoard[x][y] *= inverseDistribution[x][y];
				max = Math.max(max, this.predictionBoard[x][y]);
			}
		}

		if (max == 0 || max == 1) {
			return;
		}

		for (x = 0; x < 10; x++) {
			for (y = 0; y < 10; y++) {
				this.predictionBoard[x][y] /= max;
			}
		}
	};

	/**
	 * Get the next move based on the prediction board
	 * For simplification, returns the first best move encountered
	 * An improved AI, would choose at start to use first or last consistently
	 * which would invert the initial firing pattern
	 * @returns {string}
	 */
	BattleshipAI.prototype.getMoveFromPredictions = function() {
		this.normalizePredictions();

		var x, y, max = 0, position = {x: -1, y: -1};
		for (x = 0; x < 10; x++) {
			for (y = 0; y < 10; y++) {
				if (this.predictionBoard[x][y] > max && this.board[x][y] == HitState.Unknown) {
					max = this.predictionBoard[x][y];
					position.x = x;
					position.y = y;
				}
			}
		}

		// if we can't predict anything, there was a problem (either server or client side)
		if (position.x == -1) {

			// most likely reason is the server told us we sunk both ships of length 3
			if (this.manageSunk3Bug) {
				if (this.sunkShips[1] || this.sunkShips[2]) {
					this.sunkShips[1] = false;
					this.sunkShips[2] = false;
					for (var i=0; i<this.sunkShip3Locations.length; i++) {
						var hit = this.sunkShip3Locations[i];
						undoConnectedSunkHits(this.board, hit.x, hit.y);
					}
					return this.getMoveFromPredictions();
				}
			}

			// fallback to random shooting
			var attempts = 10000;
			do {
				position.x = getRandomInt(0, 9);
				position.y = getRandomInt(0, 9);
			} while (attempts-- > 0 && this.board[position.x][position.y] != HitState.Unknown);
			console.log('resorted to random shooting');
			if (attempts <= 0) {
				Battleship.displayError('Something went wrong. No more locations to fire on.');
				Battleship.paused = true;
			}
		}

		return makeCoordinate(position.x, position.y);
	};

	/**
	 * Reset the prediction board to all 0s
	 */
	BattleshipAI.prototype.clearPredictions = function() {
		this.predictionBoard = make2dArray(10, 10, 0);
	};

	/**
	 * Attempt to resolve hits that have not yet been marked as sunk
	 * @returns {boolean}
	 */
	BattleshipAI.prototype.resolveSinks = function() {
		if (this.unresolvedSinks.length == 0) {
			return true;
		}

		var nUnresolvedHits = 0;
		var i;
		for (i = 0; i < this.unresolvedSinks.length; i++) {
			// -1 because the actual sink point is marked sunk (not hit)
			nUnresolvedHits += this.unresolvedSinks[i].length - 1;
		}

		var nHits = 0;
		for (var x = 0; x < 10; x++) {
			for (var y = 0; y < 10; y++) {
				if (this.board[x][y] == HitState.Hit) {
					nHits++;
				}
			}
		}

		// if the number of hits on the board is an exact match to the number of unresolved hits
		// we know they all belong to the unresolved sinks
		if (nHits == nUnresolvedHits) {
			this.unresolvedSinks.length = 0;
			for (x = 0; x < 10; x++) {
				for (y = 0; y < 10; y++) {
					if (this.board[x][y] == HitState.Hit) {
						this.board[x][y] = HitState.Sunk;
					}
				}
			}
		}

		// try to resolve each sink point
		for (i = this.unresolvedSinks.length - 1; i >= 0; i--) {
			var sink = this.unresolvedSinks[i];

			// try to determine which hits are part of the sunk ship
			x = sink.x;
			y = sink.y;
			var length = sink.length;

			var hHits = findConnectedHits(this.board, x, y, Direction.Left);
			hHits = hHits.concat(findConnectedHits(this.board, x, y, Direction.Right));

			var vHits = findConnectedHits(this.board, x, y, Direction.Up);
			vHits = vHits.concat(findConnectedHits(this.board, x, y, Direction.Down));

			var x2, y2, j, resolved = false;
			// if there aren't enough vertical hits
			if (vHits.length + 1 < length && hHits.length + 1 >= length) {
				// if the number of horizontal hits == length we're set
				if (hHits.length + 1 == length) {
					resolved = true;
					for (j = 0; j < hHits.length; j++) {
						this.board[hHits[j].x][hHits[j].y] = HitState.Sunk;
					}
				} else {
					// check if we are at the edge (of the board or of the hits)
					if (x == 0 || this.board[x - 1][y] != HitState.Hit) {
						// left edge
						resolved = true;
						for (x2 = x + 1; x2 < x + length; x2++) {
							this.board[x2][y] = HitState.Sunk;
						}
					} else if (x == 9 || this.board[x + 1][y] != HitState.Hit) {
						// right edge
						resolved = true;
						for (x2 = x - 1; x2 > x - length; x2--) {
							this.board[x2][y] = HitState.Sunk;
						}
					}
				}
			}

			if (hHits.length + 1 < length && vHits.length + 1 >= length) {
				// if the number of vertical hits == length we're set
				if (vHits.length + 1 == length) {
					resolved = true;
					for (j = 0; j < vHits.length; j++) {
						this.board[vHits[j].x][vHits[j].y] = HitState.Sunk;
					}
				} else {
					// check if we are at the edge (of the board or of the hits)
					if (y == 0 || this.board[x][y - 1] != HitState.Hit) {
						// top edge
						resolved = true;
						for (y2 = y + 1; y2 < y + length; y2++) {
							this.board[x][y2] = HitState.Sunk;
						}
					} else if (y == 9 || this.board[x][y + 1] != HitState.Hit) {
						// bottom edge
						resolved = true;
						for (y2 = y - 1; y2 > y - length; y2--) {
							this.board[x][y2] = HitState.Sunk;
						}
					}
				}
			}

			if (resolved) {
				this.unresolvedSinks.splice(i, 1);
			}
		}

		return this.unresolvedSinks.length == 0;
	};

	/**
	 * Returns an array of connected hit locations from the provided location (not inclusive)
	 * in the specified direction
	 * @param {Array} board
	 * @param {int} x
	 * @param {int} y
	 * @param {int} direction
	 * @return {[{x:int,y:int}]}
	 */
	function findConnectedHits(board, x, y, direction) {
		var hits = [];
		var x2, y2;
		switch (direction) {
		case Direction.Left:
			for (x2 = x - 1; x2 >= 0; x2--) {
				if (board[x2][y] != HitState.Hit) {
					break;
				}
				hits.push({x: x2, y: y});
			}
			break;

		case Direction.Right:
			for (x2 = x + 1; x2 < 10; x2++) {
				if (board[x2][y] != HitState.Hit) {
					break;
				}
				hits.push({x: x2, y: y});
			}
			break;

		case Direction.Up:
			for (y2 = y - 1; y2 >= 0; y2--) {
				if (board[x][y2] != HitState.Hit) {
					break;
				}
				hits.push({x: x, y: y2});
			}
			break;

		case Direction.Down:
			for (y2 = y + 1; y2 < 10; y2++) {
				if (board[x][y2] != HitState.Hit) {
					break;
				}
				hits.push({x: x, y: y2});
			}
			break;
		}
		return hits;
	}

	/**
	 * Changes connected sunk points to hits from the provided location (inclusive) up to 2 spaces away
	 * in all directions. Specifically for managing the sunk ship of length 3 bug
	 * @param {Array} board
	 * @param {int} x
	 * @param {int} y
	 * @return {[{x:int,y:int}]}
	 */
	function undoConnectedSunkHits(board, x, y) {
		var hits = [];
		var x2, y2;
		for (x2 = x; x2 >= x-2 && x2 >= 0; x2--) {
			if (board[x2][y] != HitState.Sunk && board[x2][y] != HitState.Hit) {
				break;
			}
			board[x2][y] = HitState.Hit;
		}
		for (x2 = x + 1; x2 <= x+2 && x2 < 10; x2++) {
			if (board[x2][y] != HitState.Sunk && board[x2][y] != HitState.Hit) {
				break;
			}
			board[x2][y] = HitState.Hit;
		}
		for (y2 = y - 1; y2 >= y-2 && y2 >= 0; y2--) {
			if (board[x][y2] != HitState.Sunk && board[x][y2] != HitState.Hit) {
				break;
			}
			board[x][y2] = HitState.Hit;
		}
		for (y2 = y + 1; y2 <= y+2 && y2 < 10; y2++) {
			if (board[x][y2] != HitState.Sunk && board[x][y2] != HitState.Hit) {
				break;
			}
			board[x][y2] = HitState.Hit;
		}

	}

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
	 * @returns {{x:int,y:int}}
	 */
	function fromCoordinate(coordinate) {
		if (!coordinate || coordinate.length < 2 || coordinate.length > 3) {
			throw 'Invalid coordinate notation';
		}
		return {x: coordinate.charCodeAt(0) - 'A'.charCodeAt(0), y: parseInt(coordinate.substr(1)) - 1};
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
		if (x < 0 || y < 0) {
			return false;
		}

		if (orientation == Orientation.Horizontal) {
			if (x + length > 10) {
				return false;
			}
			for (var x2 = x; x2 < x + length; x2++) {
				// the ships we're looking for cannot be found at Miss or Sunk positions
				if (board[x2][y] == HitState.Miss || board[x2][y] == HitState.Sunk) {
					return false;
				}
			}
		} else {
			if (y + length > 10) {
				return false;
			}
			for (var y2 = y; y2 < y + length; y2++) {
				// the ships we're looking for cannot be found at Miss or Sunk positions
				if (board[x][y2] == HitState.Miss || board[x][y2] == HitState.Sunk) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * Check if a ship fits on a board given the position/length/direction
	 * Specifically for board generation
	 * @param board
	 * @param x
	 * @param y
	 * @param length
	 * @param orientation
	 * @returns {boolean}
	 */
	function isValidPlacement(board, x, y, length, orientation) {
		if (x < 0 || y < 0 || x + length > 10 || y + length > 10) {
			return false;
		}

		if (orientation == Orientation.Horizontal) {
			for (var x2 = x; x2 < x + length; x2++) {
				// the ships we're looking for cannot be found at Miss or Sunk positions
				if (board[x2][y] != '') {
					return false;
				}
			}
		} else {
			for (var y2 = y; y2 < y + length; y2++) {
				// the ships we're looking for cannot be found at Miss or Sunk positions
				if (board[x][y2] != '') {
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

	// an accurate inverse of the average distribution of ships randomly placed on a battleship board
	var inverseDistribution = [
		[1.00000000, 0.66666669, 0.52631575, 0.47619045, 0.45454544, 0.45454544, 0.47619045, 0.52631575, 0.66666669, 1.00000000],
		[0.66666669, 0.50000000, 0.41666669, 0.38461536, 0.37037036, 0.37037036, 0.38461536, 0.41666669, 0.50000000, 0.66666669],
		[0.52631575, 0.41666669, 0.35714284, 0.33333334, 0.32258064, 0.32258064, 0.33333334, 0.35714284, 0.41666669, 0.52631575],
		[0.47619045, 0.38461536, 0.33333334, 0.31250000, 0.30303028, 0.30303028, 0.31250000, 0.33333334, 0.38461536, 0.47619045],
		[0.45454544, 0.37037036, 0.32258064, 0.30303028, 0.29411766, 0.29411766, 0.30303028, 0.32258064, 0.37037036, 0.45454544],
		[0.45454544, 0.37037036, 0.32258064, 0.30303028, 0.29411766, 0.29411766, 0.30303028, 0.32258064, 0.37037036, 0.45454544],
		[0.47619045, 0.38461536, 0.33333334, 0.31250000, 0.30303028, 0.30303028, 0.31250000, 0.33333334, 0.38461536, 0.47619045],
		[0.52631575, 0.41666669, 0.35714284, 0.33333334, 0.32258064, 0.32258064, 0.33333334, 0.35714284, 0.41666669, 0.52631575],
		[0.66666669, 0.50000000, 0.41666669, 0.38461536, 0.37037036, 0.37037036, 0.38461536, 0.41666669, 0.50000000, 0.66666669],
		[1.00000000, 0.66666669, 0.52631575, 0.47619045, 0.45454544, 0.45454544, 0.47619045, 0.52631575, 0.66666669, 1.00000000]
	];

	// export
	this.BattleshipAI = BattleshipAI;
})();
