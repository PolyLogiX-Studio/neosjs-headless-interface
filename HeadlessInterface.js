/**
 * @fileoverview Neos.js Plugin - HeadlessInterface
 * @name neosjs-headless-interface
 * @author Bitman
 * @returns {HeadlessInterface}
 * @see Parent Library: [Neos.js](https://github.com/PolyLogiX-Studio/Neos.js#readme)
 */
const util = require("util");
const { EventEmitter } = require("events");
const path = require("path");
//const fs = require("fs");
//const { v4: uuid } = require("uuid");
/**
 *
 * @class HeadlessInterface
 * @extends {EventEmitter}
 */
class HeadlessInterface extends EventEmitter {
	/**
	 *
	 * @param {String | 'child_process'} headlessPath
	 * @param {String} [configPathRelative]
	 * @param {{SafeReady:1000, Events: false, sessionIdAttempts:15}} [options]
	 * @example const { HeadlessInterface } = require("neosjs-headless-interface");
	 * const NeosVR = new HeadlessInterface()
	 * NeosVR.on("ready", ()=>{
	 * 	NeosVR.Send("invite bombitmanbomb").then((Response)=>console.log(Response)) // "Invite Sent!"
	 * })
	 */
	constructor(headlessPath, configPathRelative, options) {
		super();
		this.State = {
			Running: false,
			Ready: false,
			Starting: true,
			CompatibilityHash: null,
			MachineID: null,
			log: false,
			logMsg: 0,
			sessionId: null,
			sessionIdAttempts: 0,
		};
		this.Options = options || {};
		if (this.Options.SafeReady == null) this.Options.SafeReady = 1000;
		if (this.Options.Events == null) this.Options.Events = false;
		if (this.Options.sessionIdAttempts == null)
			this.Options.sessionIdAttempts = 15;
		if (typeof headlessPath == "string") {
			if (process.platform === "win32") {
				//Windows
				Object.defineProperty(this, "NeosVR", {
					value: require("child_process").spawn(
						path.join(headlessPath, "Neos.exe"),
						[
							"--config",
							configPathRelative
								? configPathRelative
								: path.join(headlessPath, "Config/Config.json"),
						],
						{
							windowsHide: false,
							cwd: headlessPath /* Folder to Neos Headless For Binaries*/,
						}
					),
					enumerable: false,
				});
			} else {
				//Linux requires Mono
				Object.defineProperty(this, "NeosVR", {
					value: require("child_process").spawn(
						"mono",
						[
							path.join(headlessPath, "Neos.exe"),
							"--config",
							configPathRelative
								? configPathRelative
								: path.join(headlessPath, "/Config/Config.json"),
						],
						{
							windowsHide: true,
							cwd: headlessPath /* Folder to Neos Headless For Binaries*/,
						}
					),
					enumerable: false,
				});
			}
		} else {
			Object.defineProperty(this, "NeosVR", {
				value: headlessPath,
				enumerable: false,
			});
		}
		Object.defineProperty(this, "Queue", { value: [], enumerable: false });
		Object.defineProperty(this, "CommandRunning", {
			value: false,
			enumerable: false,
			writable: true,
		});
		Object.defineProperty(this, "InternalEvents", {
			value: new EventEmitter(),
			enumerable: false,
		});
		this.InternalEvents.setMaxListeners(1);
		this.InternalEvents.on("HeadlessResponse", (message) => {
			if (this.Queue.length > 0) {
				let Command = this.Queue.shift();
				Command.Resolve(message);
				this.CommandRunning = false;
				this.RunQueue();
			}
		});
		this.NeosVR.stdout.on("data", (data) => {
			var message = data.toString();
			message = message.replace(/\r\n/g, "");
			if (message.trim().endsWith(">")) return; //Ignore Input message
			if (!this.State.Ready) {
				if (message.startsWith("Compatibility Hash: ")) {
					this.State.CompatibilityHash = message.substring(
						"Compatibility Hash: ".length
					);
				}
				if (message.startsWith("MachineID: ")) {
					this.State.MachineID = message.substring("MachineID: ".length);
				}
				if (message.startsWith("World running...")) {
					this.State.Starting = false;
					if (!this.State.Running) {
						this.State.Running = true;
						this.sessionId.then((sessionId) => {
							/**
							 * Fires when the headless client is Ready
							 * @event HeadlessInterface#ready
							 * @type {String} SessionId
							 * @property {String} sessionId SessionId of the started world
							 * @memberof HeadlessInterface
							 */
							this.State.Ready = true;
							this.emit("ready", sessionId);
						});
					}
				}
			}
			this.InternalEvents.emit("HeadlessResponse", message);
			/**
			 * @event HeadlessInterface#message
			 * @type {String}
			 * @property {String} message Output from NeosClient
			 * @memberof HeadlessInterface
			 */
			this.emit("message", message);
		});
	}

