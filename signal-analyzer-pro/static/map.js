// Mapa de Cobertura PREMIUM - Signal Analyzer Pro

let mapCanvas, mapCtx;
let mapPoints = [];
let mapWalls = [];
let mapRouter = null;
let mapMode = 'point';
let mapView = '2d';
let showGrid = true;
let mapMonitoring = false;
let map3dScene, map3dCamera, map3dRenderer, map3dControls;
let animationFrameId = null;

// Configuración del canvas
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const GRID_SIZE = 50; // 50px = 5 metros

// ============================================
// INICIALIZACIÓN
// ============================================
// ===== FUNCIONES NUEVAS PARA LA INTERFAZ MEJORADA =====

function selectMapMode(mode) {
    // Actualizar botones
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const btn = document.querySelector(`[data-mode="${mode}"]`);
    if (btn) btn.classList.add('active');
    
    // Actualizar modo
    mapMode = mode;
    window.wallStart = null;
    
    // Actualizar indicador
    const modeLabels = {
        'point': '📍 Modo: Marcar Punto',
        'router': '📡 Modo: Ubicar Router',
        'wall': '🧱 Modo: Agregar Pared'
    };
    const modeEl = document.getElementById('currentMode');
    if (modeEl) modeEl.textContent = modeLabels[mode];
    
    if (typeof showNotification === 'function') {
        showNotification('Modo Cambiado', modeLabels[mode], 'info');
    }
}

function selectMapView(view) {
    // Actualizar tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const tab = document.querySelector(`[data-view="${view}"]`);
    if (tab) tab.classList.add('active');
    
    // Cambiar vista
    if (view === '3d') {
        if (typeof init3DView === 'function') init3DView();
    } else {
        mapView = view;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        const container3d = document.getElementById('map3dContainer');
        if (container3d) container3d.style.display = 'none';
        if (mapCanvas) {
            mapCanvas.style.display = 'block';
            drawMap();
        }
    }
    
    const viewNames = {'2d': 'Mapa 2D', 'heatmap': 'Mapa de Calor', '3d': 'Vista 3D'};
    if (typeof showNotification === 'function') {
        showNotification('Vista Cambiada', viewNames[view], 'success');
    }
}

// Controles de zoom
let mapScale = 1;
function zoomIn() {
    mapScale = Math.min(mapScale + 0.2, 3);
    if (mapCanvas) {
        mapCanvas.style.transform = `scale(${mapScale})`;
    }
    if (typeof showNotification === 'function') {
        showNotification('Zoom', `${(mapScale * 100).toFixed(0)}%`, 'info');
    }
}

function zoomOut() {
    mapScale = Math.max(mapScale - 0.2, 0.5);
    if (mapCanvas) {
        mapCanvas.style.transform = `scale(${mapScale})`;
    }
    if (typeof showNotification === 'function') {
        showNotification('Zoom', `${(mapScale * 100).toFixed(0)}%`, 'info');
    }
}

function resetView() {
    mapScale = 1;
    if (mapCanvas) {
        mapCanvas.style.transform = 'scale(1)';
    }
    if (typeof showNotification === 'function') {
        showNotification('Vista Restablecida', 'Zoom al 100%', 'info');
    }
}

function fullscreenMap() {
    const container = document.querySelector('.map-main-area');
    if (container) {
        if (!document.fullscreenElement) {
            container.requestFullscreen();
            if (typeof showNotification === 'function') {
                showNotification('Pantalla Completa', 'Presiona ESC para salir', 'info');
            }
        } else {
            document.exitFullscreen();
        }
    }
}


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
    mapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Dibujar grid inicial
    drawMap();
}

// ============================================
// CAMBIO DE TABS
// ============================================

function switchTab(tab) {
    // Cambiar tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tab === 'monitor') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-monitor').classList.add('active');
        
        // Detener animación 3D si estaba activa
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    } else if (tab === 'map') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-map').classList.add('active');
        
        // Redibujar mapa al cambiar de tab
        setTimeout(() => {
            drawMap();
        }, 100);
    }
}

// ============================================
// MANEJO DE EVENTOS DEL MAPA
// ============================================

