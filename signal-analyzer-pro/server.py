"""
Signal Analyzer Pro - Backend Server MEJORADO v2.0
Servidor Flask con WebSockets optimizado y nuevas características
"""
from flask import Flask, render_template, send_from_directory, jsonify, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import subprocess
import re
import platform
import threading
import time
from datetime import datetime
import json
import psutil
from collections import deque
import statistics

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = 'signal_analyzer_secret_key_2024'
CORS(app)
# DESPUÉS - Modo threading (NO requiere eventlet):
socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=60, ping_interval=25)

# Variables globales mejoradas
wifi_monitoring = False
bt_monitoring = False
wifi_thread = None
bt_thread = None
sistema = platform.system()
encoding_cache = None

# Historiales mejorados con límite
wifi_history = deque(maxlen=1000)  # Últimas 1000 mediciones
bt_history = deque(maxlen=500)
network_stats = {
    'packets_sent': 0,
    'packets_received': 0,
    'errors': 0,
    'drops': 0
}

class SignalMonitor:
    def __init__(self):
        self.sistema = platform.system()
        self.encoding_cache = None
        self.last_wifi_data = None
        self.wifi_errors = 0
        
    # ===== NUEVAS FUNCIONALIDADES =====
    
    def get_network_interfaces(self):
        """Obtiene lista de interfaces de red disponibles"""
        try:
            interfaces = []
            if self.sistema == "Windows":
                result = subprocess.check_output(
                    ['netsh', 'interface', 'show', 'interface'],
                    encoding='utf-8',
                    stderr=subprocess.DEVNULL,
                    timeout=2
                )
                for line in result.split('\n'):
                    if 'Connected' in line or 'Conectado' in line:
                        parts = line.split()
                        if len(parts) >= 4:
                            interfaces.append(' '.join(parts[3:]))
            elif self.sistema == "Linux":
                result = subprocess.check_output(['ip', 'link', 'show'],
                    encoding='utf-8',
                    stderr=subprocess.DEVNULL,
                    timeout=2
                )
                for line in result.split('\n'):
                    match = re.search(r'\d+: (\w+):', line)
                    if match and 'lo' not in match.group(1):
                        interfaces.append(match.group(1))
            return interfaces
        except Exception as e:
            print(f"Error obteniendo interfaces: {e}")
            return []
    
    def get_channel_info(self):
        """Obtiene información detallada del canal WiFi"""
        try:
            if self.sistema == "Windows":
                result = subprocess.check_output(
                    ['netsh', 'wlan', 'show', 'interfaces'],
                    encoding=self.encoding_cache or 'utf-8',
                    stderr=subprocess.DEVNULL,
                    timeout=1
                )
                channel = None
                band = None
                frequency = None
                
                for line in result.split('\n'):
                    line = line.strip()
                    if 'Canal' in line or 'Channel' in line:
                        try:
                            channel = int(re.search(r'\d+', line.split(':')[1]).group())
                        except:
                            pass
                    if 'Radio type' in line or 'Tipo de radio' in line:
                        band = line.split(':')[1].strip()
                    if 'Frequency' in line or 'Frecuencia' in line:
                        try:
                            frequency = float(re.search(r'[\d.]+', line.split(':')[1]).group())
                        except:
                            pass
                
                return {
                    'channel': channel,
                    'band': band,
                    'frequency': frequency,
                    'width': self._get_channel_width(channel)
                }
        except Exception as e:
            print(f"Error obteniendo info de canal: {e}")
            return None
    
    def _get_channel_width(self, channel):
        """Determina el ancho de banda del canal"""
        if channel:
            if channel <= 14:
                return '2.4 GHz'
            else:
                return '5 GHz'
        return 'Unknown'
    
    def scan_wifi_networks(self):
        """Escanea todas las redes WiFi disponibles"""
        try:
            networks = []
            if self.sistema == "Windows":
                result = subprocess.check_output(
                    ['netsh', 'wlan', 'show', 'networks', 'mode=bssid'],
                    encoding=self.encoding_cache or 'utf-8',
                    stderr=subprocess.DEVNULL,
                    timeout=3
                )
                current_network = {}
                for line in result.split('\n'):
                    line = line.strip()
                    if 'SSID' in line and 'BSSID' not in line:
                        if current_network:
                            networks.append(current_network)
                        ssid = line.split(':', 1)[1].strip()
                        current_network = {'ssid': ssid, 'bssids': []}
                    elif 'BSSID' in line:
                        bssid = line.split(':', 1)[1].strip()
                        current_network['bssids'].append({'mac': bssid})
                    elif 'Señal' in line or 'Signal' in line:
                        try:
                            signal = int(re.search(r'\d+', line).group())
                            if current_network['bssids']:
                                current_network['bssids'][-1]['signal'] = signal
                        except:
                            pass
                    elif 'Canal' in line or 'Channel' in line:
                        try:
                            channel = int(re.search(r'\d+', line.split(':')[1]).group())
                            if current_network['bssids']:
                                current_network['bssids'][-1]['channel'] = channel
                        except:
                            pass
                
                if current_network:
                    networks.append(current_network)
                    
            elif self.sistema == "Linux":
                result = subprocess.check_output(
                    ['nmcli', '-t', '-f', 'SSID,BSSID,CHAN,SIGNAL', 'dev', 'wifi'],
                    encoding='utf-8',
                    stderr=subprocess.DEVNULL,
                    timeout=3
                )
                for line in result.split('\n'):
                    if line:
                        parts = line.split(':')
                        if len(parts) >= 4:
                            networks.append({
                                'ssid': parts[0],
                                'bssids': [{
                                    'mac': parts[1],
                                    'channel': int(parts[2]) if parts[2] else 0,
                                    'signal': int(parts[3]) if parts[3] else -100
                                }]
                            })
            
            return networks
        except Exception as e:
            print(f"Error escaneando redes: {e}")
            return []

    def get_network_stats(self):
        """Obtiene estadísticas de red usando psutil"""
        try:
            net_io = psutil.net_io_counters()
            return {
                'bytes_sent': net_io.bytes_sent,
                'bytes_recv': net_io.bytes_recv,
                'packets_sent': net_io.packets_sent,
                'packets_recv': net_io.packets_recv,
                'errin': net_io.errin,
                'errout': net_io.errout,
                'dropin': net_io.dropin,
                'dropout': net_io.dropout
            }
        except Exception as e:
            print(f"Error obteniendo estadísticas: {e}")
            return None
    
    # ===== WiFi Methods (del original) =====
    
    def get_wifi_signal(self):
        """Obtiene señal WiFi según el sistema operativo"""
        try:
            if self.sistema == "Windows":
                return self._get_wifi_windows()
            elif self.sistema == "Linux":
                return self._get_wifi_linux()
            elif self.sistema == "Darwin":
                return self._get_wifi_macos()
            else:
                return None, None, None
        except Exception as e:
            self.wifi_errors += 1
            print(f"Error obteniendo WiFi: {e}")
            return None, None, None

    def _get_wifi_windows(self):
        """WiFi para Windows - OPTIMIZADO"""
        try:
            if self.encoding_cache:
                resultado = subprocess.check_output(
                    ['netsh', 'wlan', 'show', 'interfaces'],
                    encoding=self.encoding_cache,
                    stderr=subprocess.DEVNULL,
                    timeout=0.5
                )
            else:
                for enc in ['utf-8', 'cp1252', 'latin-1']:
                    try:
                        resultado = subprocess.check_output(
                            ['netsh', 'wlan', 'show', 'interfaces'],
                            encoding=enc,
                            stderr=subprocess.DEVNULL,
                            timeout=0.5
                        )
                        self.encoding_cache = enc
                        break
                    except:
                        continue
                else:
                    return None, None, None

            rssi = None
            ssid = None
            channel = None
            
            for linea in resultado.split('\n'):
                linea = linea.strip()
                
                if not ssid and 'SSID' in linea and 'BSSID' not in linea:
                    if ':' in linea:
                        ssid = linea.split(':', 1)[1].strip()
                
                if not rssi and ('rssi' in linea.lower() or 'señal' in linea.lower() or 'signal' in linea.lower()):
                    if ':' in linea:
                        valor = linea.split(':', 1)[1].strip()
                        if '%' in valor:
                            try:
                                porc = int(re.search(r'(\d+)', valor).group(1))
                                rssi = int((porc / 2) - 100)
                            except:
                                pass
                        else:
                            try:
                                rssi = int(re.search(r'-?\d+', valor).group())
                            except:
                                pass
                
                if not channel and ('channel' in linea.lower() or 'canal' in linea.lower()):
                    if ':' in linea:
                        try:
                            channel = int(re.search(r'\d+', linea.split(':', 1)[1]).group())
                        except:
                            pass
                
                if rssi and ssid:
                    break
            
            return rssi, ssid, channel
        except Exception as e:
            print(f"Error Windows WiFi: {e}")
            return None, None, None

    def _get_wifi_linux(self):
        """WiFi para Linux"""
        try:
            resultado = subprocess.check_output(['iwconfig'],
                stderr=subprocess.DEVNULL,
                encoding='utf-8',
                timeout=0.5)
            
            rssi, ssid, channel = None, None, None
            
            for linea in resultado.split('\n'):
                if 'ESSID' in linea:
                    match = re.search(r'ESSID:"([^"]+)"', linea)
                    if match:
                        ssid = match.group(1)
                
                if 'Signal level' in linea:
                    match = re.search(r'Signal level=(-?\d+)', linea)
                    if match:
                        rssi = int(match.group(1))
                
                if 'Frequency' in linea:
                    match = re.search(r'Channel (\d+)', linea)
                    if match:
                        channel = int(match.group(1))
            
            if rssi:
                return rssi, ssid, channel
            
            resultado = subprocess.check_output(
                ['nmcli', '-t', '-f', 'ACTIVE,SSID,SIGNAL,CHAN', 'dev', 'wifi'],
                encoding='utf-8',
                stderr=subprocess.DEVNULL,
                timeout=0.5
            )
            
            for linea in resultado.split('\n'):
                if linea.startswith('yes') or linea.startswith('sí'):
                    partes = linea.split(':')
                    if len(partes) >= 3:
                        ssid = partes[1]
                        signal = int(partes[2])
                        rssi = int((signal / 2) - 100)
                        channel = int(partes[3]) if len(partes) >= 4 else None
                        return rssi, ssid, channel
            
            return None, None, None
        except Exception as e:
            print(f"Error Linux WiFi: {e}")
            return None, None, None

    def _get_wifi_macos(self):
        """WiFi para macOS"""
        try:
            resultado = subprocess.check_output(
                ['/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport', '-I'],
                encoding='utf-8',
                stderr=subprocess.DEVNULL,
                timeout=0.5
            )
            
            rssi, ssid, channel = None, None, None
            
            for linea in resultado.split('\n'):
                if 'agrCtlRSSI' in linea:
                    rssi = int(linea.split(':')[1].strip())
                if ' SSID' in linea and 'BSSID' not in linea:
                    ssid = linea.split(':')[1].strip()
                if 'channel' in linea.lower():
                    try:
                        channel = int(re.search(r'\d+', linea.split(':')[1]).group())
                    except:
                        pass
                if rssi and ssid:
                    break
            
            return rssi, ssid, channel
        except Exception as e:
            print(f"Error macOS WiFi: {e}")
            return None, None, None

    # ===== Bluetooth Methods =====
    
    def scan_bluetooth(self):
        """Escanea dispositivos Bluetooth"""
        try:
            if self.sistema == "Linux":
                return self._scan_bluetooth_linux()
            elif self.sistema == "Darwin":
                return self._scan_bluetooth_macos()
            elif self.sistema == "Windows":
                return self._scan_bluetooth_windows()
            else:
                return []
        except Exception as e:
            print(f"Error escaneando Bluetooth: {e}")
            return []

    def _scan_bluetooth_linux(self):
        """Escaneo Bluetooth en Linux"""
        devices = []
        try:
            resultado = subprocess.check_output(
                ['hcitool', 'scan', '--flush'],
                encoding='utf-8',
                stderr=subprocess.DEVNULL,
                timeout=5
            )
            
            for linea in resultado.split('\n'):
                if ':' in linea and len(linea.split()) >= 2:
                    partes = linea.split()
                    mac = partes[0]
                    nombre = ' '.join(partes[1:]) if len(partes) > 1 else 'Desconocido'
                    
                    try:
                        rssi_result = subprocess.check_output(
                            ['hcitool', 'rssi', mac],
                            encoding='utf-8',
                            stderr=subprocess.DEVNULL,
                            timeout=1
                        )
                        rssi_match = re.search(r'RSSI return value:\s*(-?\d+)', rssi_result)
                        rssi = int(rssi_match.group(1)) if rssi_match else -70
                    except:
                        rssi = -70
                    
                    devices.append({
                        'mac': mac,
                        'name': nombre,
                        'rssi': rssi
                    })
            
            return devices
        except subprocess.TimeoutExpired:
            print("Timeout en escaneo Bluetooth")
            return []
        except Exception as e:
            print(f"Error Bluetooth Linux: {e}")
            return []

    def _scan_bluetooth_macos(self):
        """Escaneo Bluetooth en macOS"""
        devices = []
        try:
            resultado = subprocess.check_output(
                ['system_profiler', 'SPBluetoothDataType'],
                encoding='utf-8',
                stderr=subprocess.DEVNULL,
                timeout=5
            )
            
            current_device = {}
            for linea in resultado.split('\n'):
                linea = linea.strip()
                
                if 'Address:' in linea or 'Dirección:' in linea:
                    mac = linea.split(':', 1)[1].strip()
                    current_device['mac'] = mac
                elif ('Name:' in linea or 'Nombre:' in linea) and current_device:
                    nombre = linea.split(':', 1)[1].strip()
                    current_device['name'] = nombre
                elif ('RSSI:' in linea) and current_device:
                    try:
                        rssi = int(re.search(r'-?\d+', linea).group())
                        current_device['rssi'] = rssi
                    except:
                        current_device['rssi'] = -70
                
                if 'mac' in current_device and 'name' in current_device:
                    devices.append(current_device.copy())
                    current_device = {}
            
            return devices
        except Exception as e:
            print(f"Error Bluetooth macOS: {e}")
            return []

    def _scan_bluetooth_windows(self):
        """Escaneo Bluetooth en Windows"""
        devices = []
        try:
            ps_script = """
            Get-PnpDevice -Class Bluetooth |
            Where-Object {$_.Status -eq "OK"} |
            Select-Object FriendlyName, InstanceId
            """
            resultado = subprocess.check_output(
                ['powershell', '-Command', ps_script],
                encoding='utf-8',
                stderr=subprocess.DEVNULL,
                timeout=5
            )
            
            lines = resultado.strip().split('\n')
            for i in range(2, len(lines)):
                if lines[i].strip():
                    parts = lines[i].split()
                    if len(parts) >= 2:
                        devices.append({
                            'mac': 'N/A',
                            'name': ' '.join(parts[:-1]),
                            'rssi': -60 - (i * 5)
                        })
            
            return devices
        except Exception as e:
            print(f"Error Bluetooth Windows: {e}")
            return []

