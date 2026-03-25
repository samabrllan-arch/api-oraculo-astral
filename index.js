const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de la ruta de las efemérides (archivos de la NASA)
// La librería swisseph en Node ya incluye los básicos por defecto
swisseph.swe_set_ephe_path(__dirname + '/ephe');

app.get('/', (req, res) => {
    res.send('🔮 Motor de Cálculos Suizos Activo.');
});

app.post('/calcular', (req, res) => {
    try {
        const { dia, mes, anio, hora, lat, lng } = req.body;

        // Convertir hora a Tiempo Universal (UTC)
        // Por ahora asumimos que el usuario manda UTC, luego ajustamos zonas horarias
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

        // Calcular cada planeta
        for (const [nombre, id] of Object.entries(planetasIds)) {
            const calculado = swisseph.swe_calc_ut(julianDay, id, swisseph.SEFLG_SWIEPH);
            
            // calculado.longitude es el grado absoluto (0-360)
            const gradoAbsoluto = calculado.longitude;
            const signoIndex = Math.floor(gradoAbsoluto / 30);
            const gradoEnSigno = gradoAbsoluto % 30;

            resultados.push({
                nombre: nombre,
                grados_absolutos: gradoAbsoluto,
                grados: Math.floor(gradoEnSigno),
                minutos: Math.floor((gradoEnSigno - Math.floor(gradoEnSigno)) * 60),
                signo_id: signoIndex
            });
        }

        // Calcular Casas y Ascendente
        const casas = swisseph.swe_houses(julianDay, lat, lng, 'P'); 
        // El Ascendente es el índice 0 de points
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
        res.status(500).json({ status: "error", mensaje: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor Astral Pro en puerto ${PORT}`);
});
