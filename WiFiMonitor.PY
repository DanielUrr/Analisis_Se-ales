import subprocess
import re
import time
import csv
import platform
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, simpledialog
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
from datetime import datetime
import numpy as np
from collections import deque
import threading

class WiFiMonitorGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("WiFi Signal Analyzer Pro 📡")
        self.root.geometry("1400x900")
        self.root.configure(bg='#1e1e2e')
        
        # Variables
        self.monitoreando = False
        self.sistema = platform.system()
        self.datos_tiempo = deque(maxlen=200)
        self.datos_rssi = deque(maxlen=200)
        self.datos_completos = []
        self.inicio = None
        self.marcadores = []
        self.ssid_actual = "N/A"
        self.hilo_monitoreo = None
        
        # OPTIMIZACIÓN: Cachear la codificación que funciona
        self.encoding_cache = None
        
        # Configuración - INTERVALO MÁS RÁPIDO
        self.intervalo = tk.DoubleVar(value=0.5)  # Cambiado de 1.0 a 0.5
        self.max_puntos = tk.IntVar(value=200)
        self.tema_oscuro = tk.BooleanVar(value=True)
        self.mostrar_estadisticas = tk.BooleanVar(value=True)
        self.alertas_activadas = tk.BooleanVar(value=True)
        self.umbral_alerta = tk.IntVar(value=-80)
        
        self.configurar_estilos()
        self.crear_interfaz()
        self.verificar_sistema()
        
    def verificar_sistema(self):
        """Verifica que el sistema pueda obtener información WiFi"""
        rssi, ssid = self.obtener_rssi()
        if rssi is None:
            msg = f"⚠️ No se pudo detectar información WiFi en {self.sistema}\n\n"
            if self.sistema == "Windows":
                msg += "Asegúrate de que:\n- Estás conectado a una red WiFi\n- El adaptador WiFi está activo"
            elif self.sistema == "Linux":
                msg += "Necesitas instalar:\nsudo apt-get install wireless-tools\no\nsudo apt-get install network-manager"
            elif self.sistema == "Darwin":
                msg += "Verifica que estés conectado a WiFi"
            
            messagebox.showwarning("Advertencia", msg)
            self.status_label.config(text="⚠️ Error: No se puede leer WiFi", fg='#f38ba8')
        else:
            self.status_label.config(text=f"✓ WiFi detectado: {ssid} ({rssi} dBm)", fg='#a6e3a1')
    
    def configurar_estilos(self):
        """Configura los estilos de la interfaz"""
        style = ttk.Style()
        style.theme_use('clam')
        
        style.configure('Title.TLabel', 
                       font=('Segoe UI', 24, 'bold'),
                       background='#1e1e2e',
                       foreground='#89dceb')
        
        style.configure('Subtitle.TLabel',
                       font=('Segoe UI', 12),
                       background='#1e1e2e',
                       foreground='#cdd6f4')
        
        style.configure('Info.TLabel',
                       font=('Segoe UI', 10),
                       background='#313244',
                       foreground='#cdd6f4',
                       padding=10)
        
        style.configure('Big.TLabel',
                       font=('Segoe UI', 48, 'bold'),
                       background='#313244',
                       foreground='#a6e3a1')
    
    def crear_interfaz(self):
        """Crea la interfaz gráfica completa"""
        # Frame principal
        main_frame = tk.Frame(self.root, bg='#1e1e2e')
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # ===== ENCABEZADO =====
        header_frame = tk.Frame(main_frame, bg='#1e1e2e')
        header_frame.pack(fill=tk.X, pady=(0, 10))
        
        title = ttk.Label(header_frame, text="📡 WiFi Signal Analyzer Pro", 
                         style='Title.TLabel')
        title.pack(side=tk.LEFT)
        
        # Botón de ayuda
        btn_ayuda = tk.Button(header_frame, text="❓", 
                             font=('Segoe UI', 16),
                             command=self.mostrar_ayuda,
                             bg='#45475a', fg='#cdd6f4',
                             border=0, cursor='hand2',
                             width=3, height=1)
        btn_ayuda.pack(side=tk.RIGHT, padx=5)
        
        # ===== PANEL IZQUIERDO (Controles) =====
        left_panel = tk.Frame(main_frame, bg='#313244', relief=tk.RAISED, bd=2)
        left_panel.pack(side=tk.LEFT, fill=tk.BOTH, padx=(0, 10), pady=0)
        left_panel.configure(width=350)
        left_panel.pack_propagate(False)
        
        # Panel de información actual
        info_frame = tk.LabelFrame(left_panel, text="📊 Información Actual",
                                   font=('Segoe UI', 11, 'bold'),
                                   bg='#313244', fg='#89dceb',
                                   relief=tk.GROOVE, bd=2)
        info_frame.pack(fill=tk.X, padx=10, pady=10)
        
        # RSSI actual (grande y destacado)
        self.label_rssi_grande = ttk.Label(info_frame, text="--", 
                                          style='Big.TLabel')
        self.label_rssi_grande.pack(pady=10)
        
        unit_label = ttk.Label(info_frame, text="dBm", 
                              font=('Segoe UI', 14),
                              background='#313244', foreground='#7f849c')
        unit_label.pack()
        
        # Información detallada
        details_frame = tk.Frame(info_frame, bg='#313244')
        details_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.label_ssid = self.crear_info_label(details_frame, "Red:", "N/A")
        self.label_calidad = self.crear_info_label(details_frame, "Calidad:", "N/A")
        self.label_tiempo = self.crear_info_label(details_frame, "Tiempo:", "00:00")
        self.label_mediciones = self.crear_info_label(details_frame, "Mediciones:", "0")
        
        # Panel de estadísticas
        stats_frame = tk.LabelFrame(left_panel, text="📈 Estadísticas",
                                    font=('Segoe UI', 11, 'bold'),
                                    bg='#313244', fg='#89dceb',
                                    relief=tk.GROOVE, bd=2)
        stats_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.label_promedio = self.crear_info_label(stats_frame, "Promedio:", "-- dBm")
        self.label_maximo = self.crear_info_label(stats_frame, "Máximo:", "-- dBm")
        self.label_minimo = self.crear_info_label(stats_frame, "Mínimo:", "-- dBm")
        self.label_variacion = self.crear_info_label(stats_frame, "Variación:", "-- dBm")
        
        # Panel de controles
        control_frame = tk.LabelFrame(left_panel, text="🎛️ Controles",
                                      font=('Segoe UI', 11, 'bold'),
                                      bg='#313244', fg='#89dceb',
                                      relief=tk.GROOVE, bd=2)
        control_frame.pack(fill=tk.X, padx=10, pady=10)
        
        # Intervalo de muestreo - RANGO MÁS RÁPIDO
        tk.Label(control_frame, text="Intervalo (seg):", 
                bg='#313244', fg='#cdd6f4',
                font=('Segoe UI', 10)).pack(anchor=tk.W, padx=10, pady=(10, 0))
        
        interval_frame = tk.Frame(control_frame, bg='#313244')
        interval_frame.pack(fill=tk.X, padx=10, pady=5)
        
        # CAMBIO: Rango de 0.2 a 5.0 segundos con resolución de 0.1
        tk.Scale(interval_frame, from_=0.2, to=5.0, resolution=0.1,
                orient=tk.HORIZONTAL, variable=self.intervalo,
                bg='#313244', fg='#cdd6f4', highlightthickness=0,
                troughcolor='#45475a', activebackground='#89b4fa',
                length=200).pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        ttk.Label(interval_frame, textvariable=self.intervalo,
                 font=('Segoe UI', 10, 'bold'),
                 background='#313244', foreground='#89dceb',
                 width=5).pack(side=tk.RIGHT, padx=5)
        
        # Botones de control
        btn_frame = tk.Frame(control_frame, bg='#313244')
        btn_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.btn_iniciar = tk.Button(btn_frame, text="▶ Iniciar Monitoreo",
                                     command=self.toggle_monitoreo,
                                     font=('Segoe UI', 11, 'bold'),
                                     bg='#a6e3a1', fg='#1e1e2e',
                                     cursor='hand2', relief=tk.FLAT,
                                     height=2)
        self.btn_iniciar.pack(fill=tk.X, pady=2)
        
        tk.Button(btn_frame, text="🧪 Probar Conexión",
                 command=self.probar_conexion,
                 font=('Segoe UI', 10),
                 bg='#89dceb', fg='#1e1e2e',
                 cursor='hand2', relief=tk.FLAT).pack(fill=tk.X, pady=2)
        
        tk.Button(btn_frame, text="🔖 Marcar Punto",
                 command=self.agregar_marcador,
                 font=('Segoe UI', 10),
                 bg='#f9e2af', fg='#1e1e2e',
                 cursor='hand2', relief=tk.FLAT).pack(fill=tk.X, pady=2)
        
        tk.Button(btn_frame, text="🗑️ Limpiar Datos",
                 command=self.limpiar_datos,
                 font=('Segoe UI', 10),
                 bg='#f38ba8', fg='#1e1e2e',
                 cursor='hand2', relief=tk.FLAT).pack(fill=tk.X, pady=2)
        
        tk.Button(btn_frame, text="💾 Exportar CSV",
                 command=self.exportar_csv,
                 font=('Segoe UI', 10),
                 bg='#89b4fa', fg='#1e1e2e',
                 cursor='hand2', relief=tk.FLAT).pack(fill=tk.X, pady=2)
        
        tk.Button(btn_frame, text="📸 Guardar Gráfica",
                 command=self.guardar_grafica,
                 font=('Segoe UI', 10),
                 bg='#cba6f7', fg='#1e1e2e',
                 cursor='hand2', relief=tk.FLAT).pack(fill=tk.X, pady=2)
        
        # Opciones
        options_frame = tk.LabelFrame(left_panel, text="⚙️ Opciones",
                                      font=('Segoe UI', 11, 'bold'),
                                      bg='#313244', fg='#89dceb',
                                      relief=tk.GROOVE, bd=2)
        options_frame.pack(fill=tk.X, padx=10, pady=10)
        
        tk.Checkbutton(options_frame, text="Mostrar estadísticas en gráfica",
                      variable=self.mostrar_estadisticas,
                      bg='#313244', fg='#cdd6f4',
                      selectcolor='#45475a',
                      activebackground='#313244',
                      activeforeground='#89dceb',
                      font=('Segoe UI', 9)).pack(anchor=tk.W, padx=10, pady=2)
        
        tk.Checkbutton(options_frame, text="Alertas de señal débil",
                      variable=self.alertas_activadas,
                      bg='#313244', fg='#cdd6f4',
                      selectcolor='#45475a',
                      activebackground='#313244',
                      activeforeground='#89dceb',
                      font=('Segoe UI', 9)).pack(anchor=tk.W, padx=10, pady=2)
        
        # ===== PANEL DERECHO (Gráficas) =====
        right_panel = tk.Frame(main_frame, bg='#313244')
        right_panel.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)
        
        # Crear figura de matplotlib
        self.fig = Figure(figsize=(10, 8), facecolor='#313244')
        
        # Gráfica principal
        self.ax1 = self.fig.add_subplot(211)
        self.ax1.set_facecolor('#1e1e2e')
        self.ax1.set_title('Intensidad de Señal WiFi en Tiempo Real', 
                          color='#cdd6f4', fontsize=14, fontweight='bold', pad=15)
        self.ax1.set_xlabel('Tiempo (segundos)', color='#cdd6f4', fontsize=11)
        self.ax1.set_ylabel('RSSI (dBm)', color='#cdd6f4', fontsize=11)
        self.ax1.tick_params(colors='#cdd6f4')
        self.ax1.grid(True, alpha=0.2, color='#45475a', linestyle='--')
        
        # Líneas de referencia
        self.ax1.axhline(y=-30, color='#a6e3a1', linestyle='--', 
                        alpha=0.6, linewidth=1.5, label='Excelente')
        self.ax1.axhline(y=-67, color='#f9e2af', linestyle='--', 
                        alpha=0.6, linewidth=1.5, label='Buena')
        self.ax1.axhline(y=-70, color='#fab387', linestyle='--', 
                        alpha=0.6, linewidth=1.5, label='Regular')
        self.ax1.axhline(y=-80, color='#f38ba8', linestyle='--', 
                        alpha=0.6, linewidth=1.5, label='Débil')
        
        self.line, = self.ax1.plot([], [], 'o-', color='#89dceb', 
                                   linewidth=2.5, markersize=5, 
                                   markerfacecolor='#89b4fa',
                                   markeredgecolor='#cdd6f4',
                                   markeredgewidth=1)
        
        legend = self.ax1.legend(loc='upper right', facecolor='#45475a', 
                                edgecolor='#7f849c', fontsize=9)
        plt.setp(legend.get_texts(), color='#cdd6f4')
        
        # Gráfica de histograma
        self.ax2 = self.fig.add_subplot(212)
        self.ax2.set_facecolor('#1e1e2e')
        self.ax2.set_title('Distribución de la Señal', 
                          color='#cdd6f4', fontsize=14, fontweight='bold', pad=15)
        self.ax2.set_xlabel('RSSI (dBm)', color='#cdd6f4', fontsize=11)
        self.ax2.set_ylabel('Frecuencia', color='#cdd6f4', fontsize=11)
        self.ax2.tick_params(colors='#cdd6f4')
        self.ax2.grid(True, alpha=0.2, color='#45475a', linestyle='--', axis='y')
        
        self.fig.tight_layout(pad=3.0)
        
        # Canvas de matplotlib
        self.canvas = FigureCanvasTkAgg(self.fig, master=right_panel)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Barra de estado
        status_frame = tk.Frame(self.root, bg='#45475a', height=30)
        status_frame.pack(side=tk.BOTTOM, fill=tk.X)
        
        self.status_label = tk.Label(status_frame, text="⏳ Verificando sistema...", 
                                     bg='#45475a', fg='#f9e2af',
                                     font=('Segoe UI', 9), anchor=tk.W)
        self.status_label.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)
        
        self.sistema_label = tk.Label(status_frame, 
                                      text=f"Sistema: {self.sistema}", 
                                      bg='#45475a', fg='#7f849c',
                                      font=('Segoe UI', 9))
        self.sistema_label.pack(side=tk.RIGHT, padx=10)
    
    def crear_info_label(self, parent, titulo, valor):
        """Crea un label de información con formato"""
        frame = tk.Frame(parent, bg='#313244')
        frame.pack(fill=tk.X, pady=3)
        
        tk.Label(frame, text=titulo, bg='#313244', fg='#7f849c',
                font=('Segoe UI', 9), width=12, anchor=tk.W).pack(side=tk.LEFT)
        
        label_valor = tk.Label(frame, text=valor, bg='#313244', fg='#cdd6f4',
                              font=('Segoe UI', 10, 'bold'), anchor=tk.E)
        label_valor.pack(side=tk.RIGHT, fill=tk.X, expand=True)
        
        return label_valor
    
    def obtener_rssi(self):
        """Obtiene el RSSI según el sistema operativo"""
        try:
            if self.sistema == "Windows":
                return self._obtener_rssi_windows()
            elif self.sistema == "Linux":
                return self._obtener_rssi_linux()
            elif self.sistema == "Darwin":
                return self._obtener_rssi_macos()
            else:
                return None, None
        except Exception as e:
            print(f"Error obteniendo RSSI: {e}")
            return None, None
    
    def _obtener_rssi_windows(self):
        """Obtiene RSSI en Windows - VERSIÓN ULTRA OPTIMIZADA"""
        try:
            # OPTIMIZACIÓN 1: Usar la codificación cacheada si ya la encontramos
            if self.encoding_cache:
                try:
                    resultado = subprocess.check_output(
                        ['netsh', 'wlan', 'show', 'interfaces'],
                        encoding=self.encoding_cache,
                        stderr=subprocess.DEVNULL,
                        timeout=2  # Timeout de 2 segundos
                    )
                except:
                    # Si falla, intentar de nuevo sin caché
                    self.encoding_cache = None
                    return self._obtener_rssi_windows()
            else:
                # OPTIMIZACIÓN 2: Probar solo las codificaciones más comunes primero
                for encoding in ['utf-8', 'cp1252', 'latin-1']:
                    try:
                        resultado = subprocess.check_output(
                            ['netsh', 'wlan', 'show', 'interfaces'],
                            encoding=encoding,
                            stderr=subprocess.DEVNULL,
                            timeout=2
                        )
                        self.encoding_cache = encoding  # Guardar para próximas veces
                        break
                    except:
                        continue
                else:
                    # Último recurso
                    resultado = subprocess.check_output(
                        ['netsh', 'wlan', 'show', 'interfaces'],
                        stderr=subprocess.DEVNULL,
                        timeout=2
                    ).decode('utf-8', errors='ignore')
            
            rssi = None
            ssid = None
            
            # OPTIMIZACIÓN 3: Buscar solo lo necesario y salir rápido
            for linea in resultado.split('\n'):
                linea = linea.strip()
                
                # Buscar SSID (evitar BSSID)
                if ssid is None and 'SSID' in linea and 'BSSID' not in linea:
                    partes = linea.split(':', 1)
                    if len(partes) == 2:
                        ssid = partes[1].strip()
                
                # Buscar RSSI - MÉTODO DIRECTO
                if rssi is None:
                    # Método 1: Línea que empieza con "Rssi" o "RSSI"
                    if linea.lower().startswith('rssi') or linea.lower().startswith('señal'):
                        if ':' in linea:
                            partes = linea.split(':', 1)
                            if len(partes) == 2:
                                valor = partes[1].strip()
                                # Si tiene porcentaje, convertir
                                if '%' in valor:
                                    try:
                                        porc = int(re.search(r'(\d+)', valor).group(1))
                                        rssi = int((porc / 2) - 100)
                                    except:
                                        pass
                                else:
                                    # Si es un número directo
                                    try:
                                        rssi = int(re.search(r'-?\d+', valor).group())
                                    except:
                                        pass
                
                # SALIDA TEMPRANA: Si ya tenemos ambos, no seguir buscando
                if rssi is not None and ssid is not None:
                    return rssi, ssid
            
            return rssi, ssid
                
        except subprocess.TimeoutExpired:
            print("Timeout al obtener datos WiFi")
            return None, None
        except Exception as e:
            print(f"Error Windows: {e}")
            return None, None
    
    def _obtener_rssi_linux(self):
        """Obtiene RSSI en Linux - OPTIMIZADO"""
        try:
            # Intentar con iwconfig primero (más rápido)
            resultado = subprocess.check_output(['iwconfig'], 
                                               stderr=subprocess.DEVNULL,
                                               encoding='utf-8',
                                               timeout=1)
            rssi, ssid = None, None
            for linea in resultado.split('\n'):
                if ssid is None and 'ESSID' in linea:
                    match = re.search(r'ESSID:"([^"]+)"', linea)
                    if match:
                        ssid = match.group(1)
                if rssi is None and 'Signal level' in linea:
                    match = re.search(r'Signal level=(-?\d+)', linea)
                    if match:
                        rssi = int(match.group(1))
                
                if rssi is not None and ssid is not None:
                    return rssi, ssid
            
            if rssi is not None:
                return rssi, ssid
            
            # Fallback a nmcli
            resultado = subprocess.check_output(
                ['nmcli', '-t', '-f', 'ACTIVE,SSID,SIGNAL', 'dev', 'wifi'],
                encoding='utf-8',
                stderr=subprocess.DEVNULL,
                timeout=1
            )
            
            for linea in resultado.split('\n'):
                if linea.startswith('yes') or linea.startswith('sí'):
                    partes = linea.split(':')
                    if len(partes) >= 3:
                        ssid = partes[1]
                        signal = int(partes[2])
                        rssi = int((signal / 2) - 100)
                        return rssi, ssid
            
            return None, None
        except subprocess.TimeoutExpired:
            return None, None
        except Exception as e:
            print(f"Error Linux: {e}")
            return None, None
    
    def _obtener_rssi_macos(self):
        """Obtiene RSSI en macOS - OPTIMIZADO"""
        try:
            resultado = subprocess.check_output(
                ['/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport', '-I'],
                encoding='utf-8',
                stderr=subprocess.DEVNULL,
                timeout=1
            )
            rssi, ssid = None, None
            for linea in resultado.split('\n'):
                if rssi is None and 'agrCtlRSSI' in linea:
                    rssi = int(linea.split(':')[1].strip())
                if ssid is None and ' SSID' in linea and 'BSSID' not in linea:
                    ssid = linea.split(':')[1].strip()
                
                if rssi is not None and ssid is not None:
                    return rssi, ssid
                    
            return rssi, ssid
        except subprocess.TimeoutExpired:
            return None, None
        except Exception as e:
            print(f"Error macOS: {e}")
            return None, None
    
    def evaluar_calidad(self, rssi):
        """Evalúa la calidad de la señal"""
        if rssi >= -30:
            return "Excelente ✓✓✓", '#a6e3a1'
        elif rssi >= -67:
            return "Buena ✓✓", '#f9e2af'
        elif rssi >= -70:
            return "Regular ✓", '#fab387'
        elif rssi >= -80:
            return "Débil ⚠", '#f38ba8'
        else:
            return "Muy débil ✗", '#f38ba8'
    
    def probar_conexion(self):
        """Prueba la conexión WiFi una vez"""
        self.status_label.config(text="🧪 Probando conexión...", fg='#f9e2af')
        self.root.update()
        
        rssi, ssid = self.obtener_rssi()
        
        if rssi is not None:
            calidad, color = self.evaluar_calidad(rssi)
            mensaje = f"✓ Conexión exitosa!\n\n"
            mensaje += f"Red: {ssid}\n"
            mensaje += f"RSSI: {rssi} dBm\n"
            mensaje += f"Calidad: {calidad}"
            
            messagebox.showinfo("Prueba de Conexión", mensaje)
            self.status_label.config(text=f"✓ Prueba exitosa: {rssi} dBm", fg='#a6e3a1')
        else:
            mensaje = "✗ No se pudo detectar señal WiFi\n\n"
            mensaje += f"Sistema operativo: {self.sistema}\n\n"
            
            if self.sistema == "Windows":
                mensaje += "Verifica:\n"
                mensaje += "• Que estés conectado a WiFi\n"
                mensaje += "• Que el adaptador WiFi esté encendido\n"
                mensaje += "• Ejecuta 'netsh wlan show interfaces' en CMD"
            elif self.sistema == "Linux":
                mensaje += "Instala las herramientas necesarias:\n"
                mensaje += "• sudo apt-get install wireless-tools\n"
                mensaje += "• sudo apt-get install network-manager"
            
            messagebox.showerror("Error de Conexión", mensaje)
            self.status_label.config(text="✗ Error al leer WiFi", fg='#f38ba8')
    
    def toggle_monitoreo(self):
        """Inicia o detiene el monitoreo"""
        if not self.monitoreando:
            # Verificar que podemos leer WiFi antes de iniciar
            rssi, ssid = self.obtener_rssi()
            if rssi is None:
                messagebox.showerror("Error", 
                    "No se puede iniciar el monitoreo.\n\n"
                    "Usa el botón '🧪 Probar Conexión' para más detalles.")
                return
            
            self.monitoreando = True
            self.inicio = time.time()
            self.btn_iniciar.config(text="⏸ Detener Monitoreo", bg='#f38ba8')
            self.status_label.config(text="● Monitoreando en tiempo real...", fg='#a6e3a1')
            
            # Iniciar monitoreo en un hilo separado
            self.hilo_monitoreo = threading.Thread(target=self.loop_monitoreo, daemon=True)
            self.hilo_monitoreo.start()
        else:
            self.monitoreando = False
            self.btn_iniciar.config(text="▶ Iniciar Monitoreo", bg='#a6e3a1')
            self.status_label.config(text="⏸ Monitoreo detenido", fg='#f9e2af')
    
    def loop_monitoreo(self):
        """Loop de monitoreo optimizado que corre en un hilo separado"""
        while self.monitoreando:
            try:
                # OPTIMIZACIÓN: Medir el tiempo de ejecución
                tiempo_inicio_ciclo = time.time()
                
                rssi, ssid = self.obtener_rssi()
                
                if rssi is not None:
                    tiempo_transcurrido = time.time() - self.inicio
                    
                    # Agregar datos
                    self.datos_tiempo.append(tiempo_transcurrido)
                    self.datos_rssi.append(rssi)
                    self.datos_completos.append({
                        'tiempo': tiempo_transcurrido,
                        'rssi': rssi,
                        'ssid': ssid,
                        'timestamp': datetime.now().isoformat()
                    })
                    
                    self.ssid_actual = ssid
                    
                    # Actualizar interfaz en el hilo principal
                    self.root.after(0, lambda r=rssi, s=ssid, t=tiempo_transcurrido: 
                                   self.actualizar_labels(r, s, t))
                    self.root.after(0, self.actualizar_grafica)
                    
                    # Verificar alertas
                    if self.alertas_activadas.get() and rssi < self.umbral_alerta.get():
                        self.root.after(0, lambda r=rssi: self.mostrar_alerta(r))
                
                # OPTIMIZACIÓN: Intervalo adaptativo
                # Resta el tiempo que tardó el procesamiento para mantener el intervalo preciso
                tiempo_procesamiento = time.time() - tiempo_inicio_ciclo
                tiempo_espera = max(0.1, self.intervalo.get() - tiempo_procesamiento)
                time.sleep(tiempo_espera)
                
            except Exception as e:
                print(f"Error en loop de monitoreo: {e}")
                import traceback
                traceback.print_exc()
                self.monitoreando = False
                self.root.after(0, lambda: self.status_label.config(
                    text=f"✗ Error en monitoreo", fg='#f38ba8'))
                break
    
    def actualizar_labels(self, rssi, ssid, tiempo):
        """Actualiza los labels de información"""
        try:
            self.label_rssi_grande.config(text=f"{rssi}")
            calidad, color = self.evaluar_calidad(rssi)
            self.label_rssi_grande.config(foreground=color)
            
            self.label_ssid.config(text=ssid if ssid else "N/A")
            self.label_calidad.config(text=calidad)
            
            minutos = int(tiempo // 60)
            segundos = int(tiempo % 60)
            self.label_tiempo.config(text=f"{minutos:02d}:{segundos:02d}")
            self.label_mediciones.config(text=str(len(self.datos_rssi)))
            
            # Actualizar estadísticas
            if len(self.datos_rssi) > 0:
                promedio = np.mean(self.datos_rssi)
                maximo = np.max(self.datos_rssi)
                minimo = np.min(self.datos_rssi)
                variacion = maximo - minimo
                
                self.label_promedio.config(text=f"{promedio:.1f} dBm")
                self.label_maximo.config(text=f"{maximo} dBm")
                self.label_minimo.config(text=f"{minimo} dBm")
                self.label_variacion.config(text=f"{variacion} dBm")
        except Exception as e:
            print(f"Error actualizando labels: {e}")
    
    def actualizar_grafica(self):
        """Actualiza las gráficas"""
        try:
            if len(self.datos_tiempo) == 0:
                return
            
            # Gráfica de línea
            self.line.set_data(list(self.datos_tiempo), list(self.datos_rssi))
            self.ax1.relim()
            self.ax1.autoscale_view()
            
            # Dibujar marcadores
            for marcador in self.marcadores:
                tiempo = marcador['tiempo']
                if tiempo <= max(self.datos_tiempo):
                    idx = min(range(len(self.datos_tiempo)), 
                             key=lambda i: abs(self.datos_tiempo[i] - tiempo))
                    self.ax1.plot(self.datos_tiempo[idx], self.datos_rssi[idx], 
                                'r*', markersize=15, markeredgecolor='#cdd6f4',
                                markeredgewidth=1)
            
            # Histograma
            if len(self.datos_rssi) > 5:
                self.ax2.clear()
                self.ax2.hist(list(self.datos_rssi), bins=15, color='#89dceb', 
                             edgecolor='#cdd6f4', alpha=0.8)
                self.ax2.set_facecolor('#1e1e2e')
                self.ax2.set_title('Distribución de la Señal', 
                                  color='#cdd6f4', fontsize=14, fontweight='bold')
                self.ax2.set_xlabel('RSSI (dBm)', color='#cdd6f4', fontsize=11)
                self.ax2.set_ylabel('Frecuencia', color='#cdd6f4', fontsize=11)
                self.ax2.tick_params(colors='#cdd6f4')
                self.ax2.grid(True, alpha=0.2, color='#45475a', axis='y')
                
                if self.mostrar_estadisticas.get():
                    promedio = np.mean(self.datos_rssi)
                    self.ax2.axvline(promedio, color='#f38ba8', linestyle='--', 
                                   linewidth=2, label=f'Promedio: {promedio:.1f} dBm')
                    legend = self.ax2.legend(facecolor='#45475a', edgecolor='#7f849c')
                    plt.setp(legend.get_texts(), color='#cdd6f4')
            
            self.canvas.draw()
        except Exception as e:
            print(f"Error actualizando gráfica: {e}")
    
    def agregar_marcador(self):
        """Agrega un marcador en el punto actual"""
        if len(self.datos_tiempo) > 0:
            tiempo_actual = list(self.datos_tiempo)[-1]
            rssi_actual = list(self.datos_rssi)[-1]
            
            nota = simpledialog.askstring("Marcador", 
                                         "Nota para este punto (opcional):",
                                         parent=self.root)
            
            self.marcadores.append({
                'tiempo': tiempo_actual,
                'rssi': rssi_actual,
                'nota': nota or f"Marcador {len(self.marcadores) + 1}"
            })
            
            self.status_label.config(text=f"🔖 Marcador agregado: {nota or 'Sin nota'}", 
                                    fg='#f9e2af')
            self.actualizar_grafica()
        else:
            messagebox.showinfo("Info", "Inicia el monitoreo primero para agregar marcadores")
    
    def limpiar_datos(self):
        """Limpia todos los datos"""
        if len(self.datos_completos) > 0:
            if not messagebox.askyesno("Confirmar", 
                "¿Deseas limpiar todos los datos?\n\nEsta acción no se puede deshacer."):
                return
        
        self.datos_tiempo.clear()
        self.datos_rssi.clear()
        self.datos_completos.clear()
        self.marcadores.clear()
        
        self.line.set_data([], [])
        self.ax2.clear()
        self.canvas.draw()
        
        self.label_rssi_grande.config(text="--")
        self.label_mediciones.config(text="0")
        self.label_promedio.config(text="-- dBm")
        self.label_maximo.config(text="-- dBm")
        self.label_minimo.config(text="-- dBm")
        self.label_variacion.config(text="-- dBm")
        
        self.status_label.config(text="🗑️ Datos limpiados", fg='#cdd6f4')
    
    def exportar_csv(self):
        """Exporta los datos a CSV"""
        if not self.datos_completos:
            messagebox.showwarning("Sin datos", "No hay datos para exportar")
            return
        
        filename = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            initialfile=f"wifi_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )
        
        if filename:
            try:
                with open(filename, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=['timestamp', 'tiempo', 'rssi', 'ssid'])
                    writer.writeheader()
                    writer.writerows(self.datos_completos)
                
                messagebox.showinfo("Éxito", f"Datos exportados exitosamente a:\n{filename}")
                self.status_label.config(text=f"💾 Datos exportados", fg='#a6e3a1')
            except Exception as e:
                messagebox.showerror("Error", f"Error al exportar datos:\n{e}")
    
    def guardar_grafica(self):
        """Guarda la gráfica como imagen"""
        filename = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[("PNG files", "*.png"), ("JPEG files", "*.jpg"), ("All files", "*.*")],
            initialfile=f"wifi_graph_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        )
        
        if filename:
            try:
                self.fig.savefig(filename, dpi=300, facecolor='#313244', 
                               edgecolor='none', bbox_inches='tight')
                messagebox.showinfo("Éxito", f"Gráfica guardada exitosamente como:\n{filename}")
                self.status_label.config(text=f"📸 Gráfica guardada", fg='#a6e3a1')
            except Exception as e:
                messagebox.showerror("Error", f"Error al guardar gráfica:\n{e}")
    
    def mostrar_alerta(self, rssi):
        """Muestra una alerta de señal débil"""
        self.status_label.config(text=f"⚠️ Señal débil: {rssi} dBm", fg='#f38ba8')
        self.root.bell()
    
    def mostrar_ayuda(self):
        """Muestra información de ayuda"""
        ayuda = """WiFi Signal Analyzer Pro - Ayuda

🎯 Cómo usar:
1. Presiona '🧪 Probar Conexión' para verificar
2. Ajusta el intervalo de muestreo (0.2-5 seg)
   • 0.2-0.5s: Actualización muy rápida
   • 1.0s: Equilibrio perfecto
   • 2.0s+: Monitoreo a largo plazo
3. Presiona '▶ Iniciar Monitoreo'
4. Observa la señal en tiempo real
5. Usa '🔖 Marcar Punto' para marcar ubicaciones

📊 Niveles de señal:
• Excelente: ≥ -30 dBm
• Buena: -30 a -67 dBm
• Regular: -67 a -70 dBm
• Débil: -70 a -80 dBm
• Muy débil: < -80 dBm

💡 Consejos:
• Usa intervalo 0.2-0.5s para pruebas rápidas
• Acércate/aléjate del router para ver cambios
• Prueba con obstáculos (paredes, puertas)
• Marca cada habitación para mapear cobertura
• Exporta los datos para análisis posterior

⚡ Optimizaciones:
• Caché de codificación para lecturas rápidas
• Timeouts de 2 segundos para evitar bloqueos
• Intervalo adaptativo según tiempo de procesamiento

⚙️ Requisitos del sistema:
• Windows: Adaptador WiFi activo
• Linux: wireless-tools o network-manager
• macOS: Conexión WiFi activa
"""
        messagebox.showinfo("Ayuda", ayuda)


def main():
    root = tk.Tk()
    app = WiFiMonitorGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()