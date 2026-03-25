const express = require('express');
const cors = require('cors');

const app = express();

// Permite que tu app de React Native se conecte sin bloqueos de seguridad
app.use(cors());
app.use(express.json());

// Ruta 1: Para revisar en el navegador que el servidor está despierto
app.get('/', (req, res) => {
    res.send('🔮 El motor astrológico está despierto y respirando en la nube.');
});

// Ruta 2: Aquí es donde tu App mandará los datos para calcular
app.post('/calcular', (req, res) => {
    const { fecha, hora, latitud, longitud } = req.body;
    
    // Aquí conectaremos la librería Swiss Ephemeris en el siguiente paso.
    // Por ahora le devolvemos un mensaje de éxito a tu App.
    res.json({
        status: "exito",
        mensaje: "Coordenadas recibidas en el espacio",
        datos_recibidos: { fecha, hora, latitud, longitud }
    });
});

// Encender el motor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor astral escuchando en el puerto ${PORT}`);
});
