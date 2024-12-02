/*
    Spectrum Graph v1.0.0b5 by AAD
    https://github.com/AmateurAudioDude/FM-DX-Webserver-Plugin-Spectrum-Graph
*/

(() => {

////////////////////////////////////////////////////////////////////////////////////////////////////

const enableSmoothing = true;                 // Recommended if using TEF module
const useButtonSpacingBetweenCanvas = true;   // Other plugins are likely to override this

////////////////////////////////////////////////////////////////////////////////////////////////////

// Create the WebSocket connection
const currentURL = new URL(window.location.href);
const WebserverURL = currentURL.hostname;
const WebserverPath = currentURL.pathname.replace(/setup/g, '');
const WebserverPORT = currentURL.port || (currentURL.protocol === 'https:' ? '443' : '80');
const protocol = currentURL.protocol === 'https:' ? 'wss:' : 'ws:';
const WEBSOCKET_URL = `${protocol}//${WebserverURL}:${WebserverPORT}${WebserverPath}data_plugins`;

// const variables
const dataFrequencyElement = document.getElementById('data-frequency');
const xOffset = 30;
const drawGraphDelay = 10;

// let variables
let dataFrequencyValue;
let isGraphOpen = false;
let isSpectrumOn = false;
let ipAddress = '0';
let sigArray = [];
let wsSendSocket;

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

                        /*
                        if (Array.isArray(data.value)) {
                            // Process sigArray
                            data.value.forEach(item => {
                                console.log(`freq: ${item.freq}, sig: ${item.sig}`);
                            });
                        } else {
                            console.error('Expected array for sigArray, but received:', data.value);
                        }
                        */
                    }
                };
            };

            wsSendSocket.onclose = (event) => {
                console.log(`Spectrum Graph: WebSocket closed:`, event);
                setTimeout(setupSendSocket, 5000); // Reconnect after 5 seconds
            };
        } catch (error) {
            console.error("Failed to setup Send WebSocket:", error);
            setTimeout(setupSendSocket, 5000); // Retry after 5 seconds
        }
    }
}

