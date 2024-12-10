/*
    Spectrum Graph v1.1.3 by AAD
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
const { logInfo, logWarn, logError } = require('../../server/console');
const datahandlerReceived = require('../../server/datahandler'); // To grab signal strength data

// const variables
const debug = false;
const webserverPort = config.webserver.webserverPort || 8080;
const externalWsUrl = `ws://127.0.0.1:${webserverPort}`;

// let variables
let extraSocket, textSocket, textSocketLost, messageParsed, messageParsedTimeout, startTime, tuningLowerLimitScan, tuningUpperLimitScan, tuningLowerLimitOffset, tuningUpperLimitOffset, debounceTimer;
let ipAddress = 'localhost';
let currentFrequency = 0;
let initialDelay = 0;
let lastRestartTime = 0;
let nowTime = Date.now();
let isFirstRun = true;
let isScanRunning = false;
let frequencySocket = null;
let sigArray = [];

// Check if module or radio firmware
let isModule = true; // TEF668X module
let isFirstFirmwareNotice = false;
let firmwareType = 'unknown';
let BWradio = 0;

// Define paths used for config
const rootDir = path.dirname(require.main.filename); // Locate directory where index.js is located
const configFolderPath = path.join(rootDir, 'plugins_configs');
const configFilePath = path.join(configFolderPath, 'SpectrumGraph.json');

// Default configuration
let rescanDelay = 3; // seconds
let tuningRange = 0; // MHz
let tuningStepSize = 100; // kHz
let tuningBandwidth = 56; // kHz

const defaultConfig = {
    rescanDelay: 3,
    tuningRange: 0,
    tuningStepSize: 100,
    tuningBandwidth: 56
};

// Order of keys in configuration file
const configKeyOrder = ['rescanDelay', 'tuningRange', 'tuningStepSize', 'tuningBandwidth'];

// Function to ensure folder and file exist
function checkConfigFile() {
    // Check if plugins_configs folder exists
    if (!fs.existsSync(configFolderPath)) {
        logInfo(`${pluginName}: Creating plugins_configs folder...`);
        fs.mkdirSync(configFolderPath, { recursive: true }); // Create folder recursively if needed
    }

    // Check if json file exists
    if (!fs.existsSync(configFilePath)) {
        logInfo(`${pluginName}: Creating default SpectrumGraph.json file...`);
        saveDefaultConfig(); // Save default configuration
    }
}
checkConfigFile();

// Function to load configuration file
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

            // Ensure variables are numbers or booleans
            rescanDelay = !isNaN(Number(config.rescanDelay)) ? Number(config.rescanDelay) : defaultConfig.rescanDelay;
            tuningRange = !isNaN(Number(config.tuningRange)) ? Number(config.tuningRange) : defaultConfig.tuningRange;
            tuningStepSize = !isNaN(Number(config.tuningStepSize)) ? Number(config.tuningStepSize) : defaultConfig.tuningStepSize;
            tuningBandwidth = !isNaN(Number(config.tuningBandwidth)) ? Number(config.tuningBandwidth) : defaultConfig.tuningBandwidth;

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

// Function to save default configuration file
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
    // Create a new object with keys in specified order
    const orderedConfig = {};
    configKeyOrder.forEach(key => {
        if (key in config) {
            orderedConfig[key] = config[key];
        }
    });

    const formattedConfig = JSON.stringify(orderedConfig, null, 4); // Pretty print with 4 spaces
    fs.writeFileSync(configFilePath, formattedConfig); // Save updated config to file
}

// Function to watch configuration file for changes
function watchConfigFile() {
    fs.watch(configFilePath, (eventType) => {
        if (eventType === 'change') {
            clearTimeout(debounceTimer); // Clear any existing debounce timer
            debounceTimer = setTimeout(() => {
                loadConfigFile('re');
            }, 800);
        }
    });
}

// Initialise configuration system
function initConfigSystem() {
    loadConfigFile(); // Load configuration values initially
    watchConfigFile(); // Monitor for changes
    logInfo(`${pluginName}: Rescan Delay: ${rescanDelay} sec, Tuning Range: ${tuningRange ? tuningRange + ' MHz' : 'Full MHz'}, Tuning Steps: ${tuningStepSize} kHz, Bandwidth: ${tuningBandwidth} kHz`);
}

initConfigSystem();

// Function for 'text' WebSocket
async function TextWebSocket(messageData) {
    if (!textSocket || textSocket.readyState === WebSocket.CLOSED) {
        try {
            textSocket = new WebSocket(`${externalWsUrl}/text`);

            textSocket.onopen = () => {
                // Spectrum Graph connected to WebSocket

                // Launch startup antenna sequence 
                waitForTextSocket();

                textSocket.onmessage = (event) => {
                    try {
                        // Parse incoming message data
                        const messageData = JSON.parse(event.data);
                        // console.log(messageData);

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

// Function for 'data_plugins' WebSocket
async function ExtraWebSocket() {
    if (!extraSocket || extraSocket.readyState === WebSocket.CLOSED) {
        try {
            extraSocket = new WebSocket(`${externalWsUrl}/data_plugins`);

            extraSocket.onopen = () => {
                // Spectrum Graph connected to '/data_plugins'
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
                            if (!isFirstRun && !isScanRunning) restartScan('scan');
                        } else if (!message.value?.status === 'scan') {
                            logError(`Spectrum Graph unknown command received:`, message);
                        }
                        messageParsedTimeout = true;

                        if (messageParsed) { // Might not be needed as messageParsedTimeout will prevent it running multiple times
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

// Intercepted data storage
let interceptedUData = null;
let interceptedZData = null;

// Wrapper to intercept 'U' data
const originalHandleData = datahandlerReceived.handleData;

// datahandler code
datahandlerReceived.handleData = function(wss, receivedData, rdsWss) {
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

                // Remove trailing comma and space in TEF668X radio firmware
                if (uValue && uValue.endsWith(', ')) {
                    uValue = uValue.slice(0, -2);
                    isModule = false; // Firmware now detected as TEF668X radio
                    firmwareType = "TEF668X radio";
                } else {
                    isModule = true;
                    firmwareType = "TEF668X module";
                }

                // Possibly interrupted
                if (uValue && uValue.endsWith(',')) {
                    isScanHalted(true);
                    uValue = null;
                    setTimeout(() => {
                        datahandlerReceived.dataToSend[`sd${antennaCurrent}`] = null; // Reset value to clear incomplete data
                    }, 200);
                }

                if (uValue !== null) { // Ensure uValue is not null before splitting
                    // Split the response into pairs and process each one
                    sigArray = uValue.split(',').map(pair => {
                        const [freq, sig] = pair.split('=');
                        return { freq: (freq / 1000).toFixed(2), sig: parseFloat(sig).toFixed(1) };
                    });

                    const messageClient = JSON.stringify({
                        type: 'sigArray',
                        value: sigArray,
                    });
                    extraSocket.send(messageClient);
                } else {
                    logInfo(`Spectrum Graph: Invalid 'uValue' for Ant. ${antennaCurrent}, clearing incomplete data.`);
                }
                isScanHalted(true);
            }
            break;
        }
    }

    // Call original handleData function
    originalHandleData(wss, receivedData, rdsWss);
};

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

// Function for first run on startup
function waitForTextSocket() { // First run begins when default frequency is detected
    // If default frequency is enabled in config
    isFirstRun = true;
    isFirstFirmwareNotice = false; // Reset to false
    isModule = true; // Reset to true
    if (config.enableDefaultFreq) {
        const checkFrequencyInterval = 100;
        const timeoutDuration = 30000;

        let isFrequencyMatched = false;

        let intervalId = setInterval(() => {
            if (Number(config.defaultFreq).toFixed(2) === Number(currentFrequency).toFixed(2)) {
                isFrequencyMatched = true;
                clearInterval(intervalId);
                initialDelay = 800;
                firstRun();
            }
        }, checkFrequencyInterval);

        setTimeout(() => {
            if (!isFrequencyMatched) {
                clearInterval(intervalId);
                logError("Spectrum Graph: Default Frequency does not match current frequency, continuing anyway.");
                initialDelay = 30000;
                firstRun();
            }
        }, timeoutDuration);
    } else {
        // If default frequency is disabled in config
        async function waitForFrequency(timeout = 10000) { // First run begins when frequency is detected
            const checkInterval = 100;

            return new Promise((resolve, reject) => {
                const startTime = Date.now();

                const checkFrequency = setInterval(() => {
                    const freq = Number(currentFrequency).toFixed(2);

                    if (freq > 0.00) {
                        clearInterval(checkFrequency);
                        initialDelay = 3000;
                        firstRun();
                        return;
                    }

                    if (Date.now() - startTime >= timeout) {
                        clearInterval(checkFrequency);
                        reject('Spectrum Graph: Current frequency not found in time');
                    }
                }, checkInterval);
            });
        }

        waitForFrequency()
            .then(message => logInfo(message))
            .catch(error => logError(error));
    }

    function firstRun() {
        logInfo(`Spectrum Graph: TEF668X and WebSocket connected, preparing first run...`);
        setTimeout(() => restartScan('scan'), initialDelay); // First run

        // Scan additional antennas
        if (antennaResponse.enabled) {
            // Determine scaling factor based on tuningStepSize
            const scalingFactor = 100 / tuningStepSize;

            const antennas = [
                { enabled: antennaResponse.ant2.enabled, command: 'Z1' },
                { enabled: antennaResponse.ant3.enabled, command: 'Z2' },
                { enabled: antennaResponse.ant4.enabled, command: 'Z3' }
            ];

            for (let i = 0; i < antennas.length; i++) {
                const antenna = antennas[i];
                const command = antenna.enabled ? antenna.command : 'Z0';

                // Calculate time offset considering the scaling factor
                const timeOffset = initialDelay + (3000 * scalingFactor) + (3200 * i * scalingFactor);

                setTimeout(() => sendCommandToClient(command), timeOffset);

                if (antenna.enabled) {
                    setTimeout(() => restartScan('scan'), timeOffset + 600);
                }
            }

            // End of first run (antenna switch enabled)
            const finalTimeOffset = initialDelay + (3000 * scalingFactor) + (3200 * antennas.length * scalingFactor);
            setTimeout(() => {
                sendCommandToClient('Z0');
                isFirstRun = false;
                logInfo(`Spectrum Graph: Scan button unlocked, first run complete.`);
            }, finalTimeOffset);
        } else {
            // End of first run (antenna switch disabled)
            setTimeout(() => {
                isFirstRun = false;
                logInfo(`Spectrum Graph: Scan button unlocked, first run complete.`);
            }, initialDelay + (3000 * (100 / tuningStepSize)));
        }
    }
}

function sendCommand(socket, command) {
    //logInfo(`Spectrum Graph send command:`, command);
    socket.send(command);
}

async function sendCommandToClient(command) {
    try {
        // Ensure TextWebSocket connection is established
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

let retryFailed = false;

function waitForServer() {
    // Wait for server to become available
    if (typeof textSocket !== "undefined") {
        textSocket.addEventListener("message", (event) => {
            let parsedData;

            // Parse JSON data and handle errors gracefully
            try {
                parsedData = JSON.parse(event.data);
            } catch (err) {
                // Handle error
                logError(`Spectrum Graph failed to parse JSON:`, err);
                return; // Skip further processing if JSON is invalid
            }

            // Check if parsedData contains expected properties
            const freq = parsedData.freq;

            currentFrequency = freq;
        });
    } else {
        if (retryFailed) {
            logError(`Spectrum Graph: textSocket is not defined.`);
        }
        retryFailed = true;
        setTimeout(waitForServer, 1000);
    }
}
waitForServer();

function startScan(command) {
    // Exit if scan is running
    if (isScanRunning) return;

    // Begin scan
    datahandlerReceived.dataToSend.sd = null;

    // Restrict to config tuning limit, else 0-108 MHz
    let tuningLimit = config.webserver.tuningLimit;
    let tuningLowerLimit = tuningLimit === false ? 0 : config.webserver.tuningLowerLimit;
    let tuningUpperLimit = tuningLimit === false ? 108 : config.webserver.tuningUpperLimit;

    if (isNaN(currentFrequency) || currentFrequency === 0.0) {
        currentFrequency = tuningLowerLimit;
    }

    // Scan started
    isScanHalted(false);

    if (textSocket) {
        tuningLowerLimitScan = Math.round(tuningLowerLimit * 1000);
        tuningUpperLimitScan = Math.round(tuningUpperLimit * 1000);

        if (tuningRange) {
            tuningLowerLimitScan = (currentFrequency * 1000) - (tuningRange * 1000);
            tuningUpperLimitScan = (currentFrequency * 1000) + (tuningRange * 1000);
        }

        if (tuningUpperLimitScan > (tuningUpperLimit * 1000)) tuningUpperLimitScan = (tuningUpperLimit * 1000);
        if (tuningLowerLimitScan < (tuningLowerLimit * 1000)) tuningLowerLimitScan = (tuningLowerLimit * 1000);

        // Handle frequency limitations
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

        // Limit scan to either OIRT band (64-86 MHz) or FM band (86-108 MHz)
        if ((currentFrequency * 1000) < 86000 && tuningUpperLimitScan > 86000) tuningUpperLimitScan = 86000;
        if ((currentFrequency * 1000) >= 86000 && tuningLowerLimitScan < 86000) tuningLowerLimitScan = 86000;

        // The magic happens here
        if (currentFrequency >= 64) {
            sendCommandToClient(`Sa${tuningLowerLimitScan - tuningLowerLimitOffset}`);
            sendCommandToClient(`Sb${tuningUpperLimitScan + tuningUpperLimitOffset}`);
            sendCommandToClient(`Sc${tuningStepSize}`);
            if (isModule) {
                sendCommandToClient(`Sw${tuningBandwidth * 1000}`);
            } else {
                switch (tuningBandwidth) {
                    case 56: BWradio = 0; break;
                    case 64: BWradio = 26; break;
                    case 72: BWradio = 1; break;
                    case 84: BWradio = 28; break;
                    case 97: BWradio = 29; break;
                    case 114: BWradio = 3; break;
                    case 133: BWradio = 4; break;
                    case 151: BWradio = 5; break;
                    case 168: BWradio = 7; break;
                    case 184: BWradio = 8; break;
                    case 200: BWradio = 9; break;
                    case 217: BWradio = 10; break;
                    case 236: BWradio = 11; break;
                    case 254: BWradio = 12; break;
                    case 287: BWradio = 13; break;
                    case 311: BWradio = 15; break;
                    default: BWradio = 0; break;
                }
                sendCommandToClient(`Sf${BWradio}`);
            }
            sendCommandToClient('S');

            if (debug) {
                console.log(`Sa${tuningLowerLimitScan - tuningLowerLimitOffset}`);
                console.log(`Sb${tuningUpperLimitScan + tuningUpperLimitOffset}`);
                console.log(`Sc${tuningStepSize}`);
                console.log(isModule ? `Sw${tuningBandwidth * 1000}` : `Sf${BWradio}`);
                console.log('S');
            }

            if (!isFirstRun && !isFirstFirmwareNotice) {
                isFirstFirmwareNotice = true;
                logInfo(`Spectrum Graph: Firmware detected as ${firmwareType}.`);
            }
        } else {
            isScanHalted(true);
            logWarn('Spectrum Graph: Hardware is not capable of scanning below 64 MHz.');
            return;
        }
    }
    logInfo(`Spectrum Graph: Spectral commands sent (${ipAddress})`);

    // Reset data before receiving new data
    interceptedUData = null;
    interceptedZData = null;
    sigArray = [];

    // Wait for U value using async
    async function waitForUValue(timeout = 10000, interval = 40) {
        const waitStartTime = Date.now(); // Start of waiting period

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
            const scanStartTime = Date.now(); // Start of entire scan process
            let uValue = await waitForUValue();

            // Remove trailing comma and space in TEF668X radio firmware
            if (uValue && uValue.endsWith(', ')) {
                uValue = uValue.slice(0, -2);
                isModule = false; // Now identified as TEF668X radio firmware
                firmwareType = "TEF668X radio";
            } else {
                isModule = true;
                firmwareType = "TEF668X module";
            }

            // Possibly interrupted
            if (uValue && uValue.endsWith(',')) {
                isScanHalted(true);
                uValue = null;
                setTimeout(() => {
                    datahandlerReceived.dataToSend.sd = null; // Reset value to clear incomplete data
                }, 200);
            }
            if (debug) console.log(uValue);

            const completeTime = ((Date.now() - scanStartTime) / 1000).toFixed(1); // Calculate total time
            logInfo(`Spectrum Graph: Spectrum scan (${(tuningLowerLimitScan / 1000)}-${(tuningUpperLimitScan / 1000)} MHz) ${antennaResponse.enabled ? `for Ant. ${antennaCurrent} ` : ''}complete in ${completeTime} seconds.`);

            if (!isFirstRun) lastRestartTime = Date.now();

            // Split response into pairs and process each one
            sigArray = uValue.split(',').map(pair => {
                const [freq, sig] = pair.split('=');
                return { freq: (freq / 1000).toFixed(2), sig: parseFloat(sig).toFixed(1) };
            });

            // if (debug) console.log(sigArray);

            const messageClient = JSON.stringify({
                type: 'sigArray',
                value: sigArray,
            });
            extraSocket.send(messageClient);
        } catch (error) {
            logError(`Spectrum Graph scan interrupted, invalid 'U' value, error:`, error.message);
        }
        isScanHalted(true);
    })();
}

function isScanHalted(status) {
    if (status) {
        isScanRunning = false;
    } else {
        isScanRunning = true;
    }
}

function restartScan(command) {
    nowTime = Date.now();

    if (!isFirstRun && nowTime - lastRestartTime < (rescanDelay * 1000)) {
        logInfo(`Spectrum Graph in cooldown mode, can retry in ${(((rescanDelay * 1000) - (nowTime - lastRestartTime)) / 1000).toFixed(1)} seconds (${ipAddress})`);
        return;
    }

    lastRestartTime = nowTime;

    // Restart scan
    if (!isScanRunning) setTimeout(() => startScan(command), 20);
}
