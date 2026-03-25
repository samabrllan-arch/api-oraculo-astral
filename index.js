const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('🔮 Motor de Cálculos Suizos Activo.');
});

app.post('/calcular', (req, res) => {
    try {
        const { dia, mes, anio, hora, lat, lng } = req.body;

        const julianDay = swisseph.swe_julday(anio, mes, dia, hora, swisseph.SE_GREG_CAL);

        const planetasIds = {
            sol: swisseph.SE_SUN,
            luna: swisseph.SE_MOON,
            mercurio: swisseph.SE_MERCURY,
            venus: swisseph.SE_VENUS,
            marte: swisseph.SE_MARS,
            jupiter: swisseph.SE_JUPITER,
            saturno: swisseph.SE_SATURN,
            urano: swisseph.SE_URANUS,
            neptuno: swisseph.SE_NEPTUNE,
            pluton: swisseph.SE_PLUTO
        };

        const resultados = [];

        // 💡 EL TRUCO: Usamos SEFLG_MOSEPH (4). Es el motor matemático integrado. No requiere archivos extra.
        // También sumamos SEFLG_SPEED (256) para que nos diga la velocidad (si está retrógrado)
        const flag = swisseph.SEFLG_MOSEPH | swisseph.SEFLG_SPEED; 

        for (const [nombre, id] of Object.entries(planetasIds)) {
            // El servidor intenta hacer el cálculo
            const calculado = swisseph.swe_calc_ut(julianDay, id, flag);
            
            // Si la librería devuelve un error en el cálculo, lanzamos la excepción
            if (calculado.error) {
                throw new Error(calculado.error);
            }
            
            const gradoAbsoluto = calculado.longitude;
            const signoIndex = Math.floor(gradoAbsoluto / 30);
            const gradoEnSigno = gradoAbsoluto % 30;

            resultados.push({
                nombre: nombre,
                grados_absolutos: gradoAbsoluto,
                grados: Math.floor(gradoEnSigno),
                minutos: Math.floor((gradoEnSigno - Math.floor(gradoEnSigno)) * 60),
                signo_id: signoIndex,
                latitud: `${calculado.latitude > 0 ? '+' : ''}${calculado.latitude.toFixed(2)}°`,
                velocidad: calculado.longitudeSpeed < 0 ? 'Retrógrado' : 'Directo'
            });
        }

        // Calcular Casas y Ascendente
        const casas = swisseph.swe_houses(julianDay, lat, lng, 'P'); 
        resultados.push({
            nombre: 'ascendente',
            grados_absolutos: casas.points[0],
            grados: Math.floor(casas.points[0] % 30),
            signo_id: Math.floor(casas.points[0] / 30)
        });

        res.json({
            status: "ok",
            fecha: `${dia}/${mes}/${anio}`,
            posiciones: resultados
        });

    } catch (error) {
        // Ahora si falla, devolverá el mensaje exacto para saber qué pasó
        console.error("Error en servidor:", error);
        res.status(500).json({ status: "error", mensaje: error.message || error });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor Astral Pro en puerto ${PORT}`);
});
