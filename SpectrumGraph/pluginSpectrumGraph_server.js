/*
    Spectrum Graph v1.0.0b6 by AAD
    Server-side code
*/

const pluginName = "Spectrum Graph";

// Library imports
const express = require('express');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// File imports
const config = require('./../../config.json');
const { logInfo, logError } = require('../../server/console');
const endpointsDatahandler = require('../../server/datahandler'); // To grab signal strength data

// const variables
const webserverPort = config.webserver.webserverPort || 8080;
const externalWsUrl = `ws://127.0.0.1:${webserverPort}`;

// let variables
let extraSocket, textSocket, textSocketLost, messageParsed, messageParsedTimeout, startTime, tuningLowerLimitScan, tuningUpperLimitScan, tuningLowerLimitOffset, tuningUpperLimitOffset, debounceTimer;
let ipAddress = 'no IP';
let currentFrequency = 0;
let isScanning = false;
let frequencySocket = null;
let sigArray = [];

// Define paths used for config
const rootDir = path.dirname(require.main.filename); // Locate directory where index.js is located
const configFolderPath = path.join(rootDir, 'plugins_configs');
const configFilePath = path.join(configFolderPath, 'SpectrumGraph.json');

// Default configuration
let tuningRange = 0; // MHz
let tuningStepSize = 100; // kHz

const defaultConfig = {
    tuningRange: 0,
    tuningStepSize: 100
};

// Function to ensure the folder and file exist
function checkConfigFile() {
    // Check if the plugins_configs folder exists
    if (!fs.existsSync(configFolderPath)) {
        logInfo(`${pluginName}: Creating plugins_configs folder...`);
        fs.mkdirSync(configFolderPath, { recursive: true }); // Create the folder recursively if needed
    }

    // Check if json file exists
    if (!fs.existsSync(configFilePath)) {
        logInfo(`${pluginName}: Creating default SpectrumGraph.json file...`);
        // Create the JSON file with default content and custom formatting
        const defaultConfig = {
            tuningRange: ['0'],
            tuningStepSize: ['100']
        };

        // Manually format the JSON with the desired structure
        const formattedConfig = `{
    "tuningRange": ${defaultConfig.tuningRange.map(value => `${value}`).join(', ')},
    "tuningStepSize": ${defaultConfig.tuningStepSize.map(value => `${value}`).join(', ')}
}`;

        // Write the formatted JSON to the file
        fs.writeFileSync(configFilePath, formattedConfig);
    }
}

// Call function to ensure folder and file exist
checkConfigFile();

// Function to load the configuration file
function loadConfigFile(isReloaded) {
    try {
        if (fs.existsSync(configFilePath)) {
            const configContent = fs.readFileSync(configFilePath, 'utf-8');
            const config = JSON.parse(configContent);

            // Ensure variables are numbers, else fallback to defaults
            tuningRange = !isNaN(Number(config.tuningRange)) ? Number(config.tuningRange) : defaultConfig.tuningRange;
            tuningStepSize = !isNaN(Number(config.tuningStepSize)) ? Number(config.tuningStepSize) : defaultConfig.tuningStepSize;

            logInfo(`${pluginName}: Configuration ${isReloaded || ''}loaded successfully.`);
        } else {
            logInfo(`${pluginName}: Configuration file not found. Creating default configuration.`);
            saveDefaultConfig();
        }
    } catch (error) {
        logInfo(`${pluginName}: Error loading configuration file: ${error.message}. Resetting to default.`);
        saveDefaultConfig();
    }
}

// Function to save the default configuration file
function saveDefaultConfig() {
    const formattedConfig = JSON.stringify(defaultConfig, null, 4); // Pretty print with 4 spaces
    if (!fs.existsSync(configFolderPath)) {
        fs.mkdirSync(configFolderPath, { recursive: true });
    }
    fs.writeFileSync(configFilePath, formattedConfig);
    loadConfigFile(); // Reload variables
}

// Function to watch the configuration file for changes
function watchConfigFile() {
    fs.watch(configFilePath, (eventType) => {
        if (eventType === 'change') {
            clearTimeout(debounceTimer); // Clear any existing debounce timer
            debounceTimer = setTimeout(() => {
                loadConfigFile('re');
            }, 1000);
        }
    });
}

// Initialize the configuration system
function initConfigSystem() {
    loadConfigFile(); // Load configuration values initially
    watchConfigFile(); // Start watching for changes
    if (tuningRange) {
      logInfo(`${pluginName} configuration: Tuning Range: ${tuningRange} MHz, Tuning Steps: ${tuningStepSize} kHz`);
    } else {
      logInfo(`${pluginName} configuration: Tuning Range: Unlimited MHz, Tuning Steps: ${tuningStepSize} kHz`);
    }
}

// Initialize the configuration system
initConfigSystem();

