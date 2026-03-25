const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('🔮 Motor de Cálculos Suizos Activo y Asíncrono.');
});

// 💡 EL TRUCO: Envolver la librería suiza en Promesas para que Node la espere correctamente
const calcPlaneta = (julianDay, id, flag) => {
    return new Promise((resolve) => {
        swisseph.swe_calc_ut(julianDay, id, flag, (resultado) => {
            resolve(resultado);
        });
    });
};

const calcCasas = (julianDay, lat, lng) => {
    return new Promise((resolve) => {
        swisseph.swe_houses(julianDay, lat, lng, 'P', (resultado) => {
            resolve(resultado);
        });
    });
};

app.post('/calcular', async (req, res) => {
    try {
        const { dia, mes, anio, hora, lat, lng } = req.body;

        // swe_julday sí es instantáneo
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
            pluton: swisseph.SE_PLUTO,
            node: swisseph.SE_TRUE_NODE,
            lilith: swisseph.SE_MEAN_APOG
        };

        const resultados = [];
        const flag = swisseph.SEFLG_MOSEPH | swisseph.SEFLG_SPEED; 

        // 💡 Ahora usamos "await" para esperar a que cada cálculo termine
        for (const [nombre, id] of Object.entries(planetasIds)) {
            const calculado = await calcPlaneta(julianDay, id, flag);
            
            if (calculado.error || calculado.longitude === undefined) {
                console.log(`Error calculando ${nombre}:`, calculado);
                continue; 
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
                latitud: `${calculado.latitude > 0 ? '+' : ''}${calculado.latitude ? calculado.latitude.toFixed(2) : 0}°`,
                velocidad: (calculado.longitudeSpeed && calculado.longitudeSpeed < 0) ? 'Retrógrado' : 'Directo'
            });
        }

        // Calcular Casas y Ascendente esperando el resultado
        const casas = await calcCasas(julianDay, lat, lng); 
        if (casas && casas.points && casas.points.length > 0) {
            resultados.push({
                nombre: 'ascendente',
                grados_absolutos: casas.points[0],
                grados: Math.floor(casas.points[0] % 30),
                signo_id: Math.floor(casas.points[0] / 30)
            });
        }

        res.json({
            status: "ok",
            fecha: `${dia}/${mes}/${anio}`,
            posiciones: resultados
        });

    } catch (error) {
        console.error("Error en servidor:", error);
        res.status(500).json({ status: "error", mensaje: error.message || "Error desconocido" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor Astral Pro en puerto ${PORT}`);
});
