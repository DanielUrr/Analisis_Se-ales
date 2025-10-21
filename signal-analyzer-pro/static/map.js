// Mapa de Cobertura - Signal Analyzer Pro

let mapCanvas, mapCtx;
let mapPoints = [];
let mapWalls = [];
let mapRouter = null;
let mapMode = 'point';
let mapView = '2d';
let showGrid = true;
let mapMonitoring = false;
let map3dScene, map3dCamera, map3dRenderer;

// Inicializar mapa cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    initMap();
});

function initMap() {
    mapCanvas = document.getElementById('mapCanvas');
    if (!mapCanvas) return;
    
    mapCtx = mapCanvas.getContext('2d');
    
    // Event listeners del canvas
    mapCanvas.addEventListener('click', handleMapClick);
    mapCanvas.addEventListener('mousemove', handleMapMouseMove);
    
    // Dibujar grid inicial
    drawMap();
}

function switchTab(tab) {
    // Cambiar tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tab === 'monitor') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-monitor').classList.add('active');
    } else if (tab === 'map') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-map').classList.add('active');
        
        // Redibujar mapa al cambiar de tab
        setTimeout(() => {
            drawMap();
        }, 100);
    }
}

function handleMapClick(event) {
    const rect = mapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    if (mapMode === 'point') {
        // Obtener RSSI actual
        const currentRssi = wifiMonitoring ? (wifiData.length > 0 ? wifiData[wifiData.length - 1].rssi : -70) : -70;
        
        addMapPoint(x, y, currentRssi);
    } else if (mapMode === 'router') {
        mapRouter = { x, y };
        drawMap();
    } else if (mapMode === 'wall') {
        // Agregar pared (requiere dos clics)
        if (!window.wallStart) {
            window.wallStart = { x, y };
        } else {
            mapWalls.push({
                x1: window.wallStart.x,
                y1: window.wallStart.y,
                x2: x,
                y2: y
            });
            window.wallStart = null;
            drawMap();
        }
    }
}

function handleMapMouseMove(event) {
    const rect = mapCanvas.getBoundingClientRect();
    const x = Math.floor(event.clientX - rect.left);
    const y = Math.floor(event.clientY - rect.top);
    
    document.getElementById('mapCoords').textContent = `X: ${x}, Y: ${y}`;
    
    // Mostrar preview de pared
    if (mapMode === 'wall' && window.wallStart) {
        drawMap();
        mapCtx.save();
        mapCtx.strokeStyle = '#ffd43b';
        mapCtx.lineWidth = 3;
        mapCtx.setLineDash([10, 10]);
        mapCtx.beginPath();
        mapCtx.moveTo(window.wallStart.x, window.wallStart.y);
        mapCtx.lineTo(x, y);
        mapCtx.stroke();
        mapCtx.restore();
    }
}

function addMapPoint(x, y, rssi) {
    mapPoints.push({ x, y, rssi, timestamp: Date.now() });
    updateMapStats();
    drawMap();
}

function drawMap() {
    if (!mapCtx) return;
    
    // Limpiar canvas
    mapCtx.fillStyle = '#0a0e27';
    mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    
    // Dibujar grid
    if (showGrid) {
        drawGrid();
    }
    
    // Dibujar según el modo
    if (mapView === 'heatmap') {
        drawHeatmap();
    } else if (mapView === '2d') {
        drawPoints2D();
    }
    
    // Dibujar paredes
    drawWalls();
    
    // Dibujar router
    if (mapRouter) {
        drawRouterIcon(mapRouter.x, mapRouter.y);
    }
    
    // Dibujar leyenda de escala
    drawScale();
}

