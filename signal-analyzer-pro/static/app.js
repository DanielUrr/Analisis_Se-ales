// Signal Analyzer Pro - PREMIUM EDITION

let socket = null;
let wifiMonitoring = false;
let btMonitoring = false;
let wifiStartTime = null;
let sessionStartTime = Date.now();
let wifiData = [];
let wifiInterval = 500;
let btInterval = 2000;
let ultraFastMode = false;
let bluetoothDevices = new Map();
let markers = [];
let btChart;
let btDeviceHistory = [];

let wifiChart, waveChart, histChart;

// Sistema de Temas
let currentTheme = localStorage.getItem('theme') || 'dark';

// Sistema de Notificaciones
let notificationsEnabled = false;

document.addEventListener('DOMContentLoaded', function() {
    initThemeSystem();
    initWebSocket();
    initCharts();
    initSliders();
    startSessionTimer();
    requestNotificationPermission();
});

// ============================================
// SISTEMA DE TEMAS
// ============================================

function initThemeSystem() {
    // Aplicar tema guardado
    applyTheme(currentTheme);
    
    // Crear selector de temas
    const themeToggle = document.createElement('div');
    themeToggle.className = 'theme-toggle';
    themeToggle.innerHTML = `
        <button class="theme-btn ${currentTheme === 'dark' ? 'active' : ''}" onclick="changeTheme('dark')" title="Modo Oscuro">🌙</button>
        <button class="theme-btn ${currentTheme === 'light' ? 'active' : ''}" onclick="changeTheme('light')" title="Modo Claro">☀️</button>
        <button class="theme-btn ${currentTheme === 'cyberpunk' ? 'active' : ''}" onclick="changeTheme('cyberpunk')" title="Cyberpunk">🌆</button>
        <button class="theme-btn ${currentTheme === 'matrix' ? 'active' : ''}" onclick="changeTheme('matrix')" title="Matrix">💚</button>
        <button class="theme-btn ${currentTheme === 'sunset' ? 'active' : ''}" onclick="changeTheme('sunset')" title="Sunset">🌅</button>
    `;
    
    // Agregar al header EN EL CENTRO (después del h1, antes del header-info)
    const header = document.querySelector('.header');
    const headerInfo = document.querySelector('.header-info');
    if (header && headerInfo) {
        header.insertBefore(themeToggle, headerInfo);
    }
}

function changeTheme(theme) {
    currentTheme = theme;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
    
    // Actualizar botones activos
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Notificación
    showNotification('🎨 Tema Cambiado', `Tema ${theme} activado`);
}

function applyTheme(theme) {
    document.body.className = '';
    
    switch(theme) {
        case 'light':
            document.body.classList.add('light-mode');
            break;
        case 'cyberpunk':
            document.body.classList.add('theme-cyberpunk');
            break;
        case 'matrix':
            document.body.classList.add('theme-matrix');
            break;
        case 'sunset':
            document.body.classList.add('theme-sunset');
            break;
        default:
            // Dark mode (default)
            break;
    }
}

// ============================================
// SISTEMA DE NOTIFICACIONES
// ============================================

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                notificationsEnabled = true;
                showNotification('✅ Notificaciones Activadas', 'Recibirás alertas importantes');
            }
        });
    } else if (Notification.permission === "granted") {
        notificationsEnabled = true;
    }
}

function showNotification(title, message, type = 'info') {
    // Notificación del navegador
    if (notificationsEnabled && Notification.permission === "granted") {
        new Notification(title, {
            body: message,
            icon: '/static/icon.png',
            badge: '/static/badge.png'
        });
    }
    
    // Toast notification en pantalla
    showToast(title, message, type);
}

function showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let bgColor = 'linear-gradient(135deg, #4c9aff 0%, #9775fa 100%)';
    if (type === 'success') bgColor = 'linear-gradient(135deg, #51cf66 0%, #37b24d 100%)';
    if (type === 'warning') bgColor = 'linear-gradient(135deg, #ffd43b 0%, #fab005 100%)';
    if (type === 'error') bgColor = 'linear-gradient(135deg, #ff6b6b 0%, #fa5252 100%)';
    
    toast.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 12px 18px;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(76, 154, 255, 0.4);
        z-index: 10000;
        max-width: 350px;
        animation: slideInRight 0.4s ease;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        font-size: 0.9rem;
    `;
    
    toast.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 3px; font-size: 0.95rem;">${title}</div>
        <div style="font-size: 0.85rem; opacity: 0.95;">${message}</div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// ============================================
// WEBSOCKET
// ============================================

function initWebSocket() {
    socket = io('http://localhost:5000');
    
    socket.on('connect', () => {
        console.log('✓ Conectado al servidor');
        updateConnectionStatus(true);
        showNotification('🔌 Conectado', 'Servidor conectado exitosamente', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('✗ Desconectado del servidor');
        updateConnectionStatus(false);
        showNotification('⚠️ Desconectado', 'Servidor desconectado', 'warning');
    });
    
    socket.on('status', (data) => {
        document.getElementById('systemInfo').textContent = `Sistema: ${data.sistema}`;
    });
    
    socket.on('wifi_data', (data) => {
        handleWiFiData(data);
    });
    
    socket.on('wifi_error', (data) => {
        console.error('Error WiFi:', data.error);
        showNotification('❌ Error WiFi', data.error, 'error');
    });
    
    socket.on('wifi_started', (data) => {
        if (data.status === 'success') {
            wifiMonitoring = true;
            wifiStartTime = Date.now();
            document.getElementById('wifiStatus').textContent = '✓ Activo';
            document.getElementById('wifiBtnStart').textContent = '⏸ Detener WiFi';
            document.getElementById('wifiBtnStart').className = 'btn btn-danger';
            showNotification('📡 WiFi Monitor', 'Monitoreo iniciado', 'success');
        }
    });
    
    socket.on('wifi_stopped', () => {
        wifiMonitoring = false;
        document.getElementById('wifiStatus').textContent = 'Detenido';
        document.getElementById('wifiBtnStart').textContent = '▶ Iniciar WiFi';
        document.getElementById('wifiBtnStart').className = 'btn btn-primary';
        showNotification('📡 WiFi Monitor', 'Monitoreo detenido', 'info');
    });
    
    socket.on('bluetooth_data', (data) => {
        handleBluetoothData(data);
    });
    
    socket.on('bluetooth_error', (data) => {
        console.error('Error Bluetooth:', data.error);
    });
    
    socket.on('bluetooth_started', (data) => {
        if (data.status === 'success') {
            btMonitoring = true;
            document.getElementById('btStatus').textContent = '✓ Escaneando';
            document.getElementById('btBtnStart').textContent = '⏸ Detener Escaneo';
            document.getElementById('btBtnStart').className = 'btn btn-danger';
            showNotification('🔵 Bluetooth Scanner', 'Escaneo iniciado', 'success');
        }
    });
    
    socket.on('bluetooth_stopped', () => {
        btMonitoring = false;
        document.getElementById('btStatus').textContent = 'Detenido';
        document.getElementById('btBtnStart').textContent = '▶ Iniciar Escaneo';
        document.getElementById('btBtnStart').className = 'btn btn-purple';
        showNotification('🔵 Bluetooth Scanner', 'Escaneo detenido', 'info');
    });
    
    socket.on('wifi_test_result', (data) => {
        if (data.success) {
            showNotification(
                '🧪 Test Exitoso', 
                `Red: ${data.ssid}\nRSSI: ${data.rssi} dBm\nCanal: ${data.channel || 'N/A'}\nCalidad: ${data.quality.level}`,
                'success'
            );
        } else {
            showNotification('❌ Test Fallido', data.error, 'error');
        }
    });
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    const wsStatusEl = document.getElementById('wsStatus');
    
    if (connected) {
        statusEl.querySelector('span').textContent = '✓ Conectado';
        statusEl.querySelector('.status-dot').style.background = '#51cf66';
        wsStatusEl.textContent = '✓ Conectado';
        wsStatusEl.style.color = '#51cf66';
    } else {
        statusEl.querySelector('span').textContent = '✗ Desconectado';
        statusEl.querySelector('.status-dot').style.background = '#ff6b6b';
        wsStatusEl.textContent = '✗ Desconectado';
        wsStatusEl.style.color = '#ff6b6b';
    }
}

// ============================================
// CHARTS MEJORADOS
// ============================================

function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 300,
            easing: 'easeInOutQuart'
        },
        plugins: {
            legend: {
                labels: { 
                    color: '#e1e8f0',
                    font: { size: 12, weight: 'bold' }
                }
            }
        },
        scales: {
            x: {
                ticks: { color: '#8b92a7' },
                grid: { color: 'rgba(76, 154, 255, 0.1)' }
            },
            y: {
                ticks: { color: '#8b92a7' },
                grid: { color: 'rgba(76, 154, 255, 0.1)' }
            }
        }
    };

    // Gráfica WiFi
    const wifiCtx = document.getElementById('wifiChart').getContext('2d');
    wifiChart = new Chart(wifiCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Señal WiFi (dBm)',
                data: [],
                borderColor: '#4c9aff',
                backgroundColor: 'rgba(76, 154, 255, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: '#4c9aff',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                title: {
                    display: true,
                    text: 'Señal WiFi en Tiempo Real',
                    color: '#e1e8f0',
                    font: { size: 16, weight: 'bold' }
                }
            }
        }
    });

    // Gráfica de Onda
    const waveCtx = document.getElementById('waveChart').getContext('2d');
    waveChart = new Chart(waveCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Onda Simulada',
                data: [],
                borderColor: '#9775fa',
                backgroundColor: 'rgba(151, 117, 250, 0.2)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                title: {
                    display: true,
                    text: 'Visualización de Onda',
                    color: '#e1e8f0',
                    font: { size: 14, weight: 'bold' }
                }
            }
        }
    });

    // Gráfica de Histograma
    const histCtx = document.getElementById('histChart').getContext('2d');
    histChart = new Chart(histCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Frecuencia',
                data: [],
                backgroundColor: 'rgba(81, 207, 102, 0.6)',
                borderColor: '#51cf66',
                borderWidth: 2
            }]
        },
        options: {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                title: {
                    display: true,
                    text: 'Distribución de Señal',
                    color: '#e1e8f0',
                    font: { size: 14, weight: 'bold' }
                }
            }
        }
    });

    // ============================================
    // GRÁFICA DE BLUETOOTH - ¡AGREGADA AQUÍ!
    // ============================================
    const btCtx = document.getElementById('btChart').getContext('2d');
    btChart = new Chart(btCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Señal RSSI (dBm)',
                data: [],
                backgroundColor: 'rgba(151, 117, 250, 0.6)',
                borderColor: '#9775fa',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    min: -100,
                    max: -30,
                    ticks: {
                        color: '#8b92a7'
                    },
                    grid: {
                        color: 'rgba(76, 154, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#8b92a7',
                        maxRotation: 45
                    },
                    grid: {
                        color: 'rgba(76, 154, 255, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e1e8f0'
                    }
                },
                title: {
                    display: true,
                    text: 'Dispositivos Bluetooth Detectados',
                    color: '#e1e8f0',
                    font: { size: 14, weight: 'bold' }
                }
            }
        }
    });
}


// ============================================
// SLIDERS
// ============================================

function initSliders() {
    const intervalSlider = document.getElementById('intervalSlider');
    const btIntervalSlider = document.getElementById('btIntervalSlider');

    intervalSlider.addEventListener('input', (e) => {
        wifiInterval = parseFloat(e.target.value) * 1000;
        document.getElementById('intervalValue').textContent = e.target.value + 's';
    });

    btIntervalSlider.addEventListener('input', (e) => {
        btInterval = parseFloat(e.target.value) * 1000;
        document.getElementById('btIntervalValue').textContent = e.target.value + 's';
    });
}

function toggleUltraFast() {
    ultraFastMode = !ultraFastMode;
    const toggle = document.getElementById('ultraFastToggle');
    const slider = document.getElementById('intervalSlider');
    
    if (ultraFastMode) {
        toggle.classList.add('active');
        wifiInterval = 100;
        slider.disabled = true;
        document.getElementById('intervalValue').textContent = '0.1s';
        showNotification('⚡ Ultra-Rápido', 'Modo activado (0.1s)', 'success');
    } else {
        toggle.classList.remove('active');
        slider.disabled = false;
        wifiInterval = parseFloat(slider.value) * 1000;
        document.getElementById('intervalValue').textContent = slider.value + 's';
        showNotification('⚡ Normal', 'Modo estándar activado', 'info');
    }
}

// ============================================
// WIFI FUNCTIONS
// ============================================

function toggleWiFi() {
    if (!socket || !socket.connected) {
        showNotification('❌ Error', 'No hay conexión con el servidor', 'error');
        return;
    }
    
    if (!wifiMonitoring) {
        socket.emit('start_wifi', { interval: wifiInterval / 1000 });
    } else {
        socket.emit('stop_wifi');
    }
}

function handleWiFiData(data) {
    const time = (Date.now() - wifiStartTime) / 1000;
    
    wifiData.push({
        time: time,
        rssi: data.rssi,
        ssid: data.ssid,
        channel: data.channel,
        timestamp: data.timestamp
    });
    
    if (wifiData.length > 300) {
        wifiData.shift();
    }
    
    updateWiFiDisplay(data);
    updateWiFiStats();
    updateCharts();
    
    // Alertas inteligentes
    checkWiFiAlerts(data.rssi);
    
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    document.getElementById('totalWifiData').textContent = wifiData.length;
}

function checkWiFiAlerts(rssi) {
    // Alerta si la señal es muy débil
    if (rssi < -85 && wifiData.length % 20 === 0) {
        showNotification('⚠️ Señal Débil', `RSSI: ${rssi} dBm - Considera acercarte al router`, 'warning');
    }
    
    // Alerta si la señal es excelente
    if (rssi > -50 && wifiData.length === 1) {
        showNotification('🎉 Señal Excelente', `RSSI: ${rssi} dBm - Ubicación óptima`, 'success');
    }
}

function updateWiFiDisplay(data) {
    const rssi = data.rssi;
    const quality = data.quality;
    
    document.getElementById('wifiRssi').textContent = rssi;
    document.getElementById('wifiSSID').textContent = data.ssid;
    document.getElementById('wifiChannel').textContent = data.channel || 'N/A';
    document.getElementById('wifiQuality').textContent = quality.level;
    
    const rssiEl = document.getElementById('wifiRssi');
    rssiEl.style.background = `linear-gradient(135deg, ${quality.color} 0%, #4c9aff 100%)`;
    rssiEl.style.webkitBackgroundClip = 'text';
    rssiEl.style.webkitTextFillColor = 'transparent';
    
    document.getElementById('qualityFill').style.width = quality.percentage + '%';
    document.getElementById('qualityLabel').textContent = quality.level;
    
    if (wifiStartTime) {
        const elapsed = (Date.now() - wifiStartTime) / 1000;
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        document.getElementById('wifiTime').textContent = 
            `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    document.getElementById('wifiCount').textContent = wifiData.length;
}

function updateWiFiStats() {
    if (wifiData.length === 0) return;

    const rssis = wifiData.map(d => d.rssi);
    const avg = rssis.reduce((a, b) => a + b) / rssis.length;
    const max = Math.max(...rssis);
    const min = Math.min(...rssis);
    const variance = max - min;

    document.getElementById('wifiAvg').textContent = avg.toFixed(1) + ' dBm';
    document.getElementById('wifiMax').textContent = max.toFixed(0) + ' dBm';
    document.getElementById('wifiMin').textContent = min.toFixed(0) + ' dBm';
    document.getElementById('wifiVar').textContent = variance.toFixed(1) + ' dBm';
}

function updateCharts() {
    if (wifiData.length === 0) return;

    const times = wifiData.map(d => d.time.toFixed(1));
    const rssis = wifiData.map(d => d.rssi);

    wifiChart.data.labels = times;
    wifiChart.data.datasets[0].data = rssis;
    wifiChart.update('none');

    const waveData = [];
    const waveLabels = [];
    for (let i = 0; i < 50; i++) {
        const t = i / 10;
        const lastRssi = rssis[rssis.length - 1];
        const amplitude = Math.abs(lastRssi / 10);
        const wave = lastRssi + amplitude * Math.sin(2 * Math.PI * t / 5);
        waveData.push(wave);
        waveLabels.push(t.toFixed(1));
    }
    waveChart.data.labels = waveLabels;
    waveChart.data.datasets[0].data = waveData;
    waveChart.update('none');

    if (wifiData.length > 10) {
        const bins = 15;
        const min = Math.min(...rssis);
        const max = Math.max(...rssis);
        const binSize = (max - min) / bins;
        
        const histogram = new Array(bins).fill(0);
        const binLabels = [];
        
        rssis.forEach(rssi => {
            const binIndex = Math.min(Math.floor((rssi - min) / binSize), bins - 1);
            histogram[binIndex]++;
        });
        
        for (let i = 0; i < bins; i++) {
            binLabels.push((min + i * binSize).toFixed(0));
        }
        
        histChart.data.labels = binLabels;
        histChart.data.datasets[0].data = histogram;
        histChart.update('none');
    }
}

function testWiFi() {
    if (!socket || !socket.connected) {
        showNotification('❌ Error', 'No hay conexión con el servidor', 'error');
        return;
    }
    socket.emit('test_wifi');
}

function addMarker() {
    if (wifiData.length > 0) {
        const note = prompt('Nota para este marcador:');
        if (note) {
            const marker = {
                time: wifiData[wifiData.length - 1].time,
                rssi: wifiData[wifiData.length - 1].rssi,
                note: note
            };
            markers.push(marker);
            showNotification('🔖 Marcador', `Agregado: ${note}`, 'success');
            updateCharts();
        }
    } else {
        showNotification('⚠️ Atención', 'Inicia el monitoreo WiFi primero', 'warning');
    }
}

function clearWiFi() {
    if (confirm('¿Limpiar todos los datos de WiFi?')) {
        wifiData = [];
        markers = [];
        wifiChart.data.labels = [];
        wifiChart.data.datasets[0].data = [];
        wifiChart.update();
        waveChart.data.labels = [];
        waveChart.data.datasets[0].data = [];
        waveChart.update();
        histChart.data.labels = [];
        histChart.data.datasets[0].data = [];
        histChart.update();
        
        document.getElementById('wifiRssi').textContent = '--';
        document.getElementById('wifiCount').textContent = '0';
        document.getElementById('totalWifiData').textContent = '0';
        showNotification('🗑️ Limpiado', 'Datos WiFi eliminados', 'info');
    }
}

function exportWiFi() {
    if (wifiData.length === 0) {
        showNotification('⚠️ Atención', 'No hay datos para exportar', 'warning');
        return;
    }

    let csv = 'Timestamp,Tiempo(s),RSSI(dBm),SSID,Canal\n';
    wifiData.forEach(d => {
        csv += `${d.timestamp},${d.time.toFixed(2)},${d.rssi},${d.ssid},${d.channel || 'N/A'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wifi_data_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showNotification('💾 Exportado', `${wifiData.length} mediciones guardadas en CSV`, 'success');
}

// ============================================
// BLUETOOTH FUNCTIONS
// ============================================

function toggleBluetooth() {
    if (!socket || !socket.connected) {
        showNotification('❌ Error', 'No hay conexión con el servidor', 'error');
        return;
    }
    
    if (!btMonitoring) {
        socket.emit('start_bluetooth', { interval: btInterval / 1000 });
    } else {
        socket.emit('stop_bluetooth');
    }
}

socket.on('bluetooth_data', function(data) {
    bluetoothDevices.clear();
    
    if (data.devices && data.devices.length > 0) {
        data.devices.forEach(device => {
            bluetoothDevices.set(device.mac, device);
        });
        
        // Actualizar gráfica
        const labels = data.devices.map(d => d.name.substring(0, 15));
        const rssiData = data.devices.map(d => d.rssi);
        
        btChart.data.labels = labels;
        btChart.data.datasets[0].data = rssiData;
        btChart.update('none');
        
        // Actualizar lista de dispositivos
        updateBluetoothList();
    }
    
    document.getElementById('btCount').textContent = data.count;
    document.getElementById('btStatus').textContent = 'Escaneando';
});

// Nueva función para actualizar lista de dispositivos BT
function updateBluetoothList() {
    const deviceList = document.getElementById('deviceList');
    deviceList.innerHTML = '';
    
    if (bluetoothDevices.size === 0) {
        deviceList.innerHTML = `
            <div style="text-align: center; color: #8b92a7; padding: 20px;">
                No se encontraron dispositivos
            </div>
        `;
        return;
    }
    
    bluetoothDevices.forEach((device, mac) => {
        const deviceItem = document.createElement('div');
        deviceItem.className = 'device-item';
        
        const rssiColor = getRssiColor(device.rssi);
        
        deviceItem.innerHTML = `
            <div>
                <div class="device-name">📱 ${device.name}</div>
                <div class="device-mac">${mac}</div>
            </div>
            <div class="device-rssi" style="background: ${rssiColor};">
                ${device.rssi} dBm
            </div>
        `;
        
        deviceList.appendChild(deviceItem);
    });
}

// Función para escanear todas las redes WiFi
function scanAllNetworks() {
    socket.emit('scan_networks');
    showNotification('🔍 Escaneando', 'Buscando todas las redes disponibles...', 'info');
}

socket.on('networks_found', function(data) {
    console.log('Redes encontradas:', data.networks);
    showNotification(
        '📡 Redes Encontradas', 
        `${data.count} redes WiFi detectadas`, 
        'success'
    );
    
    // Mostrar en consola o crear modal con las redes
    data.networks.forEach(network => {
        console.log(`SSID: ${network.ssid}, BSSIDs: ${network.bssids.length}`);
    });
});

// Función para analizar canal
function analyzeChannel() {
    socket.emit('get_channel_info');
    showNotification('📊 Analizando', 'Obteniendo información del canal...', 'info');
}

socket.on('channel_info', function(info) {
    if (info && info.channel) {
        showNotification(
            '📡 Info del Canal',
            `Canal: ${info.channel}, Banda: ${info.band}, ${info.width}`,
            'success'
        );
    }
});

// Exportar a JSON
function exportToJSON() {
    const data = {
        wifi: Array.from(wifiData),
        bluetooth: Array.from(bluetoothDevices.values()),
        timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `signal_data_${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    
    showNotification('💾 Exportado', 'Datos guardados en JSON', 'success');
}

// Exportar a CSV
function exportToCSV() {
    let csv = 'Tipo,Timestamp,SSID/Nombre,MAC,RSSI,Canal\n';
    
    wifiData.forEach(d => {
        csv += `WiFi,${d.timestamp},${d.ssid},N/A,${d.rssi},${d.channel || 'N/A'}\n`;
    });
    
    bluetoothDevices.forEach(d => {
        csv += `Bluetooth,${new Date().toISOString()},${d.name},${d.mac},${d.rssi},N/A\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `signal_data_${Date.now()}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    
    showNotification('💾 Exportado', 'Datos guardados en CSV', 'success');
}

// ============================================
// SESSION TIMER
// ============================================

function startSessionTimer() {
    setInterval(() => {
        const elapsed = (Date.now() - sessionStartTime) / 1000;
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        document.getElementById('sessionTime').textContent = 
            `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

// Añadir estilos para las animaciones de toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// AGREGAR AL FINAL DE app.js:

// ===== ESCANEO DE REDES =====
function scanAllNetworks() {
    socket.emit('scan_networks');
    showNotification('🔍 Escaneando', 'Buscando redes WiFi...', 'info');
}

socket.on('networks_found', function(data) {
    const networksList = document.getElementById('nearbyNetworks');
    if (!networksList) {
        // Crear sección si no existe
        const panel = document.querySelector('.panel-right');
        const networksCard = document.createElement('div');
        networksCard.className = 'card';
        networksCard.innerHTML = `
            <div class="card-title">📡 Redes Cercanas (${data.count})</div>
            <div id="nearbyNetworks" style="max-height: 300px; overflow-y: auto;"></div>
        `;
        panel.appendChild(networksCard);
    }
    
    const list = document.getElementById('nearbyNetworks');
    list.innerHTML = '';
    
    data.networks.forEach(network => {
        const netDiv = document.createElement('div');
        netDiv.className = 'device-item';
        netDiv.style.borderLeftColor = getRssiColorBySignal(network.bssids[0]?.signal || 0);
        netDiv.innerHTML = `
            <div>
                <div class="device-name">${network.ssid || 'Oculta'}</div>
                <div class="device-mac">Canal: ${network.bssids[0]?.channel || 'N/A'}</div>
            </div>
            <div class="device-rssi">${network.bssids[0]?.signal || 0}%</div>
        `;
        list.appendChild(netDiv);
    });
    
    showNotification('✅ Escaneo Completo', `${data.count} redes encontradas`, 'success');
});

// ===== ANÁLISIS DE CANAL =====
function analyzeChannel() {
    socket.emit('get_channel_info');
}

socket.on('channel_info', function(data) {
    if (data && data.channel) {
        showNotification('📊 Info de Canal', 
            `Canal ${data.channel} - ${data.band || 'N/A'} - ${data.frequency || 'N/A'} MHz`,
            'info');
    }
});

// ===== ESTADÍSTICAS DE RED =====
function updateNetworkStats() {
    socket.emit('get_network_stats');
}

socket.on('network_stats', function(data) {
    // Actualizar estadísticas en el footer
    document.getElementById('stat-packets-sent').textContent = formatBytes(data.packets_sent);
    document.getElementById('stat-packets-recv').textContent = formatBytes(data.packets_recv);
    document.getElementById('stat-errors').textContent = data.errin + data.errout;
});

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
}

// ACTUALIZAR CADA 5 SEGUNDOS
setInterval(updateNetworkStats, 5000);

// ===== EXPORTAR DATOS =====
function exportToJSON() {
    socket.emit('get_wifi_history', {limit: 1000});
    socket.once('wifi_history', function(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wifi_data_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('💾 Exportado', 'Datos guardados en JSON', 'success');
    });
}

function exportToCSV() {
    socket.emit('get_wifi_history', {limit: 1000});
    socket.once('wifi_history', function(data) {
        let csv = 'Timestamp,RSSI,SSID,Channel,Quality\\n';
        data.history.forEach(row => {
            csv += `${row.timestamp},${row.rssi},${row.ssid},${row.channel || 'N/A'},${row.quality.level}\\n`;
        });
        
        const blob = new Blob([csv], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wifi_data_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('💾 Exportado', 'Datos guardados en CSV', 'success');
    });
}

// ===== ALERTAS PERSONALIZADAS =====
let alertThreshold = -75;
function checkSignalAlerts(rssi) {
    if (rssi < alertThreshold) {
        showNotification('⚠️ Señal Baja', `RSSI: ${rssi} dBm está por debajo del umbral`, 'warning');
    }
}

// Función auxiliar para getRssiColor (si no existe)
function getRssiColor(rssi) {
    if (rssi >= -50) return '#51cf66';
    if (rssi >= -60) return '#94d82d';
    if (rssi >= -70) return '#ffd43b';
    if (rssi >= -80) return '#ff922b';
    return '#ff6b6b';
}

function getRssiColorBySignal(signal) {
    if (signal >= 80) return '#51cf66';
    if (signal >= 60) return '#94d82d';
    if (signal >= 40) return '#ffd43b';
    if (signal >= 20) return '#ff922b';
    return '#ff6b6b';
}