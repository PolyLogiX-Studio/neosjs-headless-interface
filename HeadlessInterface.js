/**
 * @fileoverview Neos.js Plugin - HeadlessInterface
 * @name neosjs-headless-interface
 * @author Bitman
 * @returns {HeadlessInterface}
 * @see Parent Library: [Neos.js](https://github.com/PolyLogiX-Studio/Neos.js#readme)
 */

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
			Starting: true,
			CompatibilityHash: null,
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
				this.NeosVR = require("child_process").spawn(
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
				);
			} else {
				//Linux requires Mono
				this.NeosVR = require("child_process").spawn(
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
				);
			}
		} else {
			this.NeosVR = headlessPath;
		}
		this.Queue = new CommandQueue(this);
		this.InternalEvents = new EventEmitter();
		this.InternalEvents.setMaxListeners(1);
		this.NeosVR.stdout.on("data", (data) => {
			var message = data.toString();
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
						this.emit("ready", sessionId);
					});
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
	 * Can the headless client send another command right now?
	 * @readonly
	 * @instance
	 * @memberof HeadlessInterface
	 * @since 1.0.0
	 */
	get CanSend() {
		return this.InternalEvents._events.HeadlessResponse == null;
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
	 * @instance
	 * @param {String} text
	 * @returns {Promise<String>}
	 * @since 1.0.0
	 * @version 2.0.0
	 */
	RunCommand(text) {
		if (this.InternalEvents._events.HeadlessResponse) {
			//TODO Race Conditions! Add Queue, Currently limited to 1 response at a time. System might need to be complex
			this.emit(
				"error",
				"Tried Calling .Send while another command was processing, This Error is to prevent a Race Condition"
			);
			return new Promise((resolve) => {
				resolve("Error, Command Not Sent. Race Condition");
			});
		}
		let response = new Promise((Resolve) =>
			this.InternalEvents.on("HeadlessResponse", function (data) {
				if (!data.endsWith(">")) {
					// Filter out Input text and wait for proper response
					//TODO Add Timeout
					console.log(data);
					this.removeListener(
						"HeadlessResponse",
						this._events.HeadlessResponse
					);
					Resolve(data);
				}
			})
		);
		this.NeosVR.stdin.write(text + "\n");
		return response;
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
/**
 *
 * @private
 * @class CommandQueue
 */
class CommandQueue {
	constructor(HeadlessInterface) {
		this.HeadlessInterface = HeadlessInterface;
		this.Queue = [];
		this.Promises = [];
		this.InternalClock = null; //TODO internal timer
	}
	/*
	Add(Command) {
		var context = this; //Passing into ES6

		return new Promise();
	}
	*/
}
module.exports = { HeadlessInterface };