async function TextWebSocket(messageData) {
    if (!textSocket || textSocket.readyState === WebSocket.CLOSED) {
        try {
            textSocket = new WebSocket(`${externalWsUrl}/text`);

            textSocket.onopen = () => {
                logInfo(`Spectrum Graph connected to WebSocket`);

                textSocket.onmessage = (event) => {
                    try {
                        // Parse the incoming message data
                        const messageData = JSON.parse(event.data);
                        //console.log(messageData);

                        if (!isSerialportAlive || isSerialportRetrying) {
                          if (textSocketLost) {
                            clearTimeout(textSocketLost);
                          }

                          textSocketLost = setTimeout(() => {
                            // WebSocket reconnection required after serialport connection loss
                            logInfo(`Spectrum Graph connection lost, creating new WebSocket.`);
                            if (textSocket) {
                              try {
                                textSocket.close(1000, 'Normal closure');
                              } catch (error) {
                                logInfo(`Spectrum Graph error closing WebSocket:`, error);
                              }
                            }
                            textSocketLost = null;
                          }, 10000);
                        }

                    } catch (error) {
                        logError(`Spectrum Graph failed to parse WebSocket message:`, error);
                    }
                };
            };

            textSocket.onerror = (error) => logError(`Spectrum Graph WebSocket error:`, error);

            textSocket.onclose = () => {
                logInfo(`Spectrum Graph closed WebSocket`);
                setTimeout(() => TextWebSocket(messageData), 1000); // Pass messageData when reconnecting
            };

        } catch (error) {
            logError(`Spectrum Graph failed to set up WebSocket:`, error);
            setTimeout(() => TextWebSocket(messageData), 1000); // Pass messageData when reconnecting
        }
    }
}

async function ExtraWebSocket() {
    if (!extraSocket || extraSocket.readyState === WebSocket.CLOSED) {
        try {
            extraSocket = new WebSocket(`${externalWsUrl}/data_plugins`);

            extraSocket.onopen = () => {
                logInfo(`Spectrum Graph connected to ${externalWsUrl + '/data_plugins'}`);
            };

            extraSocket.onerror = (error) => {
                logError(`Spectrum Graph: WebSocket error:`, error);
            };

            extraSocket.onclose = () => {
                logInfo(`Spectrum Graph WebSocket closed.`);
                setTimeout(ExtraWebSocket, 1000); // Reconnect after delay
            };

            extraSocket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    //logInfo(JSON.stringify(message));

                    // Ignore messages that aren't for spectrum-graph
                    if (!(message.type === 'spectrum-graph') || !(message.value && 'status' in message.value)) return;

                    // Handle messages
                    if (!messageParsedTimeout) {
                      if (message.type === 'spectrum-graph' && message.value?.status === 'scan') {
                          ipAddress = message.value?.ip.slice(0, 64) || 'unknown IP';
                          if (!isScanning) restartScan('scan');
                      } else if (!message.value?.status === 'scan') {
                        logError(`Spectrum Graph unknown command received:`, message);
                      }
                      messageParsedTimeout = true;

                      if (messageParsed) { // Shouldn't be needed as messageParsedTimeout will prevent it running multiple times
                        clearInterval(messageParsed);
                      }
                      messageParsed = setTimeout(() => {
                        if (messageParsed) {
                          clearInterval(messageParsed);
                          messageParsedTimeout = false;
                        }
                      }, 150); // Reduce spamming
                    }
                } catch (error) {
                    logError(`Spectrum Graph: Failed to handle message:`, error);
                }
            };
        } catch (error) {
            logError(`Spectrum Graph: Failed to set up WebSocket:`, error);
            setTimeout(ExtraWebSocket, 1000); // Reconnect on failure
        }
    }
}

ExtraWebSocket();
TextWebSocket();
restartScan('scan'); // First run

function sendCommand(socket, command) {
    //logInfo(`Spectrum Graph send command:`, command);
    socket.send(command);
}

async function sendCommandToClient(command) {
    try {
        // Ensure the TextWebSocket connection is established
        await TextWebSocket();

        if (textSocket && textSocket.readyState === WebSocket.OPEN) {
            //logInfo(`Spectrum Graph: WebSocket connected, sending command`);
            sendCommand(textSocket, command);
        } else {
            logError(`Spectrum Graph: WebSocket is not open. Unable to send command.`);
        }
    } catch (error) {
        logError(`Spectrum Graph: Failed to send command to client:`, error);
    }
}

if (typeof retryFailed === 'undefined') { let retryFailed = 0; } // Custom code

function waitForServer() {
    // Wait for the server to become available
    if (typeof textSocket !== "undefined") {
        textSocket.addEventListener("message", (event) => {
            let parsedData;

            // Parse JSON data and handle errors gracefully
            try {
                parsedData = JSON.parse(event.data);
            } catch (err) {
                // Handle the error
                logError(`Spectrum Graph failed to parse JSON:`, err);
                return;  // Skip further processing if JSON is invalid
            }

            // Check if parsedData contains expected properties
            const freq = parsedData.freq;

            currentFrequency = freq;
        });
    } else {
        if (retryFailed) { 
            logError(`Spectrum Graph: Socket is not defined.`);
        }
        retryFailed++;
        setTimeout(waitForServer, 1000);
    }
}
waitForServer();

