// Signal Analyzer Pro - Frontend JavaScript

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

let wifiChart, waveChart, histChart;

document.addEventListener('DOMContentLoaded', function() {
    initWebSocket();
    initCharts();
    initSliders();
    startSessionTimer();
});

function initWebSocket() {
    socket = io('http://localhost:5000');
    
    socket.on('connect', () => {
        console.log('✓ Conectado al servidor');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', () => {
        console.log('✗ Desconectado del servidor');
        updateConnectionStatus(false);
    });
    
    socket.on('status', (data) => {
        document.getElementById('systemInfo').textContent = `Sistema: ${data.sistema}`;
    });
    
    socket.on('wifi_data', (data) => {
        handleWiFiData(data);
    });
    
    socket.on('wifi_error', (data) => {
        console.error('Error WiFi:', data.error);
    });
    
    socket.on('wifi_started', (data) => {
        if (data.status === 'success') {
            wifiMonitoring = true;
            wifiStartTime = Date.now();
            document.getElementById('wifiStatus').textContent = '✓ Activo';
            document.getElementById('wifiBtnStart').textContent = '⏸ Detener WiFi';
            document.getElementById('wifiBtnStart').className = 'btn btn-danger';
        }
    });
    
    socket.on('wifi_stopped', () => {
        wifiMonitoring = false;
        document.getElementById('wifiStatus').textContent = 'Detenido';
        document.getElementById('wifiBtnStart').textContent = '▶ Iniciar WiFi';
        document.getElementById('wifiBtnStart').className = 'btn btn-primary';
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
        }
    });
    
    socket.on('bluetooth_stopped', () => {
        btMonitoring = false;
        document.getElementById('btStatus').textContent = 'Detenido';
        document.getElementById('btBtnStart').textContent = '▶ Iniciar Escaneo';
        document.getElementById('btBtnStart').className = 'btn btn-purple';
    });
    
    socket.on('wifi_test_result', (data) => {
        if (data.success) {
            alert(`🧪 Prueba de Conexión WiFi\n\n✓ Conexión exitosa!\n\nRed: ${data.ssid}\nRSSI: ${data.rssi} dBm\nCanal: ${data.channel || 'N/A'}\nCalidad: ${data.quality.level}`);
        } else {
            alert(`✗ Error en la prueba\n\n${data.error}`);
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

function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 300
        },
        plugins: {
            legend: {
                labels: { color: '#e1e8f0' }
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
                pointHoverRadius: 6
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
}

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
    } else {
        toggle.classList.remove('active');
        slider.disabled = false;
        wifiInterval = parseFloat(slider.value) * 1000;
        document.getElementById('intervalValue').textContent = slider.value + 's';
    }
}

function toggleWiFi() {
    if (!socket || !socket.connected) {
        alert('No hay conexión con el servidor');
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
    
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    document.getElementById('totalWifiData').textContent = wifiData.length;
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
        alert('No hay conexión con el servidor');
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
            alert(`🔖 Marcador agregado: ${note}`);
            updateCharts();
        }
    } else {
        alert('Inicia el monitoreo WiFi primero');
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
        alert('✓ Datos limpiados');
    }
}

function exportWiFi() {
    if (wifiData.length === 0) {
        alert('No hay datos para exportar');
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
}

function toggleBluetooth() {
    if (!socket || !socket.connected) {
        alert('No hay conexión con el servidor');
        return;
    }
    
    if (!btMonitoring) {
        socket.emit('start_bluetooth', { interval: btInterval / 1000 });
    } else {
        socket.emit('stop_bluetooth');
    }
}

function handleBluetoothData(data) {
    data.devices.forEach(device => {
        bluetoothDevices.set(device.mac, device);
    });
    
    updateBluetoothDisplay();
    document.getElementById('totalBtDevices').textContent = bluetoothDevices.size;
}

function updateBluetoothDisplay() {
    const list = document.getElementById('deviceList');
    list.innerHTML = '';

    if (bluetoothDevices.size === 0) {
        list.innerHTML = '<div style="text-align: center; color: #8b92a7; padding: 20px;">Sin dispositivos</div>';
        document.getElementById('btCount').textContent = '0';
        return;
    }

    bluetoothDevices.forEach((device, mac) => {
        const item = document.createElement('div');
        item.className = 'device-item';
        
        const rssiColor = device.rssi > -70 ? '#51cf66' : 
                        device.rssi > -80 ? '#ffd43b' : '#ff6b6b';
        
        item.innerHTML = `
            <div>
                <div class="device-name">${device.name}</div>
                <div class="device-mac">${mac}</div>
            </div>
            <div class="device-rssi" style="color: ${rssiColor}">
                ${Math.round(device.rssi)} dBm
            </div>
        `;
        
        list.appendChild(item);
    });

    document.getElementById('btCount').textContent = bluetoothDevices.size;
}

function clearBluetooth() {
    if (confirm('¿Limpiar lista de dispositivos Bluetooth?')) {
        bluetoothDevices.clear();
        document.getElementById('deviceList').innerHTML = 
            '<div style="text-align: center; color: #8b92a7; padding: 20px;">Lista vacía</div>';
        document.getElementById('btCount').textContent = '0';
        document.getElementById('totalBtDevices').textContent = '0';
    }
}

function exportBluetooth() {
    if (bluetoothDevices.size === 0) {
        alert('No hay dispositivos para exportar');
        return;
    }

    let csv = 'MAC,Nombre,RSSI(dBm)\n';
    bluetoothDevices.forEach((device, mac) => {
        csv += `${mac},${device.name},${device.rssi}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bluetooth_devices_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function startSessionTimer() {
    setInterval(() => {
        const elapsed = (Date.now() - sessionStartTime) / 1000;
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        document.getElementById('sessionTime').textContent = 
            `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}
