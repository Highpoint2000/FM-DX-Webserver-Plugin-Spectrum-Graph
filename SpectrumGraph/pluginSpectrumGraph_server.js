/*
    Spectrum Graph v1.1.0 by AAD
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
const datahandlerReceived = require('../../server/datahandler'); // To grab signal strength data

// const variables
const webserverPort = config.webserver.webserverPort || 8080;
const externalWsUrl = `ws://127.0.0.1:${webserverPort}`;

// let variables
let extraSocket, textSocket, textSocketLost, messageParsed, messageParsedTimeout, startTime, tuningLowerLimitScan, tuningUpperLimitScan, tuningLowerLimitOffset, tuningUpperLimitOffset, debounceTimer;
let ipAddress = 'none';
let currentFrequency = 0;
let lastRestartTime = 0;
let isScanning = false;
let frequencySocket = null;
let sigArray = [];

// Define paths used for config
const rootDir = path.dirname(require.main.filename); // Locate directory where index.js is located
const configFolderPath = path.join(rootDir, 'plugins_configs');
const configFilePath = path.join(configFolderPath, 'SpectrumGraph.json');

// Default configuration
let retryDelay = 10; // seconds
let tuningRange = 0; // MHz
let tuningStepSize = 100; // kHz

const defaultConfig = {
    retryDelay: 10,
    tuningRange: 0,
    tuningStepSize: 100
};

// Order of keys in configuration file
const configKeyOrder = ['retryDelay', 'tuningRange', 'tuningStepSize'];

// Function to ensure the folder and file exist
function checkConfigFile() {
    // Check if plugins_configs folder exists
    if (!fs.existsSync(configFolderPath)) {
        logInfo(`${pluginName}: Creating plugins_configs folder...`);
        fs.mkdirSync(configFolderPath, { recursive: true }); // Create the folder recursively if needed
    }

    // Check if json file exists
    if (!fs.existsSync(configFilePath)) {
        logInfo(`${pluginName}: Creating default SpectrumGraph.json file...`);
        saveDefaultConfig(); // Save default configuration
    }
}

// Call function to ensure folder and file exist
checkConfigFile();

// Function to load the configuration file
function loadConfigFile(isReloaded) {
    try {
        if (fs.existsSync(configFilePath)) {
            const configContent = fs.readFileSync(configFilePath, 'utf-8');
            let config = JSON.parse(configContent);

            let configModified = false;

            // Check and add missing options with default values
            for (let key in defaultConfig) {
                if (!(key in config)) {
                    logInfo(`${pluginName}: Missing ${key} in config. Adding default value.`);
                    config[key] = defaultConfig[key]; // Add missing keys with default value
                    configModified = true; // Mark as modified
                }
            }

            // Ensure variables are numbers, else fallback to defaults
            retryDelay = !isNaN(Number(config.retryDelay)) ? Number(config.retryDelay) : defaultConfig.retryDelay;
            tuningRange = !isNaN(Number(config.tuningRange)) ? Number(config.tuningRange) : defaultConfig.tuningRange;
            tuningStepSize = !isNaN(Number(config.tuningStepSize)) ? Number(config.tuningStepSize) : defaultConfig.tuningStepSize;

            // Save the updated config if there were any modifications
            if (configModified) {
                saveUpdatedConfig(config);
            }

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

// Function to save updated configuration after modification
function saveUpdatedConfig(config) {
    // Create a new object with keys in the specified order
    const orderedConfig = {};
    configKeyOrder.forEach(key => {
        if (key in config) {
            orderedConfig[key] = config[key];
        }
    });

    const formattedConfig = JSON.stringify(orderedConfig, null, 4); // Pretty print with 4 spaces
    fs.writeFileSync(configFilePath, formattedConfig); // Save updated config to file
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

// Initialise the configuration system
function initConfigSystem() {
    loadConfigFile(); // Load configuration values initially
    watchConfigFile(); // Start watching for changes
    if (tuningRange) {
      logInfo(`${pluginName} configuration: Retry Delay: ${retryDelay} seconds, Tuning Range: ${tuningRange} MHz, Tuning Steps: ${tuningStepSize} kHz`);
    } else {
      logInfo(`${pluginName} configuration: Retry Delay: ${retryDelay} seconds, Tuning Range: Unlimited MHz, Tuning Steps: ${tuningStepSize} kHz`);
    }
}

// Initialise the configuration system
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

// ************************************* datahandler code
// Intercepted U and Z data storage
let interceptedUData = null;
let interceptedZData = null;

// Wrapper to intercept 'U' data
const originalHandleData = datahandlerReceived.handleData;

datahandlerReceived.handleData = function (wss, receivedData, rdsWss) {
    const receivedLines = receivedData.split('\n');

    for (const receivedLine of receivedLines) {
        if (receivedLine.startsWith('U')) {
            interceptedUData = receivedLine.substring(1); // Store 'U' data
            datahandlerReceived.dataToSend.sd = interceptedUData; // Update dataToSend.sd
            if (antennaSwitch) datahandlerReceived.dataToSend[`sd${antennaCurrent}`] = interceptedUData; // Update sd0, sd1, sd2, sd3
            break;
        }
        if (receivedLine.startsWith('Z')) {
            interceptedZData = receivedLine.substring(1); // Store 'Z' data
            datahandlerReceived.dataToSend.ad = interceptedZData; // Update dataToSend.ad
            if (antennaSwitch) antennaCurrent = Number(interceptedZData);

            let uValueNew = null;
            
            if (antennaSwitch && datahandlerReceived.dataToSend[`sd${antennaCurrent}`]) uValueNew = datahandlerReceived.dataToSend[`sd${antennaCurrent}`];
            
            if (uValueNew !== null) {
                let uValue = uValueNew;

                // Remove trailing comma and space in TEF radio firmware
                if (uValue && uValue.endsWith(', ')) {
                    uValue = uValue.slice(0, -2);
                }

                // Possibly interrupted
                if (uValue && uValue.endsWith(',')) {
                    stopScanning(false);
                    uValue = null;
                }

                if (uValue !== null) { // Ensure uValue is not null before splitting
                    //logInfo(`Spectrum Graph: Spectrum scan (${(tuningLowerLimitScan / 1000)}-${(tuningUpperLimitScan / 1000)} MHz) complete for Ant${antennaCurrent}.`);

                    // Split the response into pairs and process each one
                    sigArray = uValue.split(',').map(pair => {
                        const [freq, sig] = pair.split('=');
                        return { freq: (freq / 1000).toFixed(2), sig: parseFloat(sig).toFixed(1) };
                    });

                    stopScanning(true);

                    const messageClient = JSON.stringify({
                        type: 'sigArray',
                        value: sigArray,
                    });
                    extraSocket.send(messageClient);
                } else {
                    logInfo("Spectrum Graph: uValue is null or empty, skipping further processing.");
                }
            }
            break;
        }
    }

    // Call original handleData function
    originalHandleData(wss, receivedData, rdsWss);
};
// *************************************

// Configure antennas
let antennaCurrent; // Will remain 'undefined' if antenna switch is disabled
let antennaSwitch = false;
let antennaResponse = { enabled: false };
if (config.antennas) antennaResponse = config.antennas;

if (antennaResponse.enabled) { // Continue if 'enabled' is true
  antennaSwitch = true;
  antennaCurrent = 0; // Default antenna
  const antennas = ['ant1', 'ant2', 'ant3', 'ant4'];

  let antennaStatus = {};

  antennas.forEach(ant => {
    antennaStatus[ant] = antennaResponse[ant].enabled; // antennaResponse.antX.enabled set to true or false
  });

  // Assign null to antennas enabled
  [1, 2, 3, 4].forEach((i) => {
    if (antennaResponse[`ant${i}`].enabled) {
      datahandlerReceived.dataToSend[`sd${i - 1}`] = null; // Assign null value to enabled antennas
    }
  });
}

// Function for first run
function waitForTextSocket(maxWaitTime = 30000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            if (typeof textSocket !== 'undefined' && textSocket !== null) {
                resolve(textSocket);
            } else if (Date.now() - startTime >= maxWaitTime) {
                logError(new Error(`Spectrum Graph: textSocket was not defined within 30 seconds`));
                reject();
            } else {
                setTimeout(check, 1000);
            }
        };

        check();
    });
}

waitForTextSocket()
    .then((value) => {
      let initialDelay = 5000;
      logInfo(`Spectrum Graph: textSocket is defined, preparing first run...`);
      setTimeout(() => restartScan('scan'), initialDelay); // First run

      if (antennaResponse.enabled) {
          // antennaResponse.ant1.enabled is first antenna so can be skipped

          if (antennaResponse.ant2.enabled) {
            setTimeout(() => sendCommandToClient('Z1'), initialDelay + 3000);
            setTimeout(() => restartScan('scan'), initialDelay + 3600);
          } else {
            setTimeout(() => sendCommandToClient('Z0'), initialDelay + 3600);
            return;
          }
            
          if (antennaResponse.ant3.enabled) {
            setTimeout(() => sendCommandToClient('Z2'), initialDelay + 6200);
            setTimeout(() => restartScan('scan'), initialDelay + 6800);
          } else {
            setTimeout(() => sendCommandToClient('Z0'), initialDelay + 6800);
            return;
          }

          if (antennaResponse.ant4.enabled) {
            setTimeout(() => sendCommandToClient('Z3'), initialDelay + 9400);
            setTimeout(() => restartScan('scan'), initialDelay + 10000);
          } else {
            setTimeout(() => sendCommandToClient('Z0'), initialDelay + 10000);
            return;
          }
      }

    })
    .catch(() => {});

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
    if (isScanning) return;

    // Begin scan
    datahandlerReceived.dataToSend.sd = null;

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

      // Limit scan to either 64-86 MHz or 86-108 MHz 
      if ((currentFrequency * 1000) < 86000 && tuningUpperLimitScan > 86000) tuningUpperLimitScan = 86000;
      if ((currentFrequency * 1000) >= 86000 && tuningLowerLimitScan < 86000) tuningLowerLimitScan = 86000;

      // The magic happens here
      sendCommandToClient(`Sa${tuningLowerLimitScan - tuningLowerLimitOffset}`);
      sendCommandToClient(`Sb${tuningUpperLimitScan + tuningUpperLimitOffset}`);
      sendCommandToClient(`Sc${tuningStepSize}`);
      sendCommandToClient(`S`);
    }
    logInfo(`Spectrum Graph: Spectral commands sent (IP: ${ipAddress})`);

    // Reset U data before receiving new data
    interceptedUData = null;
    interceptedZData = null;
    sigArray = [];

    // Wait for U value using async
    async function waitForUValue(timeout = 10000, interval = 40) {
        const waitStartTime = Date.now(); // Start of the waiting period

        while (Date.now() - waitStartTime < timeout) {
            if (interceptedUData !== null && interceptedUData !== undefined) {
                return interceptedUData; // Return when data is fetched
            }

            await new Promise(resolve => setTimeout(resolve, interval)); // Wait for next check
        }

        throw new Error(`Spectrum Graph timed out`); // Throw error if timed out
    }

    (async () => {
        try {
            const scanStartTime = Date.now(); // Start of the entire scan process
            let uValue = await waitForUValue();

            // Remove trailing comma and space in TEF radio firmware
            if (uValue && uValue.endsWith(', ')) {
                uValue = uValue.slice(0, -2);
            }

            // Possibly interrupted
            if (uValue && uValue.endsWith(',')) {
                stopScanning(false);
                uValue = null;
            }
            //console.log(uValue);

            const completeTime = ((Date.now() - scanStartTime) / 1000).toFixed(1); // Calculate total time
            logInfo(`Spectrum Graph: Spectrum scan (${(tuningLowerLimitScan / 1000)}-${(tuningUpperLimitScan / 1000)} MHz) ${antennaResponse.enabled ? `for Ant. ${antennaCurrent} ` : ''}complete in ${completeTime} seconds.`);

            // Split the response into pairs and process each one
            sigArray = uValue.split(',').map(pair => {
                const [freq, sig] = pair.split('=');
                return { freq: (freq / 1000).toFixed(2), sig: parseFloat(sig).toFixed(1) };
            });

            stopScanning(true);
            //console.log(sigArray);

            const messageClient = JSON.stringify({
                type: 'sigArray',
                value: sigArray,
            });
            extraSocket.send(messageClient);
        } catch (error) {
            logError(`Spectrum Graph failed to get 'U' value, error:`, error.message);
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
    const now = Date.now();

    if (now - lastRestartTime < (retryDelay * 1000)) {
        logInfo(`Spectrum Graph in cooldown mode, can retry in ${(((retryDelay * 1000) - (now - lastRestartTime)) / 1000).toFixed(1)} seconds (IP: ${ipAddress})`);
        return;
    }
    
    lastRestartTime = now;

    // Restart scan
    if (!isScanning) setTimeout(() => startScan(command), 20);
}