function startScan(command) {
    // Begin scan
    endpointsDatahandler.dataToSend.sd = null;

    let tuningLowerLimit = config.webserver.tuningLowerLimit;
    let tuningUpperLimit = config.webserver.tuningUpperLimit;
    let tuningLimit = config.webserver.tuningLimit;

    if (isNaN(currentFrequency) || currentFrequency === 0.0) {
        currentFrequency = tuningLowerLimit;
    }

    stopScanning(false);
    if (textSocket) {
      tuningLowerLimitScan = Math.round(tuningLowerLimit * 1000);
      tuningUpperLimitScan = Math.round(tuningUpperLimit * 1000);

      if (tuningRange) {
          tuningLowerLimitScan = (currentFrequency * 1000) - (tuningRange * 1000);
          tuningUpperLimitScan = (currentFrequency * 1000) + (tuningRange * 1000);
      }

      if (tuningUpperLimitScan > (tuningUpperLimit * 1000)) tuningUpperLimitScan = (tuningUpperLimit * 1000);
      if (tuningLowerLimitScan < (tuningLowerLimit * 1000)) tuningLowerLimitScan = (tuningLowerLimit * 1000);

      // Handle limitations
      if (tuningLowerLimitScan < 0.144) tuningLowerLimitScan = 0.144;
      if (tuningLowerLimitScan > 27000 && tuningLowerLimitScan < 64000) tuningLowerLimitScan = 64000;
      if (tuningLowerLimitScan < 64000) tuningLowerLimitScan = 64000; // Doesn't like scanning HF frequencies

      // Keep tuning range consistent for restricted tuning range setting
      if (tuningRange) {
          tuningLowerLimitOffset = (tuningRange * 1000) - (tuningUpperLimitScan - (currentFrequency * 1000));
          tuningUpperLimitOffset = (tuningLowerLimitScan - (currentFrequency * 1000)) + (tuningRange * 1000);
      } else {
          tuningLowerLimitOffset = 0;
          tuningUpperLimitOffset = 0;
      }

      // Limit scan to either 64-88 MHz or 88-108 MHz 
      if ((currentFrequency * 1000) < 86000 && tuningUpperLimitScan > 88000) tuningUpperLimitScan = 88000;
      if ((currentFrequency * 1000) >= 86000 && tuningLowerLimitScan < 86000) tuningLowerLimitScan = 86000;

      // The magic happens here
      sendCommandToClient(`Sa${tuningLowerLimitScan - tuningLowerLimitOffset}`);
      sendCommandToClient(`Sb${tuningUpperLimitScan + tuningUpperLimitOffset}`);
      sendCommandToClient(`Sc${tuningStepSize}`);
      sendCommandToClient(`S`);
    }
    logInfo(`Spectrum Graph: Spectral commands sent (IP: ${ipAddress})...`);

    // Wait for sd value using async
    async function waitForSdValue(timeout = 30000, interval = 40) {
        startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            let sdValue = endpointsDatahandler.dataToSend.sd;

            if (sdValue !== null && sdValue !== undefined) {
                return sdValue; // Return when data is fetched
            }

            await new Promise(resolve => setTimeout(resolve, interval)); // Wait for the next check
        }

        throw new Error(`Spectrum Graph timed out`); // Throw error if timeout is reached
    }

    (async () => {
        try {
            let sdValue = await waitForSdValue();

            // Remove trailing comma and space in TEF radio firmware
            if (sdValue && sdValue.endsWith(', ')) {
                sdValue = sdValue.slice(0, -2);
            }

            // Possibly interrupted
            if (sdValue && sdValue.endsWith(',')) {
                stopScanning(false);
                sdValue = null;
            }
            //console.log(sdValue);

            logInfo(`Spectrum Graph: Spectrum scan (${(tuningLowerLimitScan / 1000)} - ${(tuningUpperLimitScan / 1000)} MHz) complete in ${Date.now() - startTime}ms.`);

            // Split the response into pairs and process each one
            sigArray = sdValue.split(',').map(pair => {
                const [freq, sig] = pair.split('=');
                return { freq: (freq / 1000).toFixed(2), sig: parseFloat(sig).toFixed(1) };
            });

            startTime = null;
            stopScanning(true);
            //console.log(sigArray);

            const messageClient = JSON.stringify({
              type: 'sigArray',
              value: sigArray
            });
            extraSocket.send(messageClient);
        } catch (error) {
            logError(`Spectrum Graph failed to get 'dataToSend.sd' value, error:`, error.message);
            stopScanning(true);
        }
    })();
}

function stopScanning(status) {
  if (status) {
    isScanning = false;
  } else {
    isScanning = true;
  }
}

function restartScan(command) {
    // Restart scan
    sigArray = [];
    sdValue = null;
    if (!isScanning) setTimeout(() => startScan(command), 40);
}