	/**
	 * Send a command to the Headless Client
	 * @instance
	 * @param {String} text
	 * @returns {Promise<String>}
	 * @since 1.0.0
	 * @version 2.0.0
	 * @async
	 */
	RunCommand(text) {
		return this.AddQueue(text);
	}
	/**
	 * Enter Async Extended Logging Mode
	 * Use .on("message", ()=>{}) to get outputs.
	 * Commands can not run properly while in logging mode. (Yet)
	 * @see HeadlessInterface#message
	 * @instance
	 * @since 2.2.0
	 * @returns {Promise<String>}
	 * @memberof HeadlessInterface
	 * @async
	 */
	StartLog() {
		return this.RunCommand("log");
	}
	/**
	 * Exit Async Logging Mode
	 * @instance
	 * @since 2.2.0
	 * @returns {Promise<String>}
	 * @memberof HeadlessInterface
	 * @async
	 */
	ExitLog() {
		return this.RunCommand("");
	}
	/**
	 * Add event to queue
	 * @returns {Promise<String>}
	 * @private
	 * @param {string} cmd
	 * @memberof HeadlessInterface
	 */
	AddQueue(Cmd) {
		let response = new Promise((Resolve) => {
			this.Queue.push({ Cmd, Resolve });
			this.RunQueue();
		});
		return response;
	}
	/**
	 * Run the event queue
	 * @private
	 * @memberof HeadlessInterface
	 */
	RunQueue() {
		if (this.CommandRunning) return; // Command In Progress
		if (this.Queue.length == 0) return; // No Commands Queued
		this.CommandRunning = true;
		let Command = this.Queue[0];
		this.NeosVR.stdin.write(Command.Cmd + "\n");
	}
	/**
	 * Can the headless client send another command right now?
	 * @readonly
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 1.0.0
	 * @deprecated 2.1.0
	 */
	get CanSend() {
		return !this.CommandRunning;
	}

	/**
	 * Get the Headless Client SessionId
	 *
	 * @readonly
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 1.0.0
	 * @version 2.0.0
	 */
	get sessionId() {
		if (this.State.sessionId) return this.State.sessionId;
		else
			return this.RunCommand("sessionId").then((sessionId) => {
				if (
					sessionId != null &&
					typeof sessionId === "string" &&
					sessionId.startsWith("S-")
				) {
					this.State.sessionId = sessionId;
					return sessionId;
				} else {
					this.State.sessionIdAttempts++;
					if (this.State.sessionIdAttempts > this.Options.SessionIdAttempts) {
						this.emit("error", "Coult not retrieve sessionId");
						this.State.sessionIdAttempts = 0;
						return null;
					}
					return this.sessionId; // Try Again
				}
			});
	}

