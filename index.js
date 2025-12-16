const canvas = document.getElementById('plotCanvas');
const ctx = canvas.getContext('2d');
const input = document.getElementById('functionInput');
const resetBtn = document.getElementById('resetView');

// Configuration
let config = {
    scale: 40, // pixels per unit
    offsetX: 0,
    offsetY: 0,
    step: 0.05, // Step size for x loop (lower = smoother but slower)
    axisColor: '#fff',
    gridColor: 'rgba(255, 255, 255, 0.1)',
    lineColor: '#06b6d4',
    lineWidth: 3
};

// State
let width, height;
let centerX, centerY;

function resize() {
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    canvas.width = width;
    canvas.height = height;
    centerX = width / 2;
    centerY = height / 2;
    draw();
}

window.addEventListener('resize', resize);
resetBtn.addEventListener('click', () => {
    config.scale = 40;
    config.offsetX = 0;
    config.offsetY = 0;
    draw();
});

input.addEventListener('input', () => {
    draw();
});

// Math Evaluator
// Destructure Math properties to be directly accessible
const mathProps = Object.getOwnPropertyNames(Math);
const mathContext = {};
mathProps.forEach(p => {
    mathContext[p] = Math[p];
});

function evaluateFunction(expression, x) {
    try {
        // Create a function that executes with Math properties in scope and 'x' as argument
        // We use 'with' for convenience here, or manually destructure. 
        // For security in a real public app we'd use a parser, but for this demo:
        // We will construct a new Function.

        // Sanitize? Basic check to avoid immediate non-math code execution not perfect but ok for client-side tool.
        // We inject all Math keys into the function body string.

        const keys = Object.keys(mathContext);
        const values = Object.values(mathContext);

        const f = new Function(...keys, 'x', `return ${expression};`);
        return f(...values, x);
    } catch (e) {
        return NaN;
    }
}

// Interaction State
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        canvas.style.cursor = 'grabbing';
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'crosshair';
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        // Update offsets
        // config.scale is pixels/unit. 
        // We want to move the graph by dx pixels.
        // That corresponds to dx / config.scale units.
        config.offsetX += dx / config.scale;
        config.offsetY += dy / config.scale; // Y is inverted in math, but offset logic depends on how we use it. 
        // In draw(): screenY = centerY - (y - config.offsetY) * config.scale;
        // If we move mouse down (+dy), we want the graph to move down.
        // Increase config.offsetY? 
        // screenY new = centerY - (y - (oldOffset + delta)) * scale
        // = centerY - (y - oldOffset) * scale + delta * scale
        // We want screenY to increase by dy.
        // dy = delta * scale => delta = dy / scale. 
        // So yes, add dy/scale to offsetY.
        // Wait, for X: screenX = centerX + (x + offsetX) * scale.
        // If move mouse right (+dx), graph moves right.
        // screenX new = screenX old + dx.
        // centerX + (x + oldOffset + delta) * scale = centerX + (x + oldOffset)*scale + delta*scale
        // delta*scale = dx => delta = dx/scale.

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        draw();
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = 1 + zoomIntensity * direction;

    // Zoom around cursor
    // 1. Get mouse pos in math coords (before zoom)
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Math X at cursor
    const mathX = (mouseX - centerX) / config.scale - config.offsetX;
    // Math Y at cursor
    const mathY = -(mouseY - centerY) / config.scale + config.offsetY;

    // 2. Apply Zoom
    let newScale = config.scale * factor;
    // Limit min/max scale if needed, e.g. 1e-5 to 1e5
    if (newScale < 0.001) newScale = 0.001;
    if (newScale > 100000) newScale = 100000;

    config.scale = newScale;

    // 3. Adjust offsets so that mathX, mathY is still at mouseX, mouseY
    // newScreenX = centerX + (mathX + newOffsetX) * newScale = mouseX
    // (mathX + newOffsetX) = (mouseX - centerX) / newScale
    // newOffsetX = (mouseX - centerX) / newScale - mathX

    config.offsetX = (mouseX - centerX) / config.scale - mathX;

    // newScreenY = centerY - (mathY - newOffsetY) * newScale = mouseY
    // (mathY - newOffsetY) = (centerY - mouseY) / newScale
    // newOffsetY = mathY - (centerY - mouseY) / newScale

    config.offsetY = mathY - (centerY - mouseY) / config.scale;

    draw();
}, { passive: false });

function calculateStep() {
    // We want grid lines every ~50-100 pixels
    const targetPixels = 80;
    const stepUnits = targetPixels / config.scale;

    // Find closest nice number (1, 2, 5, 10, etc.)
    const magnitude = Math.pow(10, Math.floor(Math.log10(stepUnits)));
    const residual = stepUnits / magnitude;

    let step;
    if (residual > 5) step = 10 * magnitude;
    else if (residual > 2) step = 5 * magnitude;
    else if (residual > 1) step = 2 * magnitude;
    else step = magnitude;

    return step;
}