function handleMapClick(event) {
    const rect = mapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    if (mapMode === 'point') {
        // Obtener RSSI actual
        const currentRssi = wifiMonitoring && wifiData.length > 0 ? 
                           wifiData[wifiData.length - 1].rssi : -70;
        
        addMapPoint(x, y, currentRssi);
        showNotification('📍 Punto Agregado', `RSSI: ${currentRssi} dBm`, 'success');
        
    } else if (mapMode === 'router') {
        mapRouter = { x, y };
        drawMap();
        showNotification('📡 Router Ubicado', 'Posición del router establecida', 'success');
        
    } else if (mapMode === 'wall') {
        // Agregar pared (requiere dos clics)
        if (!window.wallStart) {
            window.wallStart = { x, y };
            showNotification('🧱 Pared', 'Haz clic en el punto final', 'info');
        } else {
            mapWalls.push({
                x1: window.wallStart.x,
                y1: window.wallStart.y,
                x2: x,
                y2: y
            });
            window.wallStart = null;
            drawMap();
            showNotification('🧱 Pared Agregada', 'Pared añadida al mapa', 'success');
        }
    }
}

function handleMapMouseMove(event) {
    const rect = mapCanvas.getBoundingClientRect();
    const x = Math.floor(event.clientX - rect.left);
    const y = Math.floor(event.clientY - rect.top);
    
    // Convertir a metros
    const metersX = (x / GRID_SIZE * 5).toFixed(1);
    const metersY = (y / GRID_SIZE * 5).toFixed(1);
    
    document.getElementById('mapCoords').textContent = `X: ${metersX}m, Y: ${metersY}m`;
    
    // Mostrar preview de pared
    if (mapMode === 'wall' && window.wallStart) {
        drawMap();
        mapCtx.save();
        mapCtx.strokeStyle = '#ffd43b';
        mapCtx.lineWidth = 4;
        mapCtx.setLineDash([10, 10]);
        mapCtx.beginPath();
        mapCtx.moveTo(window.wallStart.x, window.wallStart.y);
        mapCtx.lineTo(x, y);
        mapCtx.stroke();
        mapCtx.restore();
    }
}

// ============================================
// FUNCIONES DE DIBUJO 2D
// ============================================

function addMapPoint(x, y, rssi) {
    mapPoints.push({ 
        x, 
        y, 
        rssi, 
        timestamp: Date.now(),
        ssid: wifiData.length > 0 ? wifiData[0].ssid : 'N/A'
    });
    updateMapStats();
    drawMap();
}

function drawMap() {
    if (!mapCtx) return;
    
    // Limpiar canvas
    mapCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card') || '#0a0e27';
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
    
    // Dibujar líneas de cobertura desde router
    if (mapRouter && mapPoints.length > 0) {
        drawCoverageLines();
    }
    
    // Dibujar leyenda de escala
    drawScale();
}

function drawGrid() {
    mapCtx.save();
    mapCtx.strokeStyle = 'rgba(76, 154, 255, 0.15)';
    mapCtx.lineWidth = 1;
    
    // Líneas verticales
    for (let x = 0; x <= mapCanvas.width; x += GRID_SIZE) {
        mapCtx.beginPath();
        mapCtx.moveTo(x, 0);
        mapCtx.lineTo(x, mapCanvas.height);
        mapCtx.stroke();
    }
    
    // Líneas horizontales
    for (let y = 0; y <= mapCanvas.height; y += GRID_SIZE) {
        mapCtx.beginPath();
        mapCtx.moveTo(0, y);
        mapCtx.lineTo(mapCanvas.width, y);
        mapCtx.stroke();
    }
    
    // Números de grid
    mapCtx.fillStyle = '#8b92a7';
    mapCtx.font = 'bold 11px Segoe UI';
    
    // Etiquetas X
    for (let x = GRID_SIZE; x <= mapCanvas.width; x += GRID_SIZE) {
        const meters = (x / GRID_SIZE * 5);
        mapCtx.fillText(`${meters}m`, x - 12, 15);
    }
    
    // Etiquetas Y
    for (let y = GRID_SIZE; y <= mapCanvas.height; y += GRID_SIZE) {
        const meters = (y / GRID_SIZE * 5);
        mapCtx.fillText(`${meters}m`, 5, y + 5);
    }
    
    mapCtx.restore();
}