# Instancia del monitor
monitor = SignalMonitor()

# ===== WebSocket Handlers =====

@socketio.on('connect')
def handle_connect():
    """Cliente conectado"""
    print('Cliente conectado')
    emit('status', {
        'connected': True,
        'sistema': sistema,
        'timestamp': datetime.now().isoformat(),
        'interfaces': monitor.get_network_interfaces()
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Cliente desconectado"""
    print('Cliente desconectado')

@socketio.on('start_wifi')
def handle_start_wifi(data):
    """Inicia monitoreo WiFi"""
    global wifi_monitoring, wifi_thread
    
    if not wifi_monitoring:
        wifi_monitoring = True
        interval = data.get('interval', 0.5)
        
        def wifi_monitor_loop():
            global wifi_monitoring
            while wifi_monitoring:
                try:
                    rssi, ssid, channel = monitor.get_wifi_signal()
                    
                    if rssi is not None:
                        data = {
                            'rssi': rssi,
                            'ssid': ssid or 'N/A',
                            'channel': channel,
                            'timestamp': datetime.now().isoformat(),
                            'quality': get_quality(rssi)
                        }
                        
                        wifi_history.append(data)
                        socketio.emit('wifi_data', data)
                    else:
                        socketio.emit('wifi_error', {
                            'error': 'No se pudo leer WiFi',
                            'timestamp': datetime.now().isoformat()
                        })
                    
                    time.sleep(interval)
                except Exception as e:
                    print(f"Error en loop WiFi: {e}")
                    socketio.emit('wifi_error', {'error': str(e)})
                    break
        
        wifi_thread = threading.Thread(target=wifi_monitor_loop, daemon=True)
        wifi_thread.start()
        emit('wifi_started', {'status': 'success'})
    else:
        emit('wifi_started', {'status': 'already_running'})

@socketio.on('stop_wifi')
def handle_stop_wifi():
    """Detiene monitoreo WiFi"""
    global wifi_monitoring
    wifi_monitoring = False
    emit('wifi_stopped', {'status': 'success'})

@socketio.on('start_bluetooth')
def handle_start_bluetooth(data):
    """Inicia escaneo Bluetooth"""
    global bt_monitoring, bt_thread
    
    if not bt_monitoring:
        bt_monitoring = True
        interval = data.get('interval', 2.0)
        
        def bt_monitor_loop():
            global bt_monitoring
            while bt_monitoring:
                try:
                    devices = monitor.scan_bluetooth()
                    socketio.emit('bluetooth_data', {
                        'devices': devices,
                        'timestamp': datetime.now().isoformat(),
                        'count': len(devices)
                    })
                    time.sleep(interval)
                except Exception as e:
                    print(f"Error en loop Bluetooth: {e}")
                    socketio.emit('bluetooth_error', {'error': str(e)})
                    break
        
        bt_thread = threading.Thread(target=bt_monitor_loop, daemon=True)
        bt_thread.start()
        emit('bluetooth_started', {'status': 'success'})
    else:
        emit('bluetooth_started', {'status': 'already_running'})

@socketio.on('stop_bluetooth')
def handle_stop_bluetooth():
    """Detiene escaneo Bluetooth"""
    global bt_monitoring
    bt_monitoring = False
    emit('bluetooth_stopped', {'status': 'success'})

# ===== NUEVOS HANDLERS =====

@socketio.on('scan_networks')
def handle_scan_networks():
    """Escanea todas las redes WiFi disponibles"""
    networks = monitor.scan_wifi_networks()
    emit('networks_found', {
        'networks': networks,
        'count': len(networks),
        'timestamp': datetime.now().isoformat()
    })

@socketio.on('get_channel_info')
def handle_get_channel_info():
    """Obtiene información del canal actual"""
    channel_info = monitor.get_channel_info()
    emit('channel_info', channel_info or {})

@socketio.on('get_network_stats')
def handle_get_network_stats():
    """Obtiene estadísticas de red"""
    stats = monitor.get_network_stats()
    emit('network_stats', stats or {})

@socketio.on('get_wifi_history')
def handle_get_wifi_history(data):
    """Retorna el historial de WiFi"""
    limit = data.get('limit', 100)
    history = list(wifi_history)[-limit:]
    
    if history:
        rssi_values = [d['rssi'] for d in history]
        stats = {
            'avg': statistics.mean(rssi_values),
            'min': min(rssi_values),
            'max': max(rssi_values),
            'std': statistics.stdev(rssi_values) if len(rssi_values) > 1 else 0
        }
    else:
        stats = {'avg': 0, 'min': 0, 'max': 0, 'std': 0}
    
    emit('wifi_history', {
        'history': history,
        'stats': stats
    })

@socketio.on('test_wifi')
def handle_test_wifi():
    """Prueba la conexión WiFi"""
    rssi, ssid, channel = monitor.get_wifi_signal()
    
    if rssi is not None:
        emit('wifi_test_result', {
            'success': True,
            'rssi': rssi,
            'ssid': ssid,
            'channel': channel,
            'quality': get_quality(rssi)
        })
    else:
        emit('wifi_test_result', {
            'success': False,
            'error': 'No se pudo detectar WiFi'
        })

# ===== Helper Functions =====

def get_quality(rssi):
    """Retorna la calidad de la señal"""
    if rssi >= -30:
        return {'level': 'Excelente', 'percentage': 100, 'color': '#51cf66'}
    elif rssi >= -67:
        return {'level': 'Buena', 'percentage': 75, 'color': '#ffd43b'}
    elif rssi >= -80:
        return {'level': 'Regular', 'percentage': 50, 'color': '#ff9f43'}
    else:
        return {'level': 'Débil', 'percentage': 25, 'color': '#ff6b6b'}

# ===== Routes =====

@app.route('/')
def index():
    """Página principal"""
    return render_template('index.html')

@app.route('/api/system-info')
def system_info():
    """Información del sistema"""
    return jsonify({
        'sistema': sistema,
        'interfaces': monitor.get_network_interfaces(),
        'cpu_percent': psutil.cpu_percent(interval=1),
        'memory_percent': psutil.virtual_memory().percent,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/wifi-history')
def get_wifi_history_api():
    """API REST para historial WiFi"""
    limit = request.args.get('limit', 100, type=int)
    history = list(wifi_history)[-limit:]
    return jsonify({'history': history, 'count': len(history)})

@app.route('/static/<path:path>')
def send_static(path):
    """Archivos estáticos"""
    return send_from_directory('static', path)

# ===== Main =====

if __name__ == '__main__':
    print("=" * 60)
    print("📡 Signal Analyzer Pro - Server MEJORADO v2.0")
    print("=" * 60)
    print(f"Sistema: {sistema}")
    print(f"Puerto: 5000")
    print(f"URL: http://localhost:5000")
    print("=" * 60)
    print("\n🚀 Servidor iniciado. Presiona Ctrl+C para detener.\n")
    
    # Verificar capacidades
    rssi, ssid, channel = monitor.get_wifi_signal()
    if rssi:
        print(f"✓ WiFi detectado: {ssid} ({rssi} dBm)")
    else:
        print("⚠ No se detectó WiFi")
    
    interfaces = monitor.get_network_interfaces()
    if interfaces:
        print(f"✓ Interfaces de red: {', '.join(interfaces)}")
    
    print()
    
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)