function drawGrid() {
    mapCtx.save();
    mapCtx.strokeStyle = 'rgba(76, 154, 255, 0.1)';
    mapCtx.lineWidth = 1;
    
    const gridSize = 50;
    
    // Líneas verticales
    for (let x = 0; x <= mapCanvas.width; x += gridSize) {
        mapCtx.beginPath();
        mapCtx.moveTo(x, 0);
        mapCtx.lineTo(x, mapCanvas.height);
        mapCtx.stroke();
    }
    
    // Líneas horizontales
    for (let y = 0; y <= mapCanvas.height; y += gridSize) {
        mapCtx.beginPath();
        mapCtx.moveTo(0, y);
        mapCtx.lineTo(mapCanvas.width, y);
        mapCtx.stroke();
    }
    
    // Números de grid
    mapCtx.fillStyle = '#8b92a7';
    mapCtx.font = '10px Segoe UI';
    for (let x = gridSize; x <= mapCanvas.width; x += gridSize) {
        mapCtx.fillText(`${x / 10}m`, x - 10, 15);
    }
    for (let y = gridSize; y <= mapCanvas.height; y += gridSize) {
        mapCtx.fillText(`${y / 10}m`, 5, y + 5);
    }
    
    mapCtx.restore();
}

function drawPoints2D() {
    mapPoints.forEach(point => {
        const color = getRssiColor(point.rssi);
        
        // Círculo de cobertura
        mapCtx.save();
        const gradient = mapCtx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 60);
        gradient.addColorStop(0, color + '80');
        gradient.addColorStop(1, color + '00');
        mapCtx.fillStyle = gradient;
        mapCtx.beginPath();
        mapCtx.arc(point.x, point.y, 60, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.restore();
        
        // Punto central
        mapCtx.save();
        mapCtx.fillStyle = color;
        mapCtx.beginPath();
        mapCtx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.strokeStyle = '#e1e8f0';
        mapCtx.lineWidth = 2;
        mapCtx.stroke();
        mapCtx.restore();
        
        // Texto RSSI
        mapCtx.save();
        mapCtx.fillStyle = '#e1e8f0';
        mapCtx.font = 'bold 11px Segoe UI';
        mapCtx.textAlign = 'center';
        mapCtx.fillText(`${point.rssi}`, point.x, point.y - 15);
        mapCtx.restore();
    });
}

function drawHeatmap() {
    if (mapPoints.length === 0) return;
    
    const imageData = mapCtx.createImageData(mapCanvas.width, mapCanvas.height);
    const data = imageData.data;
    
    // Calcular heatmap
    for (let y = 0; y < mapCanvas.height; y++) {
        for (let x = 0; x < mapCanvas.width; x++) {
            let totalWeight = 0;
            let weightedRssi = 0;
            
            mapPoints.forEach(point => {
                const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                const weight = Math.max(0, 1 - distance / 150);
                
                if (weight > 0) {
                    totalWeight += weight;
                    weightedRssi += point.rssi * weight;
                }
            });
            
            if (totalWeight > 0) {
                const avgRssi = weightedRssi / totalWeight;
                const color = getRssiColorRGB(avgRssi);
                const alpha = Math.min(255, totalWeight * 200);
                
                const idx = (y * mapCanvas.width + x) * 4;
                data[idx] = color.r;
                data[idx + 1] = color.g;
                data[idx + 2] = color.b;
                data[idx + 3] = alpha;
            }
        }
    }
    
    mapCtx.putImageData(imageData, 0, 0);
    
    // Dibujar puntos encima
    mapPoints.forEach(point => {
        mapCtx.save();
        mapCtx.fillStyle = '#ffffff';
        mapCtx.strokeStyle = '#000000';
        mapCtx.lineWidth = 2;
        mapCtx.beginPath();
        mapCtx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.stroke();
        mapCtx.restore();
    });
}

function drawWalls() {
    mapCtx.save();
    mapCtx.strokeStyle = '#7f849c';
    mapCtx.lineWidth = 6;
    mapCtx.lineCap = 'round';
    
    mapWalls.forEach(wall => {
        mapCtx.beginPath();
        mapCtx.moveTo(wall.x1, wall.y1);
        mapCtx.lineTo(wall.x2, wall.y2);
        mapCtx.stroke();
    });
    
    mapCtx.restore();
}