function drawPoints2D() {
    mapPoints.forEach(point => {
        const color = getRssiColor(point.rssi);
        
        // Círculo de cobertura con gradiente mejorado
        mapCtx.save();
        const radius = Math.min(80, Math.abs(point.rssi + 30) * 2);
        const gradient = mapCtx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        gradient.addColorStop(0, color + 'CC');
        gradient.addColorStop(0.5, color + '66');
        gradient.addColorStop(1, color + '00');
        mapCtx.fillStyle = gradient;
        mapCtx.beginPath();
        mapCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.restore();
        
        // Punto central con borde brillante
        mapCtx.save();
        mapCtx.fillStyle = color;
        mapCtx.beginPath();
        mapCtx.arc(point.x, point.y, 10, 0, Math.PI * 2);
        mapCtx.fill();
        
        // Borde exterior
        mapCtx.strokeStyle = '#ffffff';
        mapCtx.lineWidth = 3;
        mapCtx.stroke();
        
        // Borde interior brillante
        mapCtx.strokeStyle = color;
        mapCtx.lineWidth = 2;
        mapCtx.stroke();
        mapCtx.restore();
        
        // Texto RSSI con sombra
        mapCtx.save();
        mapCtx.font = 'bold 13px Segoe UI';
        mapCtx.textAlign = 'center';
        
        // Sombra del texto
        mapCtx.fillStyle = '#000000';
        mapCtx.globalAlpha = 0.5;
        mapCtx.fillText(`${point.rssi}`, point.x + 1, point.y - 18);
        
        // Texto principal
        mapCtx.globalAlpha = 1;
        mapCtx.fillStyle = '#ffffff';
        mapCtx.fillText(`${point.rssi}`, point.x, point.y - 19);
        
        // Unidad
        mapCtx.font = '10px Segoe UI';
        mapCtx.fillStyle = '#8b92a7';
        mapCtx.fillText('dBm', point.x, point.y - 6);
        mapCtx.restore();
    });
}

function drawHeatmap() {
    if (mapPoints.length === 0) return;
    
    const imageData = mapCtx.createImageData(mapCanvas.width, mapCanvas.height);
    const data = imageData.data;
    
    // Calcular heatmap con interpolación mejorada
    for (let y = 0; y < mapCanvas.height; y += 2) {
        for (let x = 0; x < mapCanvas.width; x += 2) {
            let totalWeight = 0;
            let weightedRssi = 0;
            
            mapPoints.forEach(point => {
                const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                
                // Función de peso exponencial para suavizado mejor
                const weight = Math.max(0, Math.exp(-distance / 100));
                
                if (weight > 0.01) {
                    totalWeight += weight;
                    weightedRssi += point.rssi * weight;
                }
            });
            
            if (totalWeight > 0) {
                const avgRssi = weightedRssi / totalWeight;
                const color = getRssiColorRGB(avgRssi);
                const alpha = Math.min(255, totalWeight * 180);
                
                // Pintar pixel y vecinos para suavizado
                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        const idx = ((y + dy) * mapCanvas.width + (x + dx)) * 4;
                        if (idx < data.length) {
                            data[idx] = color.r;
                            data[idx + 1] = color.g;
                            data[idx + 2] = color.b;
                            data[idx + 3] = alpha;
                        }
                    }
                }
            }
        }
    }
    
    mapCtx.putImageData(imageData, 0, 0);
    
    // Dibujar puntos encima
    mapPoints.forEach(point => {
        mapCtx.save();
        
        // Punto con borde
        mapCtx.fillStyle = '#ffffff';
        mapCtx.strokeStyle = '#000000';
        mapCtx.lineWidth = 3;
        mapCtx.beginPath();
        mapCtx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.stroke();
        
        // Punto interior
        mapCtx.fillStyle = getRssiColor(point.rssi);
        mapCtx.beginPath();
        mapCtx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        mapCtx.fill();
        
        mapCtx.restore();
    });
}