	/**
	 *End the Process
	 * @instance
	 * @returns
	 * @memberof HeadlessInterface
	 * @since 1.0.0
	 */
	Kill() {
		return this.NeosVR.kill(0);
	}
	/**
	 * Send a command to the Headless Client
	 * @deprecated since 2.0.1, Removing 2.2.0
	 * @instance
	 * @param {String} text
	 * @returns {Promise<String>}
	 * @memberof HeadlessInterface
	 */
	Run(text) {
		let run = util.deprecate(
			(text) => this.RunCommand(text),
			"Run() is Depricated, Use RunCommand()."
		);
		return run(text);
	}
	/**
	 * Login to an account
	 * @param {String} user Username or Email
	 * @param {String} password Password
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Login(user, password) {
		return this.RunCommand(`login "${user}" "${password}"`);
	}
	/**
	 * Send a message!
	 * @instance
	 * @param {String} user Username to send message to
	 * @param {String} message Message
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Message(user, message) {
		return this.RunCommand(`message "${user}" "${message}"`);
	}
	/**
	 * Invite a user to the server
	 * @param {String} user Username
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Invite(user) {
		return this.RunCommand(`invite "${user}"`);
	}
	/**
	 * List all incoming friend requests
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	FriendRequests() {
		return this.RunCommand("friendRequests");
	}
	/**
	 * Accept a friend request
	 * @param {String} user Username
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	AcceptFriendRequest(user) {
		return this.RunCommand(`acceptFriendRequest "${user}"`);
	}
	/**
	 * List all active worlds
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Worlds() {
		return this.RunCommand("worlds");
	}
	/**
	 * Focus world
	 * @param {Number | String} world world name or number
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Focus(world) {
		return this.RunCommand(
			`focus ${typeof world === "number" ? world : "\"" + world + "\""}`
		);
	}
	/**
	 * Start a world with a url
	 * @param {String} record World Record URL
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	StartWorldURL(record) {
		return this.RunCommand(`startWorldURL "${record}"`);
	}
	/**
	 * Start a new world from template
	 * @param {String} template template
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	StartWorldTemplate(template) {
		return this.RunCommand(`startWorldTemplate ${template}`);
	}
	/**
	 * Show the status of the current world
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Status() {
		return this.RunCommand("status");
	}
	/**
	 * Get the URL of the current session
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	SessionURL() {
		return this.RunCommand("sessionURL");
	}
	/**
	 * Get the ID of the current session
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	SessionID() {
		return this.RunCommand("sessionID");
	}
	/**
	 * Lists all users in the world
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Users() {
		return this.RunCommand("users");
	}
	/**
	 * Close the currently focused world
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Close() {
		return this.RunCommand("close");
	}
	/**
	 * Save the currently focused world
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Save() {
		return this.RunCommand("save");
	}
	/**
	 * Restart the current world
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Restart() {
		return this.RunCommand("restart");
	}
	/**
	 * Kick the given user from the session
	 * @instance
	 * @param {String} user Username
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Kick(user) {
		return this.RunCommand(`kick "${user}"`);
	}
	/**
	 * Silence the given user
	 * @instance
	 * @memberof HeadlessInterface
	 *  @param {String} user Username
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Silence(user) {
		return this.RunCommand(`silence "${user}"`);
	}
	/**
	 * Remove silence from the given user
	 * @instance
	 * @memberof HeadlessInterface
	 *  @param {String} user Username
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Unsilence(user) {
		return this.RunCommand(`unsilence "${user}"`);
	}
	/**
	 * Ban the given user
	 * @instance
	 * @memberof HeadlessInterface
	 * @param {String} user Username
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Ban(user) {
		return this.RunCommand(`ban "${user}"`);
	}
	/**
	 * Unban the given user
	 * @instance
	 * @memberof HeadlessInterface
	 * @param {String} user Username
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Unban(user) {
		return this.RunCommand(`unban "${user}"`);
	}
	/**
	 * Respawn the given user
	 * @instance
	 * @memberof HeadlessInterface
	 * @param {String} user Username
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Respawn(user) {
		return this.RunCommand(`respawn "${user}"`);
	}
	/**
	 * Assign a role to the given user
	 * @instance
	 * @memberof HeadlessInterface
	 * @param {String} user Username
	 * @param {String} role UserRole
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	Role(user, role) {
		return this.RunCommand(`role "${user}" "${role}"`);
	}
	/**
	 * Set a new world access level
	 * @instance
	 * @memberof HeadlessInterface
	 * @param {String} accessLevel accessLevel
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	AccessLevel(accessLevel) {
		return this.RunCommand(`accessLevel "${accessLevel}"`);
	}
	/**
	 * Forces a full garbage collection
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	GC() {
		return this.RunCommand("gc");
	}
	/**
	 * Saves the current settings into the original config file
	 * Usage: SaveConfig(filename) (optional, will save in place without)
	 * @param {String} [filename]
	 * @memberof HeadlessInterface
	 * @instance
	 * @since 2.0.0
	 * @returns {Promise<String>}
	 */
	SaveConfig(filename) {
		return this.RunCommand(`saveConfig${filename ? " " + filename : ""}`);
	}
}
module.exports = { HeadlessInterface };
