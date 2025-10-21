"""
Signal Analyzer Pro - Backend Server
Servidor Flask con WebSockets para monitoreo en tiempo real
"""

from flask import Flask, render_template, send_from_directory
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import subprocess
import re
import platform
import threading
import time
from datetime import datetime
import json

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = 'signal_analyzer_secret_key_2024'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Variables globales
wifi_monitoring = False
bt_monitoring = False
wifi_thread = None
bt_thread = None
sistema = platform.system()
encoding_cache = None

class SignalMonitor:
    def __init__(self):
        self.sistema = platform.system()
        self.encoding_cache = None
    
    # ===== WiFi Methods =====
    
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
                
                # SSID
                if not ssid and 'SSID' in linea and 'BSSID' not in linea:
                    if ':' in linea:
                        ssid = linea.split(':', 1)[1].strip()
                
                # RSSI
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
                
                # Canal
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
            # Intentar con iwconfig
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
            
            # Fallback a nmcli
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
            # Escaneo básico con hcitool
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
                    
                    # Intentar obtener RSSI
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
                    
                    # Agregar dispositivo
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
            # Intentar con PowerShell
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
            for i in range(2, len(lines)):  # Skip headers
                if lines[i].strip():
                    parts = lines[i].split()
                    if len(parts) >= 2:
                        devices.append({
                            'mac': 'N/A',
                            'name': ' '.join(parts[:-1]),
                            'rssi': -60 - (i * 5)  # Simulado
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
        'timestamp': datetime.now().isoformat()
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

@app.route('/static/<path:path>')
def send_static(path):
    """Archivos estáticos"""
    return send_from_directory('static', path)

# ===== Main =====

if __name__ == '__main__':
    print("=" * 60)
    print("📡 Signal Analyzer Pro - Server")
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
    
    print()
    
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
    