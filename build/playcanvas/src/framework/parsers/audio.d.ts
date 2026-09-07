/**
 * Parser for audio resources. Fetches the audio data and decodes it into a {@link Sound} using
 * the Web Audio context of the sound manager.
 *
 * @ignore
 */
export class AudioParser {
    canParse(): boolean;
    load(url: any, callback: any, asset: any): void;
    _isSupported(url: any): boolean;
}
