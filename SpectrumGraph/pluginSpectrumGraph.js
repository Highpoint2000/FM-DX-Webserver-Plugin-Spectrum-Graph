/*
    Spectrum Graph v1.1.3 by AAD
    https://github.com/AmateurAudioDude/FM-DX-Webserver-Plugin-Spectrum-Graph
*/

(() => {

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const checkUpdates = true;                      // Checks online if a new version is available
const borderlessTheme = true;                   // Background and text colours match FM-DX Webserver theme
const enableMouseScrollWheel = true;            // Allow the mouse scroll wheel to tune inside the graph
const decimalMarkerRoundOff = true;             // Round frequency markers to the nearest integer
const useButtonSpacingBetweenCanvas = true;     // Other plugins are likely to override this if set to false

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const pluginVersion = '1.1.3';

// const variables
const debug = false;
const dataFrequencyElement = document.getElementById('data-frequency');
const drawGraphDelay = 10;
const canvasHeightSmall = 120;
const canvasHeightLarge = 175;
const topValue = borderlessTheme ? '10px' : '14px';

// let variables
let dataFrequencyValue;
let isCanvasHovered = false; // Used for mouse scoll wheel
let isDecimalMarkerRoundOff = decimalMarkerRoundOff;
let isGraphOpen = false;
let isSpectrumOn = false;
let ipAddress = 'unknown host';
let antennaCurrent = 0;
let xOffset = 30;
let sigArray = [];
let enableSmoothing = localStorage.getItem('enableSpectrumGraphSmoothing') === 'true'; // Smooths the graph edges
let fixedVerticalGraph = localStorage.getItem('enableSpectrumGraphFixedVerticalGraph') === 'true'; // Fixed or dynamic vertical graph based on peak signal strength
let signalText = localStorage.getItem('signalUnit') || 'dbf';
let sigOffset, xSigOffset, sigDesc, prevSignalText;
let removeUpdateTextTimeout;
let updateText;
let wsSendSocket;

// Create Spectrum Graph button
const SPECTRUM_BUTTON_NAME = 'SPECTRUM';
const aSpectrumCss = `
#spectrum-graph-button {
border-radius: 0px;
width: 100px;
height: 22px;
position: relative;
margin-top: 16px;
margin-left: 5px;
right: 0px;
}
`
$("<style>")
    .prop("type", "text/css")
    .html(aSpectrumCss)
    .appendTo("head");

const aSpectrumText = $('<strong>', {
    class: 'aspectrum-text',
    html: SPECTRUM_BUTTON_NAME
});

const aSpectrumButton = $('<button>', {
    id: 'spectrum-graph-button',
});

aSpectrumButton.append(aSpectrumText);

function initializeSpectrumButton() {

    let buttonWrapper = $('#button-wrapper');
    if (buttonWrapper.length < 1) {
        buttonWrapper = createDefaultButtonWrapper();
    }

    if (buttonWrapper.length) {
        aSpectrumButton.addClass('hide-phone bg-color-2')
        buttonWrapper.append(aSpectrumButton);
    }
    displaySignalCanvas();
}

// Create a default button wrapper if it does not exist
function createDefaultButtonWrapper() {
    const wrapperElement = $('.tuner-info');
    if (wrapperElement.length) {
        const buttonWrapper = $('<div>', {
            id: 'button-wrapper'
        });
        buttonWrapper.addClass('button-wrapper');
        wrapperElement.append(buttonWrapper);
        if (useButtonSpacingBetweenCanvas) wrapperElement.append(document.createElement('br'));
        return buttonWrapper;
    } else {
        console.error('Spectrum Graph: Standard button location not found. Unable to add button.');
        return null;
    }
}

$(window).on('load', function() {
    setTimeout(initializeSpectrumButton, 200);

    aSpectrumButton.on('click', function() {
        toggleSpectrum();
    });
});

// Create the WebSocket connection
const currentURL = new URL(window.location.href);
const WebserverURL = currentURL.hostname;
const WebserverPath = currentURL.pathname.replace(/setup/g, '');
const WebserverPORT = currentURL.port || (currentURL.protocol === 'https:' ? '443' : '80');
const protocol = currentURL.protocol === 'https:' ? 'wss:' : 'ws:';
const WEBSOCKET_URL = `${protocol}//${WebserverURL}:${WebserverPORT}${WebserverPath}data_plugins`;

// WebSocket to send request and receive response
async function setupSendSocket() {
    if (!wsSendSocket || wsSendSocket.readyState === WebSocket.CLOSED) {
        try {
            wsSendSocket = new WebSocket(WEBSOCKET_URL);
            wsSendSocket.onopen = () => {
                console.log(`Spectrum Graph connected WebSocket`);

                wsSendSocket.onmessage = function(event) {
                    // Parse incoming JSON data
                    const data = JSON.parse(event.data);

                    if (data.type === 'spectrum-graph') {
                        console.log(`Spectrum Graph command sent`);
                    }

                    // Handle 'sigArray' data
                    if (data.type === 'sigArray') {
                        console.log(`Spectrum Graph received sigArray.`);
                        sigArray = data.value;
                        if (sigArray.length > 0) {
                            setTimeout(drawGraph, drawGraphDelay);
                        }
                        if (debug) {
                            if (Array.isArray(data.value)) {
                                // Process sigArray
                                data.value.forEach(item => {
                                    console.log(`freq: ${item.freq}, sig: ${item.sig}`);
                                });
                            } else {
                                console.error('Expected array for sigArray, but received:', data.value);
                            }
                        }
                    }
                };
            };

            wsSendSocket.onclose = (event) => {
                setTimeout(function() {
                    console.log(`Spectrum Graph: WebSocket closed:`, event);
                }, 400);
                setTimeout(setupSendSocket, 5000); // Reconnect after 5 seconds
            };
        } catch (error) {
            console.error("Failed to setup Send WebSocket:", error);
            setTimeout(setupSendSocket, 5000); // Retry after 5 seconds
        }
    }
}
// WebSocket and scanner button initialisation
setTimeout(setupSendSocket, 400);

// Function to check for updates
async function fetchFirstLine() {
    if (checkUpdates) {
        const urlCheckForUpdate = 'https://raw.githubusercontent.com/AmateurAudioDude/FM-DX-Webserver-Plugin-Spectrum-Graph/refs/heads/main/version'

        try {
            const response = await fetch(urlCheckForUpdate);
            if (!response.ok) {
                throw new Error(`Spectrum Graph update check HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            const firstLine = text.split('\n')[0]; // Extract first line

            const version = firstLine;

            return version;
        } catch (error) {
            console.error('Spectrum Graph error fetching file:', error);
            return null;
        }
    }
}

// Check for updates
fetchFirstLine().then(version => {
    if (checkUpdates && version) {
        if (version !== pluginVersion) {
            updateText = "There is a new version of this plugin available";
            console.log(`Spectrum Graph: ${updateText}`)
        }
    }
});

// Signal units
prevSignalText = signalText;

function signalUnits() {
    signalText = localStorage.getItem('signalUnit') || 'dbf';
    switch (signalText) {
        case 'dbuv':
            sigOffset = 11;
            xOffset = 30;
            xSigOffset = 20;
            sigDesc = 'dBµV';
            break;
        case 'dbm':
            sigOffset = 120;
            xOffset = 36;
            xSigOffset = 32;
            sigDesc = 'dBm';
            break;
        default:
            sigOffset = 0;
            xOffset = 30;
            xSigOffset = 20;
            sigDesc = 'dBf';
    }
    if (signalText !== prevSignalText) {
        setTimeout(drawGraph, drawGraphDelay);
        console.log(`Spectrum Graph: Signal unit changed.`);
    }
    prevSignalText = signalText;
}
setInterval(signalUnits, 3000);

// Create scan button to refresh graph
function ScanButton() {
    // Remove any existing instances of button
    const existingButtons = document.querySelectorAll('.rectangular-spectrum-button');
    existingButtons.forEach(button => button.remove());

    // Create new button for controlling spectrum
    const spectrumButton = document.createElement('button');
    spectrumButton.id = 'spectrum-scan-button';
    spectrumButton.setAttribute('aria-label', 'Spectrum Graph Scan');
    spectrumButton.classList.add('rectangular-spectrum-button', 'tooltip');
    spectrumButton.setAttribute('data-tooltip', 'Perform manual scan');
    spectrumButton.innerHTML = '<i class="fa-solid fa-rotate"></i>';

    // Add event listener
    let canSendMessage = true;
    if (isTuningAllowed) {
        spectrumButton.addEventListener('click', () => {
            const message = JSON.stringify({
                type: 'spectrum-graph',
                value: {
                    status: 'scan',
                    ip: ipAddress,
                },
            });
            function sendMessage(message) {
                if (!canSendMessage || !wsSendSocket) return;

                if (wsSendSocket) wsSendSocket.send(message);
                canSendMessage = false;

                // Cooldown
                setTimeout(() => {
                    canSendMessage = true;
                }, 1000);
            }
            sendMessage(message);
        });
    }

    // Locate canvas and its parent container
    const canvas = document.getElementById('sdr-graph');
    if (canvas) {
        const canvasContainer = canvas.parentElement;
        if (canvasContainer && canvasContainer.classList.contains('canvas-container')) {
            canvasContainer.style.position = 'relative';
            canvas.style.cursor = 'crosshair';
            canvasContainer.appendChild(spectrumButton);
        } else {
            console.error('Parent container is not .canvas-container');
        }
    } else {
        console.error('#sdr-graph not found');
    }

    // Add styles
    const rectangularButtonStyle = `
    .rectangular-spectrum-button {
        position: absolute;
        top: ${topValue};
        right: 16px;
        z-index: 10;
        opacity: 0.8;
        border-radius: 5px;
        padding: 5px 10px;
        cursor: pointer;
        transition: background-color 0.3s, color 0.3s, border-color 0.3s;
        width: 32px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.8);
    }
`;

    const styleElement = document.createElement('style');
    styleElement.innerHTML = rectangularButtonStyle;
    document.head.appendChild(styleElement);

    SmoothingOnOffButton();
    ToggleFixedOrDynamicButton();
    if (updateText) insertUpdateText(updateText);
}

// Create scan button to refresh graph
function SmoothingOnOffButton() {
    // Remove any existing instances of button
    const existingButtons = document.querySelectorAll('.smoothing-on-off-button');
    existingButtons.forEach(button => button.remove());

    // Create new button
    const smoothingOnOffButton = document.createElement('button');
    smoothingOnOffButton.id = 'smoothing-on-off-button';
    smoothingOnOffButton.setAttribute('aria-label', 'Toggle On/Off');
    smoothingOnOffButton.classList.add('smoothing-on-off-button', 'tooltip');
    smoothingOnOffButton.setAttribute('data-tooltip', 'Smooth graph edges');
    smoothingOnOffButton.innerHTML = '<i class="fa-solid fa-chart-area"></i>';

    // Button state (off by default)
    let isOn = false;

    if (enableSmoothing) {
        isOn = true;
        smoothingOnOffButton.classList.toggle('button-on', isOn);
    }

    // Add event listener for toggle functionality
    smoothingOnOffButton.addEventListener('click', () => {
        isOn = !isOn; // Toggle state
        smoothingOnOffButton.classList.toggle('button-on', isOn); // Highlight if "on"

        if (isOn) {
            enableSmoothing = true;
            localStorage.setItem('enableSpectrumGraphSmoothing', 'true');
        } else {
            enableSmoothing = false;
            localStorage.setItem('enableSpectrumGraphSmoothing', 'false');
        }
        setTimeout(drawGraph, drawGraphDelay);
    });

    // Locate the canvas and its parent container
    const canvas = document.getElementById('sdr-graph');
    if (canvas) {
        const canvasContainer = canvas.parentElement;
        if (canvasContainer && canvasContainer.classList.contains('canvas-container')) {
            canvasContainer.style.position = 'relative';
            canvasContainer.appendChild(smoothingOnOffButton);

            // Adjust position to be left of spectrum button if it exists
            const spectrumButton = document.getElementById('spectrum-scan-button');
            if (spectrumButton) {
                smoothingOnOffButton.style.right = `${parseInt(spectrumButton.style.right, 10) + 40}px`; // 40px offset
            }
        } else {
            console.error('Spectrum Graph: Parent container is not .canvas-container');
        }
    } else {
        console.error('Spectrum Graph: #sdr-graph not found');
    }

    // Add styles
    const buttonStyle = `
    .smoothing-on-off-button {
        position: absolute;
        top: ${topValue};
        right: 56px;
        z-index: 10;
        opacity: 0.8;
        border-radius: 5px;
        padding: 5px 10px;
        cursor: pointer;
        transition: background-color 0.3s, color 0.3s, border-color 0.3s;
        width: 32px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.8);
    }
    .smoothing-on-off-button i {
        font-size: 14px;
    }
    .smoothing-on-off-button.button-on {
        filter: brightness(150%) contrast(110%);
        box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.5), 0 0 10px var(--color-5);
    }
`;

    const styleElement = document.createElement('style');
    styleElement.innerHTML = buttonStyle;
    document.head.appendChild(styleElement);
}

// Create fixed/dynamic button for vertical graph
function ToggleFixedOrDynamicButton() {
    // Remove any existing instances of button
    const existingButtons = document.querySelectorAll('.fixed-dynamic-on-off-button');
    existingButtons.forEach(button => button.remove());

    // Create new button
    const toggleFixedOrDynamicButton = document.createElement('button');
    toggleFixedOrDynamicButton.id = 'fixed-dynamic-on-off-button';
    toggleFixedOrDynamicButton.setAttribute('aria-label', 'Toggle On/Off');
    toggleFixedOrDynamicButton.classList.add('fixed-dynamic-on-off-button', 'tooltip');
    toggleFixedOrDynamicButton.setAttribute('data-tooltip', 'Toggle fixed/dynamic signal range');
    toggleFixedOrDynamicButton.innerHTML = '<i class="fa-solid fa-arrows-up-down"></i>';

    // Button state (off by default)
    let isOn = false;

    if (fixedVerticalGraph) {
        isOn = true;
        toggleFixedOrDynamicButton.classList.toggle('button-on', isOn);
    }

    // Add event listener for toggle functionality
    toggleFixedOrDynamicButton.addEventListener('click', () => {
        isOn = !isOn; // Toggle state
        toggleFixedOrDynamicButton.classList.toggle('button-on', isOn); // Highlight if "on"

        if (isOn) {
            fixedVerticalGraph = true;
            localStorage.setItem('enableSpectrumGraphFixedVerticalGraph', 'true');
        } else {
            fixedVerticalGraph = false;
            localStorage.setItem('enableSpectrumGraphFixedVerticalGraph', 'false');
        }
        setTimeout(drawGraph, drawGraphDelay);
    });

    // Locate the canvas and its parent container
    const canvas = document.getElementById('sdr-graph');
    if (canvas) {
        const canvasContainer = canvas.parentElement;
        if (canvasContainer && canvasContainer.classList.contains('canvas-container')) {
            canvasContainer.style.position = 'relative';
            canvasContainer.appendChild(toggleFixedOrDynamicButton);

            // Adjust position to be left of spectrum button if it exists
            const spectrumButton = document.getElementById('spectrum-scan-button');
            if (spectrumButton) {
                toggleFixedOrDynamicButton.style.right = `${parseInt(spectrumButton.style.right, 10) + 40}px`; // 40px offset
            }
        } else {
            console.error('Spectrum Graph: Parent container is not .canvas-container');
        }
    } else {
        console.error('Spectrum Graph: #sdr-graph not found');
    }

    // Add styles
    const buttonStyle = `
    .fixed-dynamic-on-off-button {
        position: absolute;
        top: ${topValue};
        right: 96px;
        z-index: 10;
        opacity: 0.8;
        border-radius: 5px;
        padding: 5px 10px;
        cursor: pointer;
        transition: background-color 0.3s, color 0.3s, border-color 0.3s;
        width: 32px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.8);
    }
    .fixed-dynamic-on-off-button i {
        font-size: 14px;
    }
    .fixed-dynamic-on-off-button.button-on {
        filter: brightness(150%) contrast(110%);
        box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.5), 0 0 10px var(--color-5);
    }
`;

    const styleElement = document.createElement('style');
    styleElement.innerHTML = buttonStyle;
    document.head.appendChild(styleElement);
    initTooltips();
}

// Function to display update text
function insertUpdateText(updateText) {
    // Remove any existing update text
    const existingText = document.querySelector('.spectrum-graph-update-text');
    if (existingText) existingText.remove();

    // Create new text element
    const updateTextElement = document.createElement('div');
    updateTextElement.classList.add('spectrum-graph-update-text');
    updateTextElement.textContent = updateText;

    // Style the text
    updateTextElement.style.position = 'absolute';
    updateTextElement.style.top = '32px';
    updateTextElement.style.left = '40px';
    updateTextElement.style.zIndex = '10';
    updateTextElement.style.color = 'var(--color-5-transparent)';
    updateTextElement.style.fontSize = '14px';
    updateTextElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    updateTextElement.style.padding = '4px 8px';
    updateTextElement.style.borderRadius = '5px';
    updateTextElement.style.opacity = '1';
    updateTextElement.addEventListener('mouseenter', () => { updateTextElement.style.opacity = '0.1'; });

    // Locate canvas container
    const canvas = document.getElementById('sdr-graph');
    if (canvas) {
        const canvasContainer = canvas.parentElement;
        if (canvasContainer && canvasContainer.classList.contains('canvas-container')) {
            canvasContainer.style.position = 'relative';
            canvasContainer.appendChild(updateTextElement);
        } else {
            console.error('Spectrum Graph: Parent container is not .canvas-container');
        }
    } else {
        console.error('Spectrum Graph: #sdr-graph not found');
    }

    function resetUpdateTextTimeout() {
        // Clear any existing timeout
        clearTimeout(removeUpdateTextTimeout);

        // Begin new timeout
        removeUpdateTextTimeout = setTimeout(() => {
            const sdrCanvasUpdateText = document.querySelector('.spectrum-graph-update-text');
            if (sdrCanvasUpdateText) {
                sdrCanvasUpdateText.remove();
            }
        }, 10000);
    }
    resetUpdateTextTimeout();
}

// Who is the user?
fetch('https://api.ipify.org?format=json')
    .then((response) => response.json())
    .then((data) => {
        ipAddress = data.ip;
    })
    .catch((error) => console.error('Spectrum Graph error fetching IP:', error));

// Check if administrator code
var isTuneAuthenticated = false;
var isTunerLocked = false;
var isTuningAllowed = false;

document.addEventListener('DOMContentLoaded', () => {
    checkAdminMode();
});

// Is the user administrator?
function checkAdminMode() {
    const bodyText = document.body.textContent || document.body.innerText;
    isTunerLocked = !!document.querySelector('.fa-solid.fa-key.pointer.tooltip') || !!document.querySelector('.fa-solid.fa-lock.pointer.tooltip');
    isTuneAuthenticated = bodyText.includes("You are logged in as an administrator.") || bodyText.includes("You are logged in as an adminstrator.") || bodyText.includes("You are logged in and can control the receiver.");
    if (isTuneAuthenticated || (isTunerLocked && isTuneAuthenticated) || (!isTunerLocked && !isTuneAuthenticated)) isTuningAllowed = true;
    if (isTuneAuthenticated) {
        console.log(`Spectrum Graph: Logged in as administrator`);
    }
}

// Fetch any available data on page load
async function initializeGraph() {
    try {
        // Fetch the initial data from /api
        const response = await fetch('/api');
        if (!response.ok) {
            throw new Error(`Spectrum Graph failed to fetch data: ${response.status}`);
        }

        const data = await response.json();

        // Switch to data of current antenna
        if (data.ad && data.sd && (data.sd0 || data.sd1)) data.sd = data[`sd${data.ad}`];

        // Check if `sd` exists
        if (data.sd && data.sd.trim() !== '') {
            console.log(`Spectrum Graph data found for antenna ${data.ad} on page load.`);
            if (data.sd.length > 0) {

                // Remove trailing comma and space in TEF radio firmware
                if (data.sd && data.sd.endsWith(', ')) {
                    data.sd = data.sd.slice(0, -2);
                }

                // Split the response into pairs and process each one (as it normally does server-side)
                sigArray = data.sd.split(',').map(pair => {
                    const [freq, sig] = pair.split('=');
                    return { freq: (freq / 1000).toFixed(2), sig: parseFloat(sig).toFixed(1) };
                });
            }

            if (debug) {
                if (Array.isArray(sigArray)) {
                    // Process sigArray
                    sigArray.forEach(item => {
                        console.log(`freq: ${item.freq}, sig: ${item.sig}`);
                    });
                } else {
                    console.error('Expected array for sigArray, but received:', sigArray);
                }
            }
        } else {
            console.log('Spectrum Graph found no data available at page load.');
        }
    } catch (error) {
        console.error('Spectrum Graph error during graph initialisation:', error);
    }
}

// Call function on page load
window.addEventListener('load', initializeGraph);


// Display signal canvas (default)
function displaySignalCanvas() {
    const sdrCanvas = document.getElementById('sdr-graph');
    if (sdrCanvas) {
        sdrCanvas.style.display = 'none';
        isGraphOpen = false;
    }
    const sdrCanvasScanButton = document.getElementById('spectrum-scan-button');
    if (sdrCanvasScanButton) {
        sdrCanvasScanButton.style.display = 'none';
    }
    const sdrCanvasSmoothingButton = document.getElementById('smoothing-on-off-button');
    if (sdrCanvasSmoothingButton) {
        sdrCanvasSmoothingButton.style.display = 'none';
    }
    const sdrCanvasFixedDynamicButton = document.getElementById('fixed-dynamic-on-off-button');
    if (sdrCanvasFixedDynamicButton) {
        sdrCanvasFixedDynamicButton.style.display = 'none';
    }
    const sdrCanvasUpdateText = document.querySelector('.spectrum-graph-update-text');
    if (sdrCanvasUpdateText) {
        sdrCanvasUpdateText.remove();
    }

    const loggingCanvas = document.getElementById('logging-canvas');
    if (loggingCanvas) {
        loggingCanvas.style.display = 'none';
    }
    const ContainerRotator = document.getElementById('containerRotator');
    if (ContainerRotator) {
        ContainerRotator.style.display = 'block';
    }
    const ContainerAntenna = document.getElementById('Antenna');
    if (ContainerAntenna) {
        ContainerAntenna.style.display = 'block';
    }
    const signalCanvas = document.getElementById('signal-canvas');
    if (signalCanvas) {
        signalCanvas.style.display = 'block';
    }
}

// Display SDR graph output
function displaySdrGraph() {
    const sdrCanvas = document.getElementById('sdr-graph');
    if (sdrCanvas) {
        sdrCanvas.style.display = 'block';
        isGraphOpen = true;
        if (!borderlessTheme) canvas.style.border = "1px solid var(--color-3)";
        setTimeout(drawGraph, drawGraphDelay);
        const signalCanvas = document.getElementById('signal-canvas');
        if (signalCanvas) {
            signalCanvas.style.display = 'none';
        }
    }
    const loggingCanvas = document.getElementById('logging-canvas');
    if (loggingCanvas) {
        loggingCanvas.style.display = 'none';
    }
    const loggingCanvasButtons = document.querySelector('.download-buttons-container');
    if (loggingCanvasButtons) {
        loggingCanvasButtons.style.display = 'none';
    }
    const ContainerRotator = document.getElementById('containerRotator');
    if (ContainerRotator) {
        ContainerRotator.style.display = 'none';
    }
    const ContainerAntenna = document.getElementById('Antenna');
    if (ContainerAntenna) {
        ContainerAntenna.style.display = 'none';
    }
    ScanButton();
}


// Adjust dataCanvas height based on window height
function adjustSdrGraphCanvasHeight() {
    if (window.innerHeight < 860 && window.innerWidth > 480) {
        canvas.height = canvasHeightSmall;
    } else {
        canvas.height = canvasHeightLarge;
    }
    drawGraph();
}


// Toggle spectrum state and update UI accordingly
function toggleSpectrum() {
    // Do not proceed to open canvas if signal canvas is hidden
    if (!document.querySelector("#signal-canvas")?.offsetParent && !isSpectrumOn) return;

    signalText = localStorage.getItem('signalUnit');

    const SpectrumButton = document.getElementById('spectrum-graph-button');
    const ButtonsContainer = document.querySelector('.download-buttons-container');
    const antennaImage = document.querySelector('#antenna'); // Ensure ID 'antenna' is correct
    isSpectrumOn = !isSpectrumOn;

    const loggingCanvas = document.getElementById('logging-canvas');
    if (loggingCanvas) {
        loggingCanvas.style.display = 'none';
    }

    if (isSpectrumOn) {
        // Update button appearance
        SpectrumButton.classList.remove('bg-color-2');
        SpectrumButton.classList.add('bg-color-4');

        // Perform when spectrum is on
        displaySdrGraph();

        // Hide antenna image
        if (antennaImage) {
            antennaImage.style.visibility = 'hidden';
        }

        // Set initial height with delay
        setTimeout(adjustSdrGraphCanvasHeight, 400);
        // Adjust height dynamically on window resize
        window.addEventListener('resize', adjustSdrGraphCanvasHeight);
    } else {
        // Update button appearance
        SpectrumButton.classList.remove('bg-color-4');
        SpectrumButton.classList.add('bg-color-2');

        // Perform when spectrum is off
        displaySignalCanvas();

        // Hide download buttons
        if (ButtonsContainer) {
            ButtonsContainer.style.display = 'none';
        }

        // Show antenna image
        if (antennaImage) {
            antennaImage.style.visibility = 'visible';
        }
    }
    signalUnits();
}

// Observe any frequency changes
function observeFrequency() {
    if (dataFrequencyElement) {
        // Create MutationObserver
        const observer = new MutationObserver((mutationsList, observer) => {
            // Loop through mutations that were triggered
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    const dataFrequencyValue = dataFrequencyElement.textContent;
                    if (isGraphOpen) setTimeout(drawGraph, drawGraphDelay);
                }
            }
        });

        const config = { childList: true, subtree: true };

        observer.observe(dataFrequencyElement, config);
    } else {
        console.log('Spectrum Graph: #data-frequency missing');
    }
}
observeFrequency();

// Tooltip and frequency highlighter
function initializeCanvasInteractions() {
    const canvas = document.getElementById('sdr-graph');
    const canvasContainer = document.querySelector('.canvas-container');
    const tooltip = document.createElement('div');

    const colorBackground = getComputedStyle(document.documentElement).getPropertyValue('--color-1-transparent').trim();

    // Style tooltip
    tooltip.style.position = 'absolute';
    tooltip.style.background = 'var(--color-3-transparent)';
    tooltip.style.color = 'var(--color-main-2)';
    tooltip.style.padding = '5px';
    tooltip.style.borderRadius = '8px';
    tooltip.style.fontSize = '12px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.visibility = 'hidden';
    tooltip.style.zIndex = '20';

    // Append tooltip inside the canvas-container
    canvasContainer.appendChild(tooltip);

    // Scaling factors and bounds
    let xScale, minFreq, freqRange, yScale;

    function updateTooltip(event) {
        // Ready to draw circle
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGraph();

        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Calculate frequency
        const freq = minFreq + (mouseX - xOffset) / xScale;

        if (freq < minFreq || freq > minFreq + freqRange) {
            tooltip.style.visibility = 'hidden';
            return;
        }

        // Find closest point in sigArray to the frequency under the cursor
        let closestPoint = null;
        let minDistance = Infinity;
        for (let point of sigArray) {
            const distance = Math.abs(point.freq - freq.toFixed(1));
            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = point;
            }
        }

        if (closestPoint) {
            const signalValue = Number(closestPoint.sig);

            // Calculate tooltip content
            const freqText = `${freq.toFixed(1)} MHz`;
            const signalText = `, ${signalValue.toFixed(0) - sigOffset} ${sigDesc}`;

            // Style HTML
            tooltip.innerHTML = `
                <span style="font-weight: 600;">${freqText}</span>
                <span style="font-weight: 400;">${signalText}</span>
            `;

            // Calculate position of circle
            const circleX = xOffset + (closestPoint.freq - minFreq) * xScale;
            const circleY = canvas.height - (signalValue * yScale) - 20;

            // Draw circle at tip of the signal
            ctx.beginPath();
            ctx.arc(circleX, circleY, 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'var(--color-5-transparent)';
            ctx.fill();
            ctx.strokeStyle = 'var(--color-main-bright)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Tooltip positioning
            let tooltipX = (xOffset + 10) + (closestPoint.freq - minFreq) * xScale;
            const tooltipY = canvas.height - 20 - signalValue * yScale;
            const tooltipWidth = tooltip.offsetWidth;

            if (tooltipX + tooltipWidth > canvas.width) {
                tooltipX = mouseX - tooltip.offsetWidth - 10;
            }

            tooltip.style.left = `${tooltipX}px`;
            tooltip.style.top = `${tooltipY - 30}px`;
            tooltip.style.visibility = 'visible';
        }
    }

    function handleClick(event) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;

        // Calculate frequency
        const freq = minFreq + (mouseX - xOffset) / xScale;

        if (freq < minFreq || freq > minFreq + freqRange) return;

        // Send WebSocket command
        const command = `T${Math.round(freq.toFixed(1) * 1000)}`;
        console.log(`Spectrum Graph: Sending command "${command}"`);
        socket.send(command);
        setTimeout(() => {
            setTimeout(drawGraph, drawGraphDelay);
        }, 40);
    }

    // Function to control frequency via mouse wheel
    function handleWheelScroll(event) {
        if (enableMouseScrollWheel) {
            event.preventDefault(); // Prevent webpage scrolling

            // Normalize deltaY value for cross-browser consistency
            const delta = event.deltaY || event.detail || -event.wheelDelta;

            if (delta < 0) {
                // Scroll up
                tuneUp();
            } else {
                // Scroll down
                tuneDown();
            }
        }
    }

    // Add event listeners
    canvas.addEventListener('mousemove', updateTooltip);
    canvas.addEventListener('mouseleave', () => {
        tooltip.style.visibility = 'hidden';
        setTimeout(() => {
            drawGraph();
        }, 800);
    });
    canvas.addEventListener('wheel', handleWheelScroll);
    canvas.addEventListener('click', handleClick);

    // Called after graph is drawn
    return function updateBounds(newXScale, newMinFreq, newFreqRange, newYScale) {
        xScale = newXScale;
        minFreq = newMinFreq;
        freqRange = newFreqRange;
        yScale = newYScale;
    };
}

// Select container where canvas should be added
const container = document.querySelector('.canvas-container');

// Create a new canvas element
const canvas = document.createElement('canvas');

// Set canvas attributes
canvas.id = 'sdr-graph';
canvas.position = 'relative';

canvas.width = 1170;
if (window.innerHeight < 860 && window.innerWidth > 480) {
    canvas.height = canvasHeightSmall;
} else {
    canvas.height = canvasHeightLarge;
}

// Append the canvas to the container
container.appendChild(canvas);

// Get background colour
function getBackgroundColor(element) {
    return window.getComputedStyle(element).backgroundColor;
}
const wrapperOuter = document.getElementById('wrapper-outer');

$(window).on('load', function() {
    setTimeout(() => {
        let currentBackgroundColor = getBackgroundColor(wrapperOuter);
        const observer = new MutationObserver(() => {
            const newColor = getBackgroundColor(wrapperOuter);
            if (newColor !== currentBackgroundColor) {
                setTimeout(() => {
                    console.log(`Spectrum Graph new background colour.`);
                    setTimeout(drawGraph, drawGraphDelay);
                }, 400);
            }
        });
        const config = { attributes: true };
        observer.observe(wrapperOuter, config);
    }, 1000);
});

// Draw graph
function drawGraph() {
    dataFrequencyValue = dataFrequencyElement.textContent;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Check if sigArray has data
    if (!sigArray || sigArray.length === 0) {
        //console.error("sigArray is empty or not defined");
        return;
    }

    // Determine max signal value dynamically
    let maxSig;
    if (fixedVerticalGraph) {
        maxSig = 80; // Fixed vertical graph
    } else {
        maxSig = Math.max(...sigArray.map(d => d.sig)) || 0.01; // Dynamic vertical graph
    }

    const maxFreq = Math.max(...sigArray.map(d => d.freq));
    const minFreq = Math.min(...sigArray.map(d => d.freq));

    if (maxFreq - minFreq <= 12) isDecimalMarkerRoundOff = false;

    // Determine frequency step dynamically
    const freqRange = (maxFreq - minFreq).toFixed(2);
    const approxSpacing = width / freqRange; // Approx spacing per frequency
    let freqStep;
    if (approxSpacing < 20) {
        freqStep = 5;
    } else if (approxSpacing < 40) {
        freqStep = 2;
    } else if (approxSpacing < 64) {
        freqStep = 1;
    } else if (approxSpacing < 80) {
        freqStep = 0.5;
    } else if (approxSpacing < 160) {
        if (isDecimalMarkerRoundOff) {
            freqStep = 0.5;
        } else {
            freqStep = 0.4;
        }
    } else if (approxSpacing < 320) {
        if (isDecimalMarkerRoundOff) {
            freqStep = 0.5;
        } else {
            freqStep = 0.2;
        }
    } else {
        freqStep = 0.1;
    }

    // Scaling factors
    const xScale = (width - xOffset) / freqRange;
    const yScale = (height - 40) / maxSig;

    const colorText = getComputedStyle(document.documentElement).getPropertyValue('--color-5').trim();
    const colorBackground = getComputedStyle(document.documentElement).getPropertyValue('--color-1-transparent').trim();

    // Draw background
    if (!borderlessTheme) {
        ctx.fillStyle = colorBackground; // Background
        ctx.fillRect(0, 0, width, height);
    }

    // Reset line style for grid lines and graph
    ctx.setLineDash([]);

    // Draw frequency labels and tick marks
    if (borderlessTheme) {
        ctx.fillStyle = colorText;
        ctx.font = `12px Titillium Web, Helvetica, Calibri, Arial, Monospace, sans-serif`;
    } else {
        ctx.fillStyle = '#f0f0fe';
        ctx.font = `12px Helvetica, Calibri, Arial, Monospace, sans-serif`;
    }
    ctx.strokeStyle = '#ccc';

    // Round minFreq if setting is enabled
    let minFreqRounded = minFreq;
    minFreqRounded = isDecimalMarkerRoundOff ? Math.ceil(minFreqRounded) : minFreqRounded;

    for (let freq = minFreqRounded; freq <= maxFreq; freq += freqStep) {
        const x = xOffset + (freq - minFreq) * xScale;
        if (freq !== minFreq && freq !== maxFreq) ctx.fillText(freq.toFixed(1), x - 10, height - 5);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);

        for (let freq = minFreqRounded; freq <= maxFreq; freq += freqStep) {
            const x = xOffset + (freq - minFreq) * xScale;

            // Draw tick mark only if it's not the first or last frequency
            if (freq !== minFreq && freq !== maxFreq) {
                ctx.beginPath();
                ctx.moveTo(x, height - 20); // Start at x-axis
                ctx.lineTo(x, height - 18); // Extend slightly upwards
                ctx.stroke();
            }
        }
    }

    // Draw signal labels
    let sigLabelStep;
    if (canvas.height === canvasHeightLarge) {
        sigLabelStep = maxSig / 8; // Increase the number of labels
    } else {
        sigLabelStep = maxSig / 4;
    }
    let labels = [];
    for (let sig = 0; sig <= maxSig; sig += sigLabelStep) {
        const y = height - 20 - sig * yScale;
        if (signalText === 'dbm') {
            // dBm spacing
            let tempDbfSig = (sig - sigOffset).toFixed(0);
            // dBm
            if (sig && tempDbfSig > -100) ctx.fillText(tempDbfSig, ((xOffset - xSigOffset) + 8), y + 3);
            if (sig && tempDbfSig <= -100) ctx.fillText(tempDbfSig, ((xOffset - xSigOffset)) + 1.5, y + 3);
        } else if (signalText === 'dbuv') {
            // dBuV number spacing
            let tempDbuvSig = ((sig - sigOffset) + 1).toFixed(0);
            // dBuV using +1 for even numbering
            if (sig && tempDbuvSig >= 10) ctx.fillText(tempDbuvSig, (xOffset - xSigOffset), y + 3);
            if (sig && tempDbuvSig > 0 && tempDbuvSig < 10) ctx.fillText(tempDbuvSig, (xOffset - xSigOffset) + 6.5, y + 3);
            if (sig && tempDbuvSig == 0) ctx.fillText(tempDbuvSig, (xOffset - xSigOffset) + 5.5, y + 3);
            if (sig && tempDbuvSig < 0) ctx.fillText(tempDbuvSig, (xOffset - xSigOffset) + 1.5, y + 3);
        } else if (signalText === 'dbf') {
            let tempDbfSig = (sig - sigOffset).toFixed(0);
            // dBf
            if (sig && tempDbfSig >= 10) ctx.fillText(tempDbfSig, (xOffset - xSigOffset), y + 3);
            if (sig && tempDbfSig > 0 && tempDbfSig < 10)
                if (sig) ctx.fillText(tempDbfSig, (xOffset - xSigOffset) + 6.5, y + 3);
            if (sig && tempDbfSig == 0) ctx.fillText(tempDbfSig, (xOffset - xSigOffset) + 5.5, y + 3);
            if (sig && tempDbfSig < 0) ctx.fillText(tempDbfSig, (xOffset - xSigOffset) + 1.5, y + 3);
        }
        labels.push(sig); // Store labeled values
    }

    // Draw dotted grid lines (horizontal)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 2]); // Dotted lines
    ctx.beginPath(); // Start a new path for all horizontal lines

    for (let sig of labels) {
        const y = (height - 20 - sig * yScale) - 1;
        ctx.moveTo(xOffset, y);
        ctx.lineTo(width, y);
    }

    // Draw all lines in one stroke call to prevent overlaps
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    for (let sig = 0; sig <= maxSig; sig += sigLabelStep) {
        const y = height - 20 - sig * yScale; // Calculate vertical position

        // Draw tick mark only if it's not the first or last value
        if (sig !== 0) {
            ctx.beginPath();
            ctx.moveTo(xOffset - 2, y - 1); // Start just to the left of the axis
            ctx.lineTo(xOffset, y - 1); // Extend slightly outwards
            ctx.stroke();
        }
    }

    // Fill graph area
    const gradient = ctx.createLinearGradient(0, height - 20, 0, 0);

    // Add colour stops
    gradient.addColorStop(0, "#0030E0");
    gradient.addColorStop(0.25, "#18BB56");
    gradient.addColorStop(0.5, "#8CD500");
    gradient.addColorStop(0.75, "#F04100");

    // Set fill style and draw a rectangle
    ctx.fillStyle = gradient;

    // Draw graph with smoothed points
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xOffset, height - 20); // Start from bottom-left corner

    // Draw graph line
    sigArray.forEach((point, index) => {
        if (point.sig < 0) point.sig = 0;
        const x = xOffset + (point.freq - minFreq) * xScale;
        const y = height - 20 - point.sig * yScale;
        if (index === 0) {
            ctx.lineTo(x, y - 1);
        } else {
            ctx.lineTo(x, y - 1);
        }
    });

    if (enableSmoothing) {
        ctx.fillStyle = gradient;
        ctx.strokeStyle = gradient;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3; // Smoothing
        ctx.stroke();
    }

    // Restore to not affect the rest of the graph
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    // Return to the x-axis under the last data point
    const lastPointX = xOffset + (sigArray[sigArray.length - 1].freq - minFreq) * xScale;
    ctx.lineTo(lastPointX, height - 20);

    ctx.fill();

    // Draw grid lines (vertical)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([1, 2]); // Dotted lines

    // Vertical grid lines (for each frequency step)
    for (let freq = minFreqRounded; freq <= maxFreq; freq += freqStep) {
        const x = xOffset + (freq - minFreq) * xScale;
        if (freq !== minFreq) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height - 20);
            ctx.stroke();
        }
    }

    // Draw graph line
    let leftX, rightX;
    sigArray.forEach((point, index) => {
        if (point.sig < 0) point.sig = 0;
        const x = xOffset + (point.freq - minFreq) * xScale;
        const y = height - 20 - point.sig * yScale;

        // Draw current frequency line
        if (Number(dataFrequencyValue).toFixed(1) == Number(point.freq).toFixed(1)) {
            // Calculate the x-coordinates for the white vertical line
            let highlightBandwidthLow = 0.1;
            let highlightBandwidthHigh = 0.1;
            const highlightFreq = Number(dataFrequencyValue);
            if (highlightFreq === minFreq) highlightBandwidthLow = 0.0;
            if (highlightFreq === minFreq) highlightBandwidthHigh = 0.1;
            leftX = xOffset + (highlightFreq - highlightBandwidthLow - minFreq) * xScale; // 0.1 MHz to the left
            rightX = xOffset + (highlightFreq + highlightBandwidthHigh - minFreq) * xScale; // 0.1 MHz to the right
        }
    });

    // Set style for white line
    ctx.fillStyle = 'rgba(224, 224, 240, 0.3)';

    // Draw vertical highlight region
    ctx.fillRect(leftX, 0, rightX - leftX, height - 20); // From top to bottom of graph

    const colorLines = getComputedStyle(document.documentElement).getPropertyValue('--color-5').trim();

    ctx.setLineDash([]);
    if (borderlessTheme) {
        ctx.strokeStyle = colorLines;
    } else {
        ctx.strokeStyle = '#98989f';
    }
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo((xOffset - 0.5), height - 19.5); // X-axis
    ctx.lineTo(width + 0.5, height - 19.5);
    ctx.moveTo((xOffset - 0.5), 0.5); // Y-axis
    ctx.lineTo((xOffset - 0.5), height - 19.5);
    ctx.stroke();

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => (e.button === 1) && e.preventDefault());

    return updateBounds(xScale, minFreq, freqRange, yScale);
}
const updateBounds = initializeCanvasInteractions();

})();