function drawRouterIcon(x, y) {
    mapCtx.save();
    
    // Círculo base
    mapCtx.fillStyle = '#4c9aff';
    mapCtx.beginPath();
    mapCtx.arc(x, y, 15, 0, Math.PI * 2);
    mapCtx.fill();
    
    // Borde
    mapCtx.strokeStyle = '#e1e8f0';
    mapCtx.lineWidth = 2;
    mapCtx.stroke();
    
    // Símbolo WiFi
    mapCtx.strokeStyle = '#ffffff';
    mapCtx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
        mapCtx.beginPath();
        mapCtx.arc(x, y, i * 4, -Math.PI * 0.7, -Math.PI * 0.3);
        mapCtx.stroke();
    }
    
    // Texto
    mapCtx.fillStyle = '#e1e8f0';
    mapCtx.font = 'bold 10px Segoe UI';
    mapCtx.textAlign = 'center';
    mapCtx.fillText('Router', x, y + 30);
    
    mapCtx.restore();
}

function drawScale() {
    mapCtx.save();
    const x = mapCanvas.width - 150;
    const y = mapCanvas.height - 30;
    
    mapCtx.strokeStyle = '#e1e8f0';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(x, y);
    mapCtx.lineTo(x + 100, y);
    mapCtx.moveTo(x, y - 5);
    mapCtx.lineTo(x, y + 5);
    mapCtx.moveTo(x + 100, y - 5);
    mapCtx.lineTo(x + 100, y + 5);
    mapCtx.stroke();
    
    mapCtx.fillStyle = '#e1e8f0';
    mapCtx.font = '12px Segoe UI';
    mapCtx.textAlign = 'center';
    mapCtx.fillText('10 metros', x + 50, y - 10);
    
    mapCtx.restore();
}

function getRssiColor(rssi) {
    if (rssi >= -67) return '#51cf66';
    if (rssi >= -80) return '#ffd43b';
    if (rssi >= -90) return '#ff9f43';
    return '#ff6b6b';
}

function getRssiColorRGB(rssi) {
    if (rssi >= -67) return { r: 81, g: 207, b: 102 };
    if (rssi >= -80) return { r: 255, g: 212, b: 59 };
    if (rssi >= -90) return { r: 255, g: 159, b: 67 };
    return { r: 255, g: 107, b: 107 };
}

function changeMapMode() {
    mapMode = document.getElementById('mapMode').value;
    window.wallStart = null; // Reset wall drawing
    
    const labels = {
        'point': '📍 Modo: Marcar Puntos',
        'wall': '🧱 Modo: Agregar Paredes',
        'router': '📡 Modo: Ubicar Router'
    };
    
    document.getElementById('mapModeLabel').textContent = labels[mapMode];
}

function changeMapView() {
    mapView = document.getElementById('mapView').value;
    
    if (mapView === '3d') {
        init3DView();
    } else {
        document.getElementById('map3dContainer').style.display = 'none';
        mapCanvas.style.display = 'block';
        drawMap();
    }
}

function init3DView() {
    // Ocultar canvas 2D
    mapCanvas.style.display = 'none';
    const container = document.getElementById('map3dContainer');
    container.style.display = 'block';
    container.innerHTML = '';
    
    // Crear escena 3D
    map3dScene = new THREE.Scene();
    map3dScene.background = new THREE.Color(0x0a0e27);
    
    map3dCamera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    map3dCamera.position.set(6, 8, 10);
    map3dCamera.lookAt(0, 0, 0);
    
    map3dRenderer = new THREE.WebGLRenderer({ antialias: true });
    map3dRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(map3dRenderer.domElement);
    
    // Añadir luz
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    map3dScene.add(light);
    map3dScene.add(new THREE.AmbientLight(0x404040));
    
    // Añadir grid
    const gridHelper = new THREE.GridHelper(12, 12, 0x4c9aff, 0x2d3349);
    map3dScene.add(gridHelper);
    
    // Añadir puntos en 3D
    mapPoints.forEach(point => {
        const height = Math.abs(point.rssi + 100) / 10;
        const geometry = new THREE.CylinderGeometry(0.2, 0.2, height, 16);
        const color = new THREE.Color(getRssiColor(point.rssi));
        const material = new THREE.MeshPhongMaterial({ color });
        const cylinder = new THREE.Mesh(geometry, material);
        
        const x = (point.x / mapCanvas.width - 0.5) * 12;
        const z = (point.y / mapCanvas.height - 0.5) * 8;
        cylinder.position.set(x, height / 2, z);
        
        map3dScene.add(cylinder);
    });
    
    // Rotación automática
    function animate() {
        requestAnimationFrame(animate);
        map3dScene.rotation.y += 0.005;
        map3dRenderer.render(map3dScene, map3dCamera);
    }
    animate();
}

