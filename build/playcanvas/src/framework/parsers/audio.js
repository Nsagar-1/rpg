import { path } from "../../core/path.js";
import { Http } from "../../platform/net/http.js";
import { Sound } from "../../platform/sound/sound.js";
const supportedExtensions = [
	".ogg",
	".mp3",
	".wav",
	".mp4a",
	".m4a",
	".mp4",
	".aac",
	".opus"
];
class AudioParser {
	canParse() {
		return true;
	}
	load(url, callback, asset) {
		const original = typeof url === "string" ? url : url.original;
		const success = function(resource) {
			callback(null, new Sound(resource));
		};
		const error = function(err) {
			let msg = `Error loading audio url: ${original}`;
			if (err) {
				msg += `: ${err.message || err}`;
			}
			console.warn(msg);
			callback(msg);
		};
		if (!this._isSupported(original)) {
			error(`Audio format for ${original} not supported`);
			return;
		}
		const manager = this.handler.manager;
		if (!manager?.context) {
			error("Audio manager has no audio context");
			return;
		}
		this.handler.fetch(url, Http.ResponseType.ARRAY_BUFFER, (err, response) => {
			if (err) {
				error(err);
				return;
			}
			manager.context.decodeAudioData(response, success, error);
		}, asset);
	}
	_isSupported(url) {
		const ext = path.getExtension(url).toLowerCase();
		return supportedExtensions.indexOf(ext) > -1;
	}
}
export {
	AudioParser
};
