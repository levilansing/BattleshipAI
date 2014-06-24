(function($) {
	var lastGameLoopTime;
	var lastMoveNumber = -1;

	/**
	 * Static Battleship class
	 *
	 */
	var Battleship = {
		gameId: -1,
		user: null,
		serverURL: null,
		algorithm: null,
		sunkShips: [false, false, false, false, false],
		shipNames: ['Patrol', 'Destroyer', 'Submarine', 'Battleship', 'Carrier'],
		moveNumber: 0,
		paused: false,
		turnDelay: 600,
		retryDelay: 3000,
		isGameOver: false,

		init: function() {
			$('#user').val('Levi' + Math.floor(Math.random() * 100));
			$('#connectToServer').attr('disabled', false);

			// connect to some user interaction events
			$.observer.listenForEvents(Battleship, {
				onConnectToServerClick: Battleship.onConnect,
				onPlaySpeedChange: Battleship.onSpeedChange,
				onPlayAgainClick: function(event, element) {
					$(element).hide(300);
					$('#gameScreen').fadeOut(300);
					$('#connectionForm').delay(300).slideDown(300);
					$('#connectToServer').attr('disabled', false);
					$('#statusError').empty();
					$('#winOrLose').empty();
				}
			});

			// generate the AI display board
			var $board = $('<div class="board"></div>');
			for (var y=0; y<10; y++) {
				var $row = $('<div class="boardRow"></div>');
				for (var x=0; x<10; x++) {
					$row.append($('<div class="boardCell"></div>'));
				}
				$board.append($row);
			}
			$('#boardStatus').append($board);
		},

		onConnect: function(event) {

			// validate the server URL (basic check)
			var url = $.trim($('#serverUrl').val());
			if (!url.match(/^https?:\/\/.+/)) {
				Battleship.displayError('Please enter a valid server URL (http://...)');
				return;
			}
			if (url[url.length - 1] != '/') {
				url += '/';
			}
			Battleship.serverURL = url;

			// validate user
			var user = $.trim($('#user').val());
			if (user == '') {
				Battleship.displayError('Please enter a user name');
				return;
			}
			Battleship.user = user;
			$('#infoUser').text(user);

			// initialize the Algorithm
			switch ($('#algorithm').val()) {
			case 'BattleshipAIRandom':
				Battleship.algorithm = new BattleshipAIRandom();
				break;

			case 'BattleshipAIAdvanced':
				Battleship.algorithm = new BattleshipAI();
				break;

			default:
				Battleship.displayError('Please select an algorithm');
				return;
			}
			$('#infoAlgorithm').text($('#algorithm').val());
			Battleship.setStatus('Connecting');
			$('#infoMove').text(0);

			$('#connectToServer').attr('disabled', true);

			// join the game
			Battleship.api.joinGame(Battleship.algorithm.generateBoard(), function(gameId) {
				Battleship.gameId = gameId;
				Battleship.isGameOver = false;
				Battleship.sunkShips = [false, false, false, false, false];
				Battleship.moveNumber = 0;
				$('boardCell').empty().css('background', '#fff');
				Battleship.updateDisplay();

				$('#connectionForm').slideUp(300);
				$('#gameScreen').delay(300).fadeIn(300);

				// start the game loop
				lastGameLoopTime = new Date();
				Battleship.gameLoop();

			}, function() {
				$('#connectToServer').attr('disabled', false);
			});
		},

		onSpeedChange: function(event, element) {
			var newSpeed = $(element).val();
			if (newSpeed < 0) {
				Battleship.paused = true;
			} else {
				Battleship.paused = false;
				Battleship.turnDelay = newSpeed;
			}
		},

		/**
		 * The main game loop. Checks the status and continues as instructed
		 */
		gameLoop: function() {
			if (Battleship.paused) {
				lastGameLoopTime = new Date();
				setTimeout(Battleship.gameLoop, 1000/15);
				return;
			}
			var newTime = new Date();
			if (newTime - lastGameLoopTime < Battleship.turnDelay) {
				setTimeout(Battleship.gameLoop, 1000/60);
				return;
			}
			lastGameLoopTime = newTime;

			// get the status
			Battleship.api.getStatus(function(status, myTurn) {
				if (status == 'won' || status == 'lost') {
					$('#winOrLose').text('You ' + status + '!');
					Battleship.setStatus('Game Over. You ' + status + '!');
					if (!Battleship.isGameOver) {
						Battleship.isGameOver = true;
						$('#playAgain').show(300);
					}
					// don't continue the game loop
					return;
				} else if (status == 'playing') {
					if (myTurn) {
						Battleship.fire(Battleship.algorithm.getNextMove());
						Battleship.setStatus('Playing. (My turn)');
					} else {
						Battleship.gameLoop();
						Battleship.setStatus('Playing. (Their Turn)');
					}
				} else {
					// Treat invalid status as an error
					setTimeout(Battleship.gameLoop, Battleship.retryDelay);
				}
				Battleship.updateDisplay();
			}, function() {
				// error, try again after a few seconds
				Battleship.setStatus('Server Error. Retrying..');
				setTimeout(Battleship.gameLoop, Battleship.retryDelay);
			});
		},

		/**
		 * Send a 'fire' command and handle the response
		 * @param location
		 */
		fire: function(location) {
			Battleship.api.fire(location, function(hit, sunk) {
				// update sunk status for user
				if (hit && sunk) {
					Battleship.recordSunkShip(sunk);
				}
				Battleship.moveNumber++;

				// notify the algorithm of the result
				if (hit) {
					Battleship.algorithm.hit(location, sunk);
				} else {
					Battleship.algorithm.miss(location, sunk);
				}

				Battleship.updateDisplay();
				Battleship.gameLoop();
			}, function() {
				// error, try again after we check the status
				Battleship.setStatus('Server Error. Retrying..');
				setTimeout(Battleship.gameLoop(), Battleship.retryDelay);
			});
		},

		/**
		 * Record the sinking of a ship to display to the user
		 * @param length
		 */
		recordSunkShip: function(length) {
			var index = [-1, -1, 0, 1, 3, 4][length];
			// there are two ships of length 3, if the first is already sunk get the second one
			if (length == 3) {
				if (Battleship.sunkShips[index]) {
					index++;
				}
			}
			// check for errors
			if (Battleship.sunkShips[index]) {
				Battleship.displayError(Battleship.shipNames[index] + ' reported sunk again');
			}
			Battleship.sunkShips[index] = true;
		},

		/**
		 * Set the status on screen
		 * @param status
		 */
		setStatus: function(status) {
			$('#infoStatus').text(status);
		},

		/**
		 * Update the stats and board on screen
		 */
		updateDisplay: function() {
			for (var i=0; i<5; i++) {
				$('#status' + Battleship.shipNames[i]).html(Battleship.sunkShips[i] ? '<b>Sunk</b>' : 'Searching');
			}
			$('#infoMove').text(Battleship.moveNumber);

			if (lastMoveNumber != this.moveNumber) {
				lastMoveNumber = this.moveNumber;

				// update board display
				var stateClasses = ['miss', 'hit', 'sunk'];
				var board = Battleship.algorithm.getBoardState();
				var prediction = Battleship.algorithm.getPredictionBoard();
				var $rows = $('#boardStatus').find('.boardRow');
				for (var y=0; y<10; y++) {
					var row = $rows.eq(y).find('.boardCell');
					for (var x=0; x<10; x++) {
						var $cell = row.eq(x);
						var rgb = hslToRgb(0, 0, prediction[x][y]);
						var cssColor = 'rgb(' + rgb.join(',') + ')';
						$cell.css({'background-color': cssColor});
						var $child = $cell.find(">:first-child");
						var state = -1;
						for (var i=0; i<stateClasses.length; i++) {
							if ($child.hasClass(stateClasses[i])) {
								state = i;
								break;
							}
						}
						var newState = board[x][y];
						if (newState != state) {
							if ($child.length == 0) {
								$child = $('<div></div>');
								$cell.append($child);
							}
							$child.removeClass();
							if (newState >= 0) {
								$child.addClass(stateClasses[board[x][y]]).addClass('new');
							}
						} else {
							$child.removeClass('new');
						}
					}
				}
			}
		},

		/**
		 * Handle an ajax error from the server
		 * @param jqXHR
		 * @param status
		 * @param error
		 */
		ajaxError: function(jqXHR, status, error) {
			if (!error) {
				error = 'Server request failed';
			}
			Battleship.displayError(error);
		},

		/**
		 * Display an error to the user
		 * @param error
		 */
		displayError: function(error) {
			var alertDiv = $('<div class="alert alert-danger alert-dismissable"><button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button></div>');
			alertDiv.append(document.createTextNode(error));
			$('#errorContainer').empty().append(alertDiv);
			$('#statusError').append($('<div></div>').text(error));
		}
	};

	Battleship.api = {
		/**
		 * Join a game
		 * @param board
		 * @param {function(gameId:int)} success
		 * @param {function()} error
		 */
		joinGame: function(board, success, error) {
			var url = Battleship.serverURL + 'games/join';
			$.ajax({
				type: 'POST',
				dataType: "json",
				url: url,
				data: {
					user: Battleship.user,
					board: JSON.stringify(board)
				},
				/**
				 * @param {{game_id}} result
				 */
				success: function(result) {
					if (!result || !result.game_id) {
						Battleship.displayError('Invalid API result for joinGame');
						error();
						return;
					}
					success(result.game_id);
				},
				error: function() {
					Battleship.ajaxError.apply(this, arguments);
					error();
				}
			});
		},

		/**
		 * Get the status of the current game
		 * @param {function(status:string,myTurn:bool)} success
		 * @param {function()} error
		 */
		getStatus: function(success, error) {
			var url = Battleship.serverURL + 'games/status';
			$.ajax({
				type: 'GET',
				dataType: "json",
				url: url,
				data: {
					user: Battleship.user,
					game_id: Battleship.gameId
				},
				/**
				 * @param {{game_status:string,my_turn:bool}} result
				 */
				success: function(result) {
					if (!result || !result.game_status || result.my_turn === undefined) {
						Battleship.displayError('Invalid API result for getStatus');
						error();
						return;
					}
					success(result.game_status, result.my_turn);
				},
				error: function() {
					Battleship.ajaxError.apply(this, arguments);
					error();
				}
			});
		},

		/**
		 * Fire on a location
		 * @param location
		 * @param {function(hit:bool,sunk:int|bool)} success
		 * @param {function()} error
		 */
		fire: function(location, success, error) {
			var url = Battleship.serverURL + 'games/fire';
			$.ajax({
				type: 'POST',
				dataType: "json",
				url: url,
				data: {
					user: Battleship.user,
					game_id: Battleship.gameId,
					shot: location
				},
				/**
				 * @param {{hit, sunk}} result
				 */
				success: function(result) {
					if (!result || result.hit === undefined) {
						Battleship.displayError('Invalid API result for fire');
						error();
						return;
					}
					success(result.hit, result.sunk || false);
				},
				error: function() {
					Battleship.ajaxError.apply(this, arguments);
					error();
				}
			});
		}
	};

	/**
	 * http://axonflux.com/handy-rgb-to-hsl-and-rgb-to-hsv-color-model-c
	 * Converts an HSL color value to RGB. Conversion formula
	 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
	 * Assumes h, s, and l are contained in the set [0, 1] and
	 * returns r, g, and b in the set [0, 255].
	 *
	 * @param   Number  h       The hue
	 * @param   Number  s       The saturation
	 * @param   Number  l       The lightness
	 * @return  Array           The RGB representation
	 */
	function hslToRgb(h, s, l){
		var r, g, b;

		if(s == 0){
			r = g = b = l; // achromatic
		}else{
			function hue2rgb(p, q, t){
				if(t < 0) t += 1;
				if(t > 1) t -= 1;
				if(t < 1/6) return p + (q - p) * 6 * t;
				if(t < 1/2) return q;
				if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
				return p;
			}

			var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			var p = 2 * l - q;
			r = hue2rgb(p, q, h + 1/3);
			g = hue2rgb(p, q, h);
			b = hue2rgb(p, q, h - 1/3);
		}

		return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	}

	// export
	this.Battleship = Battleship;

})(jQuery);