function drawGrid() {
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1;
    ctx.font = '12px Outfit, sans-serif';

    const step = calculateStep();

    // Calculate visible range
    const startX = -centerX / config.scale - config.offsetX;
    const endX = (width - centerX) / config.scale - config.offsetX;
    const startY = -centerY / config.scale + config.offsetY;
    const endY = (height - centerY) / config.scale + config.offsetY; // This calc is just bounds, order doesn't matter for logic but loop needs correct order

    // Correction for loop bounds
    const minX = Math.floor(startX / step) * step;
    const maxX = Math.ceil(endX / step) * step;

    // Y axis is inverted: bigger pixel Y is smaller math Y
    // startY (top of screen) is positive math Y
    // endY (bottom of screen) is negative math Y
    // So visible range is [endY, startY] in math terms (minY, maxY)
    const minY = Math.floor(Math.min(startY, endY) / step) * step;
    const maxY = Math.ceil(Math.max(startY, endY) / step) * step;

    // Draw Grid
    ctx.strokeStyle = config.gridColor;
    ctx.beginPath();

    // Vertical lines and X axis labels
    ctx.fillStyle = '#94a3b8'; // Label color
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let x = minX; x <= maxX; x += step) {
        // Fix floating point issues
        const val = parseFloat(x.toPrecision(10));
        const screenX = centerX + (val + config.offsetX) * config.scale;

        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);

        // Label
        if (Math.abs(val) > 1e-10) { // Don't label 0 differently here or do it later
            let labelY = centerY + config.offsetY * config.scale + 8;
            labelY = Math.min(Math.max(labelY, 5), height - 20);
            ctx.fillText(val.toString(), screenX, labelY);
        }
    }

    // Horizontal lines and Y axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let y = minY; y <= maxY; y += step) {
        const val = parseFloat(y.toPrecision(10));
        const screenY = centerY - (val - config.offsetY) * config.scale;

        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);

        if (Math.abs(val) > 1e-10) {
            let labelX = centerX + config.offsetX * config.scale - 8;
            labelX = Math.min(Math.max(labelX, 30), width - 5);
            ctx.fillText(val.toString(), labelX, screenY);
        }
    }
    ctx.stroke();

    // Draw Axes (thicker)
    ctx.lineWidth = 2;
    ctx.strokeStyle = config.axisColor;
    ctx.beginPath();

    // X Axis (y=0)
    const pxZeroY = centerY + config.offsetY * config.scale;
    if (pxZeroY >= -10 && pxZeroY <= height + 10) {
        ctx.moveTo(0, pxZeroY);
        ctx.lineTo(width, pxZeroY);
    }

    // Y Axis (x=0)
    const pxZeroX = centerX + config.offsetX * config.scale;
    if (pxZeroX >= -10 && pxZeroX <= width + 10) {
        ctx.moveTo(pxZeroX, 0);
        ctx.lineTo(pxZeroX, height);
    }
    ctx.stroke();

    // Draw Origin label specifically
    if (pxZeroX > 0 && pxZeroX < width && pxZeroY > 0 && pxZeroY < height) {
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText("0", pxZeroX - 5, pxZeroY + 5);
    }
}

function drawCurve() {
    const expression = input.value;
    if (!expression) return;

    ctx.lineWidth = config.lineWidth;
    ctx.strokeStyle = config.lineColor;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    // Loop through pixels for smoother rendering
    // xPixel represents the actual pixel coordinate on screen
    let firstPoint = true;

    for (let xPixel = 0; xPixel <= width; xPixel++) {
        // Convert pixel to math coordinate x
        const x = (xPixel - centerX) / config.scale - config.offsetX;

        let y;
        try {
            y = evaluateFunction(expression, x);
        } catch (e) {
            y = NaN;
        }

        if (isNaN(y) || !isFinite(y)) {
            firstPoint = true;
            continue;
        }

        // Convert math coordinate y to pixel
        // Screen Y is inverted (up is negative in Canvas)
        const yPixel = centerY - (y - config.offsetY) * config.scale;

        if (firstPoint) {
            ctx.moveTo(xPixel, yPixel);
            firstPoint = false;
        } else {
            // Avoid drawing jagged lines for asymptotes (like tan(x))
            // Check if distance is too big
            // We can check the previous point if we stored it, but context keeps track
            // A simple heuristic: if change in Y is massive, skip lineTo (move instead)
            // But canvas path doesn't expose last point easily, so let's just draw.

            // Better heuristic: if y value diff is huge, start new path?
            // For now, standard lineTo.
            ctx.lineTo(xPixel, yPixel);
        }
    }

    ctx.shadowBlur = 10;
    ctx.shadowColor = config.lineColor;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function draw() {
    drawGrid();
    drawCurve();
}

// Initialize
resize();