// Create scan button to refresh graph
function ScanButton() {
    // Remove any existing instances of button
    const existingButtons = document.querySelectorAll('.rectangular-spectrum-button');
    existingButtons.forEach(button => button.remove());

    // Create new button for controlling spectrum
    const spectrumButton = document.createElement('button');
    spectrumButton.id = 'spectrum-scan-button';
    spectrumButton.setAttribute('aria-label', 'Spectrum Graph Scan');
    spectrumButton.classList.add('rectangular-spectrum-button');
    spectrumButton.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';

    // Add event listener
    spectrumButton.addEventListener('click', () => {
        const message = JSON.stringify({
            type: 'spectrum-graph',
            value: {
                status: 'scan',
                ip: ipAddress,
            },
        });
        if (wsSendSocket) wsSendSocket.send(message);
    });

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
            top: 8px;
            right: 8px;
            z-index: 10;
            border-radius: 5px;
            padding: 5px 10px;
            cursor: pointer;
            transition: background-color 0.3s, color 0.3s, border-color 0.3s;
            width: auto;
            height: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.8);
        }
    `;

    const styleElement = document.createElement('style');
    styleElement.innerHTML = rectangularButtonStyle;
    document.head.appendChild(styleElement);
}
// WebSocket and scanner button initialisation
setTimeout(setupSendSocket, 200);

fetch('https://api.ipify.org?format=json')
    .then((response) => response.json())
    .then((data) => {
        ipAddress = data.ip;
    })
    .catch((error) => console.error('Error fetching IP:', error));

// Fetch any available data on page load
async function initializeGraph() {
    try {
        // Fetch the initial data from /api
        const response = await fetch('/api');
        if (!response.ok) {
            throw new Error(`Spectrum Graph failed to fetch data: ${response.status}`);
        }

        const data = await response.json();

        // Check if `sd` exists
        if (data.sd && data.sd.trim() !== '') {
            console.log(`Spectrum Graph found data available on page load.`);
            if (data.sd.length > 0) {
                // Split the response into pairs and process each one (as it normally does server-side)
                sigArray = data.sd.split(',').map(pair => {
                    const [freq, sig] = pair.split('=');
                    return { freq: (freq / 1000).toFixed(2), sig: parseFloat(sig).toFixed(1) };
                });
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


// Display signal canvas (default)
function displaySignalCanvas() {
    const sdrCanvas = document.getElementById('sdr-graph');
    if (sdrCanvas) {
        sdrCanvas.style.display = 'none';
        isGraphOpen = false;
    }
    const sdrCanvasButton = document.getElementById('spectrum-scan-button');
    if (sdrCanvasButton) {
        sdrCanvasButton.style.display = 'none';
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
        canvas.style.border = "1px solid var(--color-3)";
        setTimeout(drawGraph, drawGraphDelay);
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
        ButtonsContainer.style.marginLeft = "-20.5%";
        ButtonsContainer.style.marginTop = "166px";
    }
    const signalCanvas = document.getElementById('signal-canvas');
    if (signalCanvas) {
        signalCanvas.style.display = 'none';
    }
    ScanButton();
}


// Adjust dataCanvas height based on window height
function adjustSdrGraphCanvasHeight() {
  if (window.innerHeight < 860 && window.innerWidth > 480) {
    canvas.height = 120;
  } else {
    canvas.height = 175;
  }
  drawGraph();
}


// Toggle spectrum state and update UI accordingly
function toggleSpectrum() {
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
  const tooltip = document.createElement('div');

  const colorBackground = getComputedStyle(document.documentElement).getPropertyValue('--color-1-transparent').trim();
  
  // Style tooltip
  tooltip.style.position = 'absolute';
  tooltip.style.background = 'var(--color-5-transparent)';
  tooltip.style.color = '#fefeff';
  tooltip.style.padding = '5px';
  tooltip.style.borderRadius = '8px';
  tooltip.style.fontSize = '12px';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.visibility = 'hidden';
  tooltip.style.zIndex = '10';
  document.body.appendChild(tooltip);

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
      const distance = Math.abs(point.freq - freq);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    if (closestPoint) {
      const signalValue = Number(closestPoint.sig);

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

      // Calculate tooltip position above the corresponding signal value
      const tooltipX = (xOffset + 10) + (closestPoint.freq - minFreq) * xScale;
      const tooltipY = canvas.height - 20 - signalValue * yScale;

      // Position and display tooltip
      tooltip.style.left = `${rect.left + tooltipX}px`;
      tooltip.style.top = `${rect.top + tooltipY - 30}px`; // Position above the graph point
      tooltip.textContent = ` ${freq.toFixed(1)} MHz, ${signalValue.toFixed(0)} dBf `;
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
        /*
        const message = JSON.stringify({
            type: 'spectrum-graph',
            value: {
                status: 'scan',
            }
        });
        if (wsSendSocket) wsSendSocket.send(message);
        */
        // Run again to compensate for high pings
        setTimeout(() => {
            setTimeout(drawGraph, drawGraphDelay);
        }, 800);
    }, 200);
  }

  // Add event listeners
  canvas.addEventListener('mousemove', updateTooltip);
  canvas.addEventListener('mouseleave', () => (tooltip.style.visibility = 'hidden'));
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
canvas.width = 1180;
if (window.innerHeight < 860 && window.innerWidth > 480) {
  canvas.height = 120;
} else {
  canvas.height = 175;
}
setTimeout(() => {
    canvas.style.border = "1px solid var(--color-3)";
}, 10000);

// Append the canvas to the container
container.appendChild(canvas);


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
  //const maxSig = Math.max(...sigArray.map(d => d.sig)); // Dynamic vertical graph
  const maxSig = 80; // Fixed vertical graph
  const maxFreq = Math.max(...sigArray.map(d => d.freq));
  const minFreq = Math.min(...sigArray.map(d => d.freq));

  // Determine frequency step dynamically
  const freqRange = maxFreq - minFreq;
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
    freqStep = 0.4;
  } else if (approxSpacing < 320) {
    freqStep = 0.2;
  } else {
    freqStep = 0.1;
  }

  // Scaling factors
  const xScale = (width - 30) / freqRange;
  const yScale = (height - 40) / maxSig;

  const colorBackground = getComputedStyle(document.documentElement).getPropertyValue('--color-1-transparent').trim();

  // Draw background
  ctx.fillStyle = colorBackground; // Background
  ctx.fillRect(0, 0, width, height);

  // Reset line style for grid lines and graph
  ctx.setLineDash([]);

  // Draw frequency labels and tick marks
  ctx.font = `12px Helvetica, Calibri, Arial, Monospace, sans-serif`;
  ctx.fillStyle = '#f0f0fe';
  ctx.strokeStyle = '#ccc';
  for (let freq = minFreq; freq <= maxFreq; freq += freqStep) {
    const x = xOffset + (freq - minFreq) * xScale;
    if (freq !== minFreq && freq !== maxFreq) ctx.fillText(freq.toFixed(1), x - 10, height - 5);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    for (let freq = minFreq; freq <= maxFreq; freq += freqStep) {
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
  const sigLabelStep = maxSig / 8; // Increase the number of labels
  let labels = [];
  for (let sig = 0; sig <= maxSig; sig += sigLabelStep) {
    const y = height - 20 - sig * yScale;
    if (sig) ctx.fillText(sig.toFixed(0), (xOffset - 20), y + 3);
    labels.push(sig); // Store labeled values
  }

  // Draw dotted grid lines (horizontal)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([1, 2]); // Dotted lines
  ctx.beginPath(); // Start a new path for all horizontal lines

  for (let sig of labels) {
    const y = (height - 20 - sig * yScale) - 1;
    ctx.moveTo(xOffset - 2, y);
    ctx.lineTo(width, y);
  }

  // Draw all lines in one stroke call to prevent overlaps
  ctx.stroke();

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
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
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
  for (let freq = minFreq; freq <= maxFreq; freq += freqStep) {
    const x = xOffset + (freq - minFreq) * xScale;
    if (freq !== minFreq) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 20);
      ctx.stroke();
    }
  }

  // Draw graph line
  sigArray.forEach((point, index) => {
    if (point.sig < 0) point.sig = 0;
    const x = xOffset + (point.freq - minFreq) * xScale;
    const y = height - 20 - point.sig * yScale;

    // Draw current frequency line
    if (Number(dataFrequencyValue) === Number(point.freq)) {
      // Calculate the x-coordinates for the white vertical line
      let highlightBandwidthLow = 0.1;
      let highlightBandwidthHigh = 0.1;
      const highlightFreq = Number(dataFrequencyValue);
      if (highlightFreq === minFreq) highlightBandwidthLow = 0.05;
      if (highlightFreq === minFreq) highlightBandwidthHigh = 0.05;
      const leftX = xOffset + (highlightFreq - highlightBandwidthLow - minFreq) * xScale; // 0.1 MHz to the left
      const rightX = xOffset + (highlightFreq + highlightBandwidthHigh - minFreq) * xScale; // 0.1 MHz to the right

      // Set style for white line
      ctx.fillStyle = 'rgba(224, 224, 240, 0.4)';

      // Draw vertical highlight region
      ctx.fillRect(leftX, 0, rightX - leftX, height - 20); // From top to bottom of graph
    }
  });

  ctx.setLineDash([]);
  ctx.strokeStyle = '#88888f';
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
