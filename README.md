# Spectrum Graph plugin for FM-DX Webserver

This plugin scans the FM radio band in under 1.5 seconds, then displayed in a spectrum window.

## Requirements:

- FM-DX Webserver v1.3.2
- TEF radio with latest **TEF6686_ESP32** beta firmware (v2.11.8) or
- TEF module with latest **FM-DX-Tuner** firmware
- Modified **datahandler.js** file


* ### Replace _**"/server/datahandler.js"**_ with [this](https://github.com/AmateurAudioDude/FM-DX-Webserver-Plugin-Spectrum-Graph/blob/main/datahandler.js) version.
* (It adds 4 lines of code required for the plugin to function.)


* [Download the latest zip file](https://github.com/AmateurAudioDude/FM-DX-Webserver-Plugin-Spectrum-Graph/archive/refs/heads/main.zip)
* Transfer `SpectrumGraph` folder, and `SpectrumGraph.js` to FM-DX Webserver `plugins` folder
* Restart FM-DX Webserver if required
* Login to Adminstrator Panel and enable plugin
* Server-side configuration is stored in `SpectrumGraph.json`

### BETA version

v1.0.0b8
--------
* Added fixed/dynamic vertical graph button
* Added ability to use mouse scroll wheel to tune
* Fixed tooltip causing scrollbars

v1.0.0b7
--------
* Added user configurable graph smoothing option
* Added retry delay option to configuration
* Added check for update option
* Configured plugin to not open while signal graph is hidden
* Minor visual fixes

v1.0.0b6
--------
* Added configuration file
* Visual improvements and fixes

v1.0.0b5
--------
* Create graph on page load if data exists
* Minor fixes

v1.0.0b4
--------
* Added configurable graph smoothing option
* Fixed slight flicker that might occur

v1.0.0b2
--------
* Graph output fix for TEF radio firmware

v1.0.0b1
--------
* First beta release
