/*
    Spectrum Graph v1.0.0b2 by AAD
    Server-side code
*/

const WebSocket = require('ws');
const config = require('./../../config.json');
const endpointsDatahandler = require('../../server/datahandler'); // To grab signal strength data
const { logInfo, logError } = require('./../../server/console');

const webserverPort = config.webserver.webserverPort || 8080;
const externalWsUrl = `ws://127.0.0.1:${webserverPort}`;

let extraSocket, textSocket, textSocketLost, messageParsed, messageParsedTimeout, startTime, tuningLowerLimitScan, tuningUpperLimitScan, tuningLowerLimitOffset, tuningUpperLimitOffset, ipAddress;

async function TextWebSocket(messageData) {
    if (!textSocket || textSocket.readyState === WebSocket.CLOSED) {
        try {
            textSocket = new WebSocket(`${externalWsUrl}/text`);

            textSocket.onopen = () => {
                logInfo(`Spectrum Graph: Scanner connected to WebSocket`);

                textSocket.onmessage = (event) => {
                    try {
                        // Parse the incoming message data
                        const messageData = JSON.parse(event.data);
                        // console.log(messageData);

                        if (!isSerialportAlive || isSerialportRetrying) {
                          if (textSocketLost) {
                            clearTimeout(textSocketLost);
                          }

                          textSocketLost = setTimeout(() => {
                            // WebSocket reconnection required after serialport connection loss
                            logInfo(`Spectrum Graph: Scanner connection lost, creating new WebSocket.`);
                            if (textSocket) {
                              try {
                                textSocket.close(1000, 'Normal closure');
                              } catch (error) {
                                logInfo(`Spectrum Graph: Error closing WebSocket:`, error);
                              }
                            }
                            textSocketLost = null;
                          }, 10000);
                        }

                    } catch (error) {
                        logError(`Spectrum Graph: Failed to parse WebSocket message:`, error);
                    }
                };
            };

            textSocket.onerror = (error) => logError(`Spectrum Graph: WebSocket error:`, error);

            textSocket.onclose = () => {
                logInfo(`Spectrum Graph: Scanner closed WebSocket`);
                setTimeout(() => TextWebSocket(messageData), 1000); // Pass messageData when reconnecting
            };

        } catch (error) {
            logError(`Spectrum Graph: Scanner Failed to set up WebSocket:`, error);
            setTimeout(() => TextWebSocket(messageData), 1000); // Pass messageData when reconnecting
        }
    }
}

