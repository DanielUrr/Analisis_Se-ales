function generatePDFReport() {
    // Recolectar datos
    socket.emit('get_wifi_history', {limit: 1000});
    socket.once('wifi_history', function(data) {
        // Crear reporte HTML
        const reportHTML = `
            <html>
            <head><title>Reporte WiFi - ${new Date().toLocaleString()}</title></head>
            <body>
                <h1>📊 Reporte de Análisis WiFi</h1>
                <h2>Estadísticas</h2>
                <p>Promedio RSSI: ${data.stats.avg.toFixed(1)} dBm</p>
                <p>Mínimo: ${data.stats.min} dBm</p>
                <p>Máximo: ${data.stats.max} dBm</p>
                <p>Desviación: ${data.stats.std.toFixed(2)} dBm</p>
                <h2>Recomendaciones</h2>
                ${data.stats.avg < -70 ? '<p>⚠️ Señal débil. Considera reposicionar el router.</p>' : ''}
                ${data.stats.std > 10 ? '<p>⚠️ Alta variación. Puede haber interferencias.</p>' : ''}
            </body>
            </html>
        `;
        
        // Abrir en nueva ventana para imprimir
        const win = window.open('', '_blank');
        win.document.write(reportHTML);
        win.print();
    });
}