function toggleGrid() {
    showGrid = !showGrid;
    drawMap();
}

function startMapMonitoring() {
    if (!mapMonitoring) {
        mapMonitoring = true;
        
        // Si WiFi no está activo, activarlo
        if (!wifiMonitoring) {
            toggleWiFi();
        }
        
        alert('📍 Modo Mapeo Activado\n\nAhora camina por tu casa haciendo clic en el mapa para marcar tu ubicación.\nLa señal actual se guardará automáticamente.');
    } else {
        mapMonitoring = false;
        alert('Modo Mapeo Desactivado');
    }
}

function addManualPoint() {
    const rssi = prompt('Ingresa el valor RSSI (ej: -65):');
    if (rssi) {
        const rssiNum = parseInt(rssi);
        if (rssiNum && rssiNum >= -100 && rssiNum <= -30) {
            alert('Haz clic en el mapa para colocar el punto');
            const originalMode = mapMode;
            mapMode = 'point';
            
            const tempHandler = function(e) {
                const rect = mapCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                addMapPoint(x, y, rssiNum);
                mapMode = originalMode;
                mapCanvas.removeEventListener('click', tempHandler);
            };
            
            mapCanvas.addEventListener('click', tempHandler);
        } else {
            alert('RSSI inválido. Debe estar entre -100 y -30');
        }
    }
}

function clearMap() {
    if (confirm('¿Limpiar todo el mapa? Esto no se puede deshacer.')) {
        mapPoints = [];
        mapWalls = [];
        mapRouter = null;
        updateMapStats();
        drawMap();
    }
}

function exportMap() {
    // Exportar como imagen
    const link = document.createElement('a');
    link.download = `mapa_cobertura_${Date.now()}.png`;
    link.href = mapCanvas.toDataURL();
    link.click();
    
    // También exportar datos JSON
    const mapData = {
        points: mapPoints,
        walls: mapWalls,
        router: mapRouter,
        timestamp: new Date().toISOString(),
        ssid: wifiData.length > 0 ? wifiData[0].ssid : 'N/A'
    };
    
    const jsonBlob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.download = `mapa_datos_${Date.now()}.json`;
    jsonLink.href = jsonUrl;
    jsonLink.click();
    
    alert('✓ Mapa exportado:\n- Imagen PNG\n- Datos JSON');
}

function updateMapStats() {
    document.getElementById('mapPoints').textContent = mapPoints.length;
    document.getElementById('totalMapPoints').textContent = mapPoints.length;
    
    if (mapPoints.length > 0) {
        const avgRssi = mapPoints.reduce((sum, p) => sum + p.rssi, 0) / mapPoints.length;
        document.getElementById('mapAvgRssi').textContent = avgRssi.toFixed(1) + ' dBm';
        
        const bestPoint = mapPoints.reduce((best, p) => p.rssi > best.rssi ? p : best);
        document.getElementById('mapBestZone').textContent = 
            `(${Math.floor(bestPoint.x)}, ${Math.floor(bestPoint.y)}) - ${bestPoint.rssi} dBm`;
        
        // Calcular área aproximada (grid de 50px = 5m)
        const area = mapPoints.length * 25; // Cada punto cubre ~25m²
        document.getElementById('mapArea').textContent = area + ' m²';
    }
}
