# Spectrum Graph plugin for FM-DX Webserver

This plugin scans the FM radio band in under 1.5 seconds, then displayed in a spectrum window.

![spectrum_graph](https://github.com/user-attachments/assets/e1383c27-2e29-4231-b8d3-a9d70c469944)

## Instructions

* [Download the latest zip file](https://github.com/AmateurAudioDude/FM-DX-Webserver-Plugin-Spectrum-Graph/archive/refs/heads/main.zip)
* Transfer `SpectrumGraph` folder, and `SpectrumGraph.js` to FM-DX Webserver `plugins` folder
* Restart FM-DX Webserver if required
* Login to Adminstrator Panel and enable plugin
* Server-side configuration options stored in `/plugins_configs/SpectrumGraph.json`
* Client-side configuration options located in `SpectrumGraph.js`

### **SpectrumGraph.json configuration**
 
- **`rescanDelay`**: Value in seconds of time elasped since the end of previous scan before a new scan can be requested.   
- **`tuningRange`**: Value in MHz of side frequencies to scan. Value of 0 scans the entire FM/OIRT band.   
- **`tuningStepSize`**: Value in kHz of the tuning stepsize. Recommended values are either 100 or 50.   
- **`tuningBandwidth`**: Values supported: 0, 56, 64, 72, 84, 97, 114, 133, 151, 168, 184, 200, 217, 236, 254, 287, 311.   

> [!IMPORTANT]
> **TEF668X radio** requires the latest **TEF6686_ESP32 v2.11.9 beta** or newer firmware, available from the FMDX.org Discord server.

v1.1.3
------
* Added frequency marker decimal round off setting
* Fixed signal unit not being displayed in some cases
* Minor visual tweaks

v1.1.2
------
* Added bandwidth setting
* Backend TEF module/radio firmware detection for bandwidth setting
* Improved startup antenna sequence
* Minor bug fixes

v1.1.1
------
* Improved handling of incomplete scans
* Minor visual improvements

v1.1.0
------
* Individual band scans stored for each antenna
* Signal unit matches user preference
* Missing options in `SpectrumGraph.json` are automatically added
* Fixed backend code that was sending commands multiple times

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