function drawWalls() {
    mapCtx.save();
    mapCtx.strokeStyle = '#7f849c';
    mapCtx.lineWidth = 8;
    mapCtx.lineCap = 'round';
    
    // Sombra de paredes
    mapCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    mapCtx.shadowBlur = 10;
    mapCtx.shadowOffsetX = 3;
    mapCtx.shadowOffsetY = 3;
    
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
    
    // Círculo base con gradiente
    const gradient = mapCtx.createRadialGradient(x, y, 0, x, y, 25);
    gradient.addColorStop(0, '#4c9aff');
    gradient.addColorStop(1, '#2d5a9e');
    mapCtx.fillStyle = gradient;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 20, 0, Math.PI * 2);
    mapCtx.fill();
    
    // Borde
    mapCtx.strokeStyle = '#e1e8f0';
    mapCtx.lineWidth = 3;
    mapCtx.stroke();
    
    // Símbolo WiFi animado
    mapCtx.strokeStyle = '#ffffff';
    mapCtx.lineWidth = 2.5;
    for (let i = 1; i <= 3; i++) {
        mapCtx.beginPath();
        mapCtx.arc(x, y + 2, i * 5, -Math.PI * 0.7, -Math.PI * 0.3);
        mapCtx.stroke();
    }
    
    // Punto central
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.arc(x, y + 2, 2, 0, Math.PI * 2);
    mapCtx.fill();
    
    // Texto con sombra
    mapCtx.font = 'bold 12px Segoe UI';
    mapCtx.textAlign = 'center';
    mapCtx.fillStyle = '#000000';
    mapCtx.globalAlpha = 0.5;
    mapCtx.fillText('Router', x + 1, y + 36);
    mapCtx.globalAlpha = 1;
    mapCtx.fillStyle = '#e1e8f0';
    mapCtx.fillText('Router', x, y + 35);
    
    mapCtx.restore();
}

function drawCoverageLines() {
    mapCtx.save();
    mapCtx.strokeStyle = 'rgba(76, 154, 255, 0.2)';
    mapCtx.lineWidth = 1;
    mapCtx.setLineDash([5, 5]);
    
    mapPoints.forEach(point => {
        mapCtx.beginPath();
        mapCtx.moveTo(mapRouter.x, mapRouter.y);
        mapCtx.lineTo(point.x, point.y);
        mapCtx.stroke();
    });
    
    mapCtx.restore();
}

function drawScale() {
    mapCtx.save();
    const x = mapCanvas.width - 180;
    const y = mapCanvas.height - 40;
    
    // Fondo
    mapCtx.fillStyle = 'rgba(26, 31, 58, 0.8)';
    mapCtx.fillRect(x - 10, y - 25, 170, 35);
    
    // Línea de escala
    mapCtx.strokeStyle = '#4c9aff';
    mapCtx.lineWidth = 3;
    mapCtx.beginPath();
    mapCtx.moveTo(x, y);
    mapCtx.lineTo(x + 100, y);
    mapCtx.moveTo(x, y - 8);
    mapCtx.lineTo(x, y + 8);
    mapCtx.moveTo(x + 100, y - 8);
    mapCtx.lineTo(x + 100, y + 8);
    mapCtx.stroke();
    
    // Texto
    mapCtx.fillStyle = '#e1e8f0';
    mapCtx.font = 'bold 13px Segoe UI';
    mapCtx.textAlign = 'center';
    mapCtx.fillText('10 metros', x + 50, y - 12);
    
    mapCtx.restore();
}

// ============================================
// VISTA 3D MEJORADA
// ============================================

