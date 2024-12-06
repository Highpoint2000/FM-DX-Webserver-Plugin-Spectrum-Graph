# Spectrum Graph plugin for FM-DX Webserver

This plugin scans the FM radio band in under 1.5 seconds, then displayed in a spectrum window.

## Requirements:

- TEF radio with latest **TEF6686_ESP32** beta firmware (v2.11.8) available from the FMDX.org Discord server   
or
- TEF module with latest **FM-DX-Tuner** firmware by PE5PVB

---

* [Download the latest zip file](https://github.com/AmateurAudioDude/FM-DX-Webserver-Plugin-Spectrum-Graph/archive/refs/heads/main.zip)
* Transfer `SpectrumGraph` folder, and `SpectrumGraph.js` to FM-DX Webserver `plugins` folder
* Restart FM-DX Webserver if required
* Login to Adminstrator Panel and enable plugin
* Server-side configuration is stored in `SpectrumGraph.json`

v1.0.0
------
* Official release

<details>
  <summary>BETA history</summary>

v1.0.0b10
------
* Added tooltips
* Backend code improvements

v1.0.0b9
--------
* Fixed webpage movement while using mouse scroll wheel
* Fixed tooltip element alignment

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
* Fixed slight flicker that might occur

v1.0.0b3
--------
* Added configurable graph smoothing option

v1.0.0b2
--------
* Graph output fix for TEF radio firmware

v1.0.0b1
--------
* First beta release

</details>
