function DiskStation(logging) {
	var loggedIn = false;
	var ds = this;

	var baseUrl;
	var useSsl = true;

	this.onError;
	this.onAuthenticated;
	this.onDownloadTasksUpdated;
	this.onDownloadTasksAdded;
	this.onDownloadTasksCompleted;

	var updateTimer;
	var downloadInfo = null;


	var timeoutSteps = [
		5*1000,			// [0] 5 seconds
		10*1000,		// [1] 10 seconds
		15*1000,		// [2] 15 seconds
		30*1000,		// [3] 30 seconds
		60*1000,		// [4] 1 minute
		120*1000,		// [5] 2 minutes
		300*1000 ];		// [6] 5 minutes
	var currentRefreshTimeOut = 3;

	/* private */
	function writelog(message, cat) {
		if (logging)
		{
			if (!cat)
				cat = "DS";

			console.log("[" + cat + "] " + message);
		}
	}

	function loginFailed(message) {
		loggedIn = false;
		ds.onError(message);
	}

	function loginSuccess() {
		loggedIn = true;
		ds.onAuthenticated();
		updateDownloadTasks();
	}

	function updateDownloadTasks() {
		var url = baseUrl + '/download/downloadman.cgi?action=getall&start=0&limit=100';

		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function(req) {
			if ((xhr.readyState == 4)) {
				if (xhr.status == 200 || !xhr.status) {
					var result = JSON.parse(xhr.responseText);

					var totalPending = 0;
					var totalBusy = 0;
					var totalComplete = 0;
					var totalError = 0;

					var newTasks = [];
					var completedTasks = [];
					for(var i=0;i<result.total;i++)
					{
						if (!taskExists(result.items[i].task_id)) {
							newTasks.push(result.items[i]);
						}
						switch (result.items[i].status)
						{
							case 'TASK_FINISHED':
								totalComplete++;
								var old = findTask(result.items[i].task_id);
								if ((old == null) || (old.status != 'TASK_FINISHED')) {
									completedTasks.push(result.items[i]);
								}
								break;
							case 'TASK_SEEDING':
								totalComplete++;
								break;
							case 'TASK_ERROR':
							case 'TASK_ERROR_BROKEN_LINK':
							case 'TASK_ERROR_DEST_DENY':
							case 'TASK_ERROR_DEST_NOT_EXISTS':
							case 'TASK_ERROR_DISK_FULL':
							case 'TASK_ERROR_TIMEOUT':
							case 'TASK_ERROR_QUOTA_REACHED':
								totalError++;
								break;
							case 'TASK_DOWNLOADING':
							case 'TASK_FINISHING':
							case 'TASK_HASH_CHECKING':
							case 'TASK_PRESEEDING':
								totalBusy++;
							case 'TASK_PAUSED':
							case 'TASK_WAITING':
								totalPending++;
						}
					}

					result.totalPending = totalPending;
					result.totalBusy = totalBusy;
					result.totalComplete = totalComplete;
					result.totalError = totalError;

					var first = (downloadInfo == null);

					downloadInfo = result;
					ds.onDownloadTasksUpdated(downloadInfo);

					if (!first)
					{
						if (newTasks.length > 0) {
							ds.onDownloadTasksAdded(newTasks);
						}
						
						if (completedTasks.length > 0) {
							ds.onDownloadTasksAdded(completedTasks);
						}						
					}

					var ms = timeoutSteps[currentRefreshTimeOut];
					writelog("Queing for " + (ms/1000) + "s (step = " + currentRefreshTimeOut + ")");
					window.setTimeout(function() { updateDownloadTasks() }, ms);

					if ((totalBusy == 0) && (currentRefreshTimeOut < (timeoutSteps.length - 1))) {
						currentRefreshTimeOut++;
					} else if (currentRefreshTimeOut < 3) {
						currentRefreshTimeOut++;
					}
				} else {
					writelog('Status = ' + xhr.status, "XHR");
				}
			}
		};
		xhr.open("GET", url);
		xhr.send();
		writelog(url, "XHR");
	}

	function findTask(task_id) {
		if (downloadInfo == undefined)
			return null;

		for(var i=0;i<downloadInfo.items.length;i++) {
			if (downloadInfo.items[i].task_id == task_id)
				return downloadInfo.items[i];
		}
		return null;
	}

	function taskExists(task_id) {
		return findTask(task_id) != null;
	}

	/* public */
	this.IsLoggedIn = function() {
		return loggedIn;
	}

	this.getBaseUrl = function() {
		return baseUrl;
	}

	this.login = function(address, username, password, ssl) {
		writelog("logging in on " + address + " as " + username + (ssl ? ' (secure)' : ''));

		useSsl = ssl;
		baseUrl = ((useSsl) ? 'https' : 'http') + '://' + address;

		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function(req) {
			if (xhr.readyState == 4) {
				if (xhr.status == 200 || !xhr.status)
				{
					
					if (!xhr.responseText) {
						console.log(xhr);
						writelog("no responseText", "XHR");
						loginFailed("Could not retreive server data");
						return;
					}

					//var login = JSON.Parse('(' + xhr.responseText + ')');
					var login = JSON.parse(xhr.responseText);

					if (!login) {
						loginFailed("Server returned invalid data");
						return;
					}

					if ("error" == login.result) {
						switch (login.reason) {
						case 'error_guest':
							loginFailed('Cannot login as guest. Please use another account to login.');
							break;
						case 'error_cantlogin':
							loginFailed('The account or password is invalid. Please try again.');
							break;
						case 'error_nologin_nopasswd':
							loginFailed('error_nologin_nopasswd');
							break;
						case 'error_expired':
							loginFailed('Your account has been disabled. Please contact the administrator.');
							break;
						case 'error_noprivilege':
							loginFailed('You are not authorized to use this service.');
							break;
						case 'error_systemfull':
							loginFailed('You cannot login to the system because the disk space is full currently. Please restart the system and try again.');
							break;
						default:
							loginFailed('Cannot login');
						}
						return;
					}

					loginSuccess();

				} else {
					writelog('Status = ' + xhr.status, "XHR");
				}
			} else {
				writelog('Readystate = ' + xhr.readyState, "XHR");
			}
		}
		xhr.onerror = function(error) {
			console.log(error, "XHR");
			loginFailed("Could not connect to server");
		}
 //*** var requestTimer = setTimeout(function() {
       //xhReq.abort();
       //// Handle timeout situation, e.g. Retry or inform user.
     //}, MAXIMUM_WAITING_TIME); ***

		var params = "username="+encodeURIComponent(username)+"&passwd="+encodeURIComponent(password);
		var url = baseUrl + '/webman/login.cgi';
		xhr.open("POST", url);
		xhr.send(params);
		writelog(url, "XHR");
	}

	this.getDownloadInfo = function() {
		return downloadInfo;
	}

	this.logout = function() {
		var url = baseUrl + '/webman/modules/logout.cgi';
		xhr.open("POST", url);
		xhr.send();
		writelog(url, "XHR");
		loginFailed("Succesfully logged out");
	}

	this.addTask = function(task_url) {
		currentRefreshTimeOut=0;
		var url = baseUrl + '/download/downloadman.cgi';
		var params = "action=createurl&upload_type=url&field=task_id&direction=ASC&url="+encodeURIComponent(task_url);
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function(req) {
			if ((xhr.readyState == 4)) {
				if (xhr.status == 200 || !xhr.status) {
					var result = JSON.parse(xhr.responseText);
					if (!result.success) {
						writelog('Could not add task! (' + task_url + ')');
						console.log(result);
					} else {
						updateDownloadTasks();
					}
				} else {
					writelog('Status = ' + xhr.status, "XHR");
				}
			}
		};
		xhr.open("POST", url);
		xhr.send(params);
		writelog(url, "XHR");
	}

	writelog("constructed");
}

/*_s.download['download_task_broken_link']='Broken Link';
_s.download['download_task_dest_deny']='Shared folder access denied.';
_s.download['download_task_dest_not_exist']='Shared folder not found.';
_s.download['download_task_disk_full']='Disk is full';
_s.download['download_task_downloading']='Downloading';
_s.download['download_task_error']='Error';
_s.download['download_task_finished']='Completed';
_s.download['download_task_finishing']='Finishing';
_s.download['download_task_hash_checking']='Checking';
_s.download['download_task_paused']='Paused';
_s.download['download_task_preseeding']='Prepare seeding';
_s.download['download_task_quota_reached']='Quota reached.';
_s.download['download_task_seeding']='Seeding';
_s.download['download_task_timeout']='Connection Timeout';
_s.download['download_task_waiting']='Waiting';						*/