function init3DView() {
    mapCanvas.style.display = 'none';
    const container = document.getElementById('map3dContainer');
    container.style.display = 'block';
    container.innerHTML = '';

    // Crear escena 3D
    map3dScene = new THREE.Scene();
    map3dScene.background = new THREE.Color(0x0a0e27);

    // Cámara con mejor perspectiva
    const aspect = container.clientWidth / container.clientHeight;
    map3dCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    map3dCamera.position.set(10, 12, 10);
    map3dCamera.lookAt(0, 0, 0);

    // Renderer con mejor calidad
    map3dRenderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        powerPreference: "high-performance"
    });
    map3dRenderer.setSize(container.clientWidth, container.clientHeight);
    map3dRenderer.setPixelRatio(window.devicePixelRatio);
    map3dRenderer.shadowMap.enabled = true;
    map3dRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(map3dRenderer.domElement);

    // AGREGAR CONTROLES INTERACTIVOS (OrbitControls)
    // Nota: Necesitas incluir OrbitControls en el HTML
    // <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    
    if (typeof THREE.OrbitControls !== 'undefined') {
        map3dControls = new THREE.OrbitControls(map3dCamera, map3dRenderer.domElement);
        map3dControls.enableDamping = true;
        map3dControls.dampingFactor = 0.05;
        map3dControls.minDistance = 5;
        map3dControls.maxDistance = 50;
        map3dControls.maxPolarAngle = Math.PI / 2;
    }

    // Iluminación mejorada
    const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
    map3dScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(15, 25, 15);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 50;
    map3dScene.add(directionalLight);

    // Grid mejorado
    const gridHelper = new THREE.GridHelper(20, 20, 0x4c9aff, 0x2d3349);
    map3dScene.add(gridHelper);

    // Plano base
    const planeGeometry = new THREE.PlaneGeometry(20, 15);
    const planeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1f3a, 
        opacity: 0.5, 
        transparent: true 
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    map3dScene.add(plane);

    // Añadir puntos 3D
    mapPoints.forEach(point => {
        const height = Math.abs(point.rssi + 100) / 8;
        const geometry = new THREE.CylinderGeometry(0.3, 0.3, height, 32);
        const color = new THREE.Color(getRssiColor(point.rssi));
        const material = new THREE.MeshPhongMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const cylinder = new THREE.Mesh(geometry, material);
        cylinder.castShadow = true;
        cylinder.receiveShadow = true;

        const x = (point.x / mapCanvas.width - 0.5) * 20;
        const z = (point.y / mapCanvas.height - 0.5) * 15;
        cylinder.position.set(x, height / 2, z);
        
        map3dScene.add(cylinder);
    });

    // Paredes 3D
    mapWalls.forEach(wall => {
        const length = Math.sqrt((wall.x2 - wall.x1) ** 2 + (wall.y2 - wall.y1) ** 2) / 60;
        const geometry = new THREE.BoxGeometry(length, 2.5, 0.2);
        const material = new THREE.MeshPhongMaterial({
            color: 0x7f849c,
            transparent: true,
            opacity: 0.8
        });
        const wallMesh = new THREE.Mesh(geometry, material);
        wallMesh.castShadow = true;

        const x1 = (wall.x1 / mapCanvas.width - 0.5) * 20;
        const z1 = (wall.y1 / mapCanvas.height - 0.5) * 15;
        const x2 = (wall.x2 / mapCanvas.width - 0.5) * 20;
        const z2 = (wall.y2 / mapCanvas.height - 0.5) * 15;

        wallMesh.position.set((x1 + x2) / 2, 1.25, (z1 + z2) / 2);
        const angle = Math.atan2(z2 - z1, x2 - x1);
        wallMesh.rotation.y = -angle;

        map3dScene.add(wallMesh);
    });

    // Router 3D mejorado
    if (mapRouter) {
        const routerGroup = new THREE.Group();
        
        // Esfera principal
        const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
        const sphereMaterial = new THREE.MeshPhongMaterial({
            color: 0x4c9aff,
            emissive: 0x4c9aff,
            emissiveIntensity: 0.5
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.castShadow = true;
        routerGroup.add(sphere);

        // Anillos de señal
        for (let i = 1; i <= 3; i++) {
            const ringGeometry = new THREE.TorusGeometry(i * 0.4, 0.05, 16, 100);
            const ringMaterial = new THREE.MeshPhongMaterial({
                color: 0x4c9aff,
                transparent: true,
                opacity: 0.6 - i * 0.15
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2;
            routerGroup.add(ring);
        }

        const x = (mapRouter.x / mapCanvas.width - 0.5) * 20;
        const z = (mapRouter.y / mapCanvas.height - 0.5) * 15;
        routerGroup.position.set(x, 1.5, z);
        
        map3dScene.add(routerGroup);
    }

    // Animación suave
    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        
        if (map3dControls) {
            map3dControls.update();
        }
        
        map3dRenderer.render(map3dScene, map3dCamera);
    }

    animate();

    // Responsive
    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        map3dCamera.aspect = width / height;
        map3dCamera.updateProjectionMatrix();
        map3dRenderer.setSize(width, height);
    });

    showNotification('🎮 Vista 3D Interactiva', 'Usa el mouse para rotar y zoom', 'success');
}

// ============================================
// CONTROLES DEL MAPA
// ============================================

function changeMapMode() {
    mapMode = document.getElementById('mapMode').value;
    window.wallStart = null; // Reset wall drawing
    
    const labels = {
        'point': '📍 Modo: Marcar Puntos',
        'wall': '🧱 Modo: Agregar Paredes',
        'router': '📡 Modo: Ubicar Router'
    };
    
    document.getElementById('mapModeLabel').textContent = labels[mapMode];
    showNotification('🛠️ Modo Cambiado', labels[mapMode], 'info');
}