async function ExtraWebSocket() {
    if (!extraSocket || extraSocket.readyState === WebSocket.CLOSED) {
        try {
            extraSocket = new WebSocket(`${externalWsUrl}/data_plugins`);

            extraSocket.onopen = () => {
                logInfo(`Spectrum Graph: Scanner connected to ${externalWsUrl + '/data_plugins'}`);
            };

            extraSocket.onerror = (error) => {
                logError(`Spectrum Graph: WebSocket error:`, error);
            };

            extraSocket.onclose = () => {
                logInfo(`Spectrum Graph: Scanner WebSocket closed.`);
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
                          ipAddress = message.value?.ip || 'Unknown IP';
                          if (!isScanning) restartScan('scan');
                      } else if (!message.value?.status === 'scan') {
                        logError(`Spectrum Graph: Scanner unknown command received:`, message);
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

// Scan code
let bandwidth = 2; // MHz
let currentFrequency = 0;
let isScanning = false;
let frequencySocket = null;
let sigArray = [];

function sendDataToClient(frequency) { // Not used
    if (textSocket && textSocket.readyState === WebSocket.OPEN) {
        const dataToSend = `T${(frequency * 1000).toFixed(0)}`;
        if (textSocket) textSocket.send(dataToSend);
    } else {
        logError(`Spectrum Graph: WebSocket not open.`);
        setTimeout(() => sendDataToClient(frequency), 1000); // Retry after short delay
    }
}

function sendCommand(socket, command) {
    //logInfo(`Spectrum Graph: Scanner send command:`, command);
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
                logError(`Spectrum Graph: Failed to parse JSON:`, err);
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

    isScanning = true;
    if (textSocket) {
      bandwidth = 5;
      //tuningLowerLimitScan = Math.round(88 * 1000);
      //tuningUpperLimitScan = Math.round(108 * 1000);
      tuningLowerLimitScan = Math.round(tuningLowerLimit * 1000);
      tuningUpperLimitScan = Math.round(tuningUpperLimit * 1000);
      //tuningLowerLimitScan = (currentFrequency * 1000) - (bandwidth * 1000);
      //tuningUpperLimitScan = (currentFrequency * 1000) + (bandwidth * 1000);

      if (tuningUpperLimitScan > (tuningUpperLimit * 1000)) tuningUpperLimitScan = (tuningUpperLimit * 1000);
      if (tuningLowerLimitScan < (tuningLowerLimit * 1000)) tuningLowerLimitScan = (tuningLowerLimit * 1000);
      if (tuningLowerLimitScan < 0.144) tuningLowerLimitScan = 0.144;
      //if (tuningLowerLimitScan > 27000 && tuningLowerLimitScan < 64000) tuningLowerLimitScan = 64000;
      if (tuningLowerLimitScan < 64000) tuningLowerLimitScan = 64000; // Doesn't like scanning HF frequencies

      // Keep bandwidth consistent for restricted bandwidth setting
      tuningLowerLimitOffset = (bandwidth * 1000) - (tuningUpperLimitScan - (currentFrequency * 1000));
      tuningUpperLimitOffset = (tuningLowerLimitScan - (currentFrequency * 1000)) + (bandwidth * 1000);
      tuningLowerLimitOffset = 0;
      tuningUpperLimitOffset = 0;

      // Limit scan to either 64-88 MHz or 88-108 MHz 
      if ((currentFrequency * 1000) < 86000 && tuningUpperLimitScan > 88000) tuningUpperLimitScan = 88000;
      if ((currentFrequency * 1000) >= 86000 && tuningLowerLimitScan < 86000) tuningLowerLimitScan = 86000;

      // The magic happens here
      sendCommandToClient(`Sa${tuningLowerLimitScan - tuningLowerLimitOffset}`);
      sendCommandToClient(`Sb${tuningUpperLimitScan + tuningUpperLimitOffset}`);
      sendCommandToClient('Sc100');
      sendCommandToClient('S');
    }
    logInfo(`Spectrum Graph: Spectral commands sent (${ipAddress})...`);
          
    // Wait for sd value using async
    async function waitForSdValue(timeout = 10000, interval = 40) {
        startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            let sdValue = endpointsDatahandler.dataToSend.sd;

            if (sdValue !== null && sdValue !== undefined) {
                return sdValue; // Return when data is fetched
            }

            await new Promise(resolve => setTimeout(resolve, interval)); // Wait for the next check
        }

        throw new Error(`Timed out`); // Throw an error if timeout is reached
    }

    (async () => {
        try {
            let sdValue = await waitForSdValue();

            // Remove trailing comma and space in TEF radio firmware
            if (sdValue && sdValue.endsWith(', ')) {
                sdValue = sdValue.slice(0, -2);
            }
            
            // console.log(sdValue);

            logInfo(`Spectrum Graph: Spectrum scan (${(tuningLowerLimitScan / 1000)} - ${(tuningUpperLimitScan / 1000)} MHz) complete in ${Date.now() - startTime}ms.`);

            // Split the response into pairs and process each one
            sigArray = sdValue.split(',').map(pair => {
                const [freq, sig] = pair.split('=');
                return { freq: (freq / 1000).toFixed(2), sig: parseFloat(sig).toFixed(1) };
            });

            startTime = null;
            stopScanning();
            //console.log(sigArray);

            const messageClient = JSON.stringify({
              type: 'sigArray',
              value: sigArray
            });
            extraSocket.send(messageClient);
        } catch (error) {
            logError(`Spectrum Graph: Failed to get "dataToSend.sd" value, error:`, error.message);
            stopScanning();
        }
    })();
}

function stopScanning(reason) {
    isScanning = false;
}

function restartScan(command) {
    // Restart scan
    sigArray = [];
    sdValue = null;
    //stopScanning();
    if (!isScanning) setTimeout(() => startScan(command), 100);
}