function changeMapView() {
    const newView = document.getElementById('mapView').value;
    
    if (newView === '3d') {
        mapView = newView;
        init3DView();
    } else {
        mapView = newView;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        document.getElementById('map3dContainer').style.display = 'none';
        mapCanvas.style.display = 'block';
        drawMap();
        
        const viewNames = {
            '2d': '🗺️ Mapa 2D',
            'heatmap': '🌡️ Mapa de Calor'
        };
        showNotification('👁️ Vista Cambiada', viewNames[newView], 'info');
    }
}

function toggleGrid() {
    showGrid = !showGrid;
    drawMap();
    showNotification('📏 Grid', showGrid ? 'Activado' : 'Desactivado', 'info');
}

function startMapMonitoring() {
    mapMonitoring = !mapMonitoring;
    
    if (mapMonitoring) {
        // Si WiFi no está activo, activarlo
        if (!wifiMonitoring) {
            toggleWiFi();
        }
        
        showNotification(
            '📍 Mapeo Activo', 
            'Haz clic en el mapa para marcar ubicación',
            'success'
        );
    } else {
        showNotification('📍 Mapeo', 'Desactivado', 'info');
    }
}

function addManualPoint() {
    const rssi = prompt('Ingresa el valor RSSI (ej: -65):');
    if (rssi) {
        const rssiNum = parseInt(rssi);
        if (rssiNum && rssiNum >= -100 && rssiNum <= -30) {
            showNotification('📍 Punto Manual', 'Haz clic en el mapa para colocar el punto', 'info');
            
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
            showNotification('❌ Error', 'RSSI inválido. Debe estar entre -100 y -30', 'error');
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
        showNotification('🗑️ Mapa Limpiado', 'Todos los datos del mapa eliminados', 'info');
    }
}

function exportMap() {
    // Exportar como imagen PNG
    const link = document.createElement('a');
    link.download = `mapa_cobertura_${Date.now()}.png`;
    link.href = mapCanvas.toDataURL('image/png', 1.0);
    link.click();
    
    // También exportar datos JSON
    const mapData = {
        points: mapPoints,
        walls: mapWalls,
        router: mapRouter,
        timestamp: new Date().toISOString(),
        ssid: wifiData.length > 0 ? wifiData[0].ssid : 'N/A',
        stats: {
            totalPoints: mapPoints.length,
            avgRssi: mapPoints.length > 0 ? 
                    (mapPoints.reduce((sum, p) => sum + p.rssi, 0) / mapPoints.length).toFixed(1) : 0
        }
    };
    
    const jsonBlob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.download = `mapa_datos_${Date.now()}.json`;
    jsonLink.href = jsonUrl;
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);
    
    showNotification('💾 Exportado', 'Mapa guardado en PNG y JSON', 'success');
}

function updateMapStats() {
    document.getElementById('mapPoints').textContent = mapPoints.length;
    document.getElementById('totalMapPoints').textContent = mapPoints.length;
    
    if (mapPoints.length > 0) {
        const avgRssi = mapPoints.reduce((sum, p) => sum + p.rssi, 0) / mapPoints.length;
        document.getElementById('mapAvgRssi').textContent = avgRssi.toFixed(1) + ' dBm';
        
        const bestPoint = mapPoints.reduce((best, p) => p.rssi > best.rssi ? p : best);
        const metersX = (bestPoint.x / GRID_SIZE * 5).toFixed(1);
        const metersY = (bestPoint.y / GRID_SIZE * 5).toFixed(1);
        document.getElementById('mapBestZone').textContent = 
            `(${metersX}m, ${metersY}m) - ${bestPoint.rssi} dBm`;
        
        // Calcular área aproximada (cada punto cubre ~25m²)
        const area = mapPoints.length * 25;
        document.getElementById('mapArea').textContent = area + ' m²';
    } else {
        document.getElementById('mapAvgRssi').textContent = '-- dBm';
        document.getElementById('mapBestZone').textContent = '--';
        document.getElementById('mapArea').textContent = '0 m²';
    }
}

// ============================================
// UTILIDADES DE COLOR
// ============================================

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

// ===== PREDICCIÓN DE COBERTURA =====
function predictCoverage() {
    if (!mapRouter || mapPoints.length === 0) {
        showNotification('⚠️ Configurar', 'Primero ubica el router y marca algunos puntos', 'warning');
        return;
    }
    
    // Algoritmo de predicción simple
    const predictions = [];
    for (let x = 0; x < mapCanvas.width; x += 30) {
        for (let y = 0; y < mapCanvas.height; y += 30) {
            const distance = Math.sqrt(
                Math.pow(x - mapRouter.x, 2) + 
                Math.pow(y - mapRouter.y, 2)
            );
            
            // RSSI base menos pérdida por distancia
            let predictedRssi = -30 - (distance / 10);
            
            // Penalización por paredes
            mapWalls.forEach(wall => {
                if (lineIntersectsWall(mapRouter.x, mapRouter.y, x, y, wall)) {
                    predictedRssi -= 15; // -15 dBm por cada pared
                }
            });
            
            predictions.push({
                x, 
                y, 
                rssi: Math.max(predictedRssi, -100)
            });
        }
    }
    
    // Dibujar predicciones con transparencia
    mapCtx.save();
    predictions.forEach(pred => {
        const color = getRssiColor(pred.rssi);
        mapCtx.fillStyle = color + '40'; // 40 = 25% opacity
        mapCtx.fillRect(pred.x - 15, pred.y - 15, 30, 30);
    });
    mapCtx.restore();
    
    showNotification('🎯 Predicción Calculada', 
        `${predictions.length} puntos predichos`, 
        'success');
}

function lineIntersectsWall(x1, y1, x2, y2, wall) {
    // Algoritmo de intersección de segmentos de línea
    const denom = ((wall.y2 - wall.y1) * (x2 - x1)) - ((wall.x2 - wall.x1) * (y2 - y1));
    if (denom === 0) return false;
    
    const ua = (((wall.x2 - wall.x1) * (y1 - wall.y1)) - ((wall.y2 - wall.y1) * (x1 - wall.x1))) / denom;
    const ub = (((x2 - x1) * (y1 - wall.y1)) - ((y2 - y1) * (x1 - wall.x1))) / denom;
    
    return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
}

// Agregar botón de predicción si no existe
document.addEventListener('DOMContentLoaded', function() {
    const mapControls = document.querySelector('.map-controls');
    if (mapControls) {
        const predictBtn = document.createElement('button');
        predictBtn.className = 'btn btn-secondary';
        predictBtn.textContent = '🎯 Predecir Cobertura';
        predictBtn.onclick = predictCoverage;
        mapControls.appendChild(predictBtn);
    }
});

console.log('✅ Funcionalidad de predicción de cobertura cargada');

// AGREGAR a map.js:
function predictCoverage() {
    if (!mapRouter || mapWalls.length === 0) {
        showNotification('⚠️ Configurar', 'Ubica el router y agrega paredes primero', 'warning');
        return;
    }
    
    // Algoritmo simple de predicción
    const predictions = [];
    for (let x = 0; x < mapCanvas.width; x += 20) {
        for (let y = 0; y < mapCanvas.height; y += 20) {
            const distance = Math.sqrt(
                Math.pow(x - mapRouter.x, 2) + 
                Math.pow(y - mapRouter.y, 2)
            );
            
            // RSSI base - pérdida por distancia
            let predictedRssi = -30 - (distance / 10);
            
            // Penalización por paredes
            mapWalls.forEach(wall => {
                if (lineIntersectsWall(mapRouter.x, mapRouter.y, x, y, wall)) {
                    predictedRssi -= 15; // -15 dBm por pared
                }
            });
            
            predictions.push({x, y, rssi: Math.max(predictedRssi, -100)});
        }
    }
    
    // Dibujar predicciones
    predictions.forEach(pred => {
        const color = getRssiColor(pred.rssi);
        mapCtx.fillStyle = color + '33';
        mapCtx.fillRect(pred.x - 10, pred.y - 10, 20, 20);
    });
    
    showNotification('🎯 Predicción', 'Cobertura estimada calculada', 'success');
}

function lineIntersectsWall(x1, y1, x2, y2, wall) {
    // Algoritmo de intersección de líneas
    const denom = ((wall.y2 - wall.y1) * (x2 - x1)) - ((wall.x2 - wall.x1) * (y2 - y1));
    if (denom === 0) return false;
    
    const ua = (((wall.x2 - wall.x1) * (y1 - wall.y1)) - ((wall.y2 - wall.y1) * (x1 - wall.x1))) / denom;
    const ub = (((x2 - x1) * (y1 - wall.y1)) - ((y2 - y1) * (x1 - wall.x1))) / denom;
    
    return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
}
