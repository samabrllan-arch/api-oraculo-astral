const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('🔮 Motor Astral Pro: Posiciones + Aspectos Geométricos.');
});

// Envolver la librería suiza en Promesas para Node.js
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

// 💡 FUNCIÓN MAESTRA: Calcula aspectos geométricos entre planetas
const calcularAspectos = (planetas) => {
    const aspectosMap = [];
    
    // Definición de aspectos estándar y sus orbes (márgenes de error) profesionales
    const REGLAS_ASPECTOS = [
        { nombre: 'conjunción', angulo: 0, orbe: 10, tipo: 'conjunción' },
        { nombre: 'oposición', angulo: 180, orbe: 10, tipo: 'oposición' },
        { nombre: 'trígono', angulo: 120, orbe: 8, tipo: 'fluido' },
        { nombre: 'cuadratura', angulo: 90, orbe: 8, tipo: 'tenso' },
        { nombre: 'sextil', angulo: 60, orbe: 6, tipo: 'fluido' }
    ];

    // Comparamos cada planeta con todos los demás (sin repetir)
    for (let i = 0; i < planetas.length; i++) {
        for (let j = i + 1; j < planetas.length; j++) {
            const p1 = planetas[i];
            const p2 = planetas[j];

            // No calculamos aspectos con el Ascendente aquí (se hace diferente)
            if (p1.nombre === 'ascendente' || p2.nombre === 'ascendente') continue;

            // Calculamos la distancia más corta en el círculo (0-180°)
            let distancia = Math.abs(p1.grados_absolutos - p2.grados_absolutos);
            if (distancia > 180) distancia = 360 - distancia;

            // Verificamos si la distancia encaja en alguna regla
            for (const regla of REGLAS_ASPECTOS) {
                const diferenciaConAspecto = Math.abs(distancia - regla.angulo);
                
                if (diferenciaConAspecto <= regla.orbe) {
                    aspectosMap.push({
                        planeta1: p1.nombre,
                        planeta2: p2.nombre,
                        tipo: regla.nombre, 
                        geometria: regla.tipo, // 'fluido' o 'tenso' para el color
                        orbe_exacto: diferenciaConAspecto.toFixed(2)
                    });
                    break; // Un par de planetas solo puede tener un aspecto mayor
                }
            }
        }
    }
    return aspectosMap;
};

app.post('/calcular', async (req, res) => {
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
            pluton: swisseph.SE_PLUTO,
            node: swisseph.SE_TRUE_NODE,
            lilith: swisseph.SE_MEAN_APOG,
            quiron: swisseph.SE_CHIRON // 💡 ¡NUEVO: Quirón incluido!
        };

        const posicionesRaw = [];
        const flag = swisseph.SEFLG_MOSEPH | swisseph.SEFLG_SPEED; 

        // Esperar cálculos de planetas
        for (const [nombre, id] of Object.entries(planetasIds)) {
            const calculado = await calcPlaneta(julianDay, id, flag);
            
            if (calculado.error || calculado.longitude === undefined) continue;
            
            const gradoAbsoluto = calculado.longitude;
            posicionesRaw.push({
                nombre: nombre,
                grados_absolutos: gradoAbsoluto,
                latitud: calculado.latitude,
                velocidad: calculado.longitudeSpeed
            });
        }

        // Calcular Casas y Ascendente esperando el resultado
        const casas = await calcCasas(julianDay, lat, lng); 
        if (casas && casas.points && casas.points.length > 0) {
            posicionesRaw.push({
                nombre: 'ascendente',
                grados_absolutos: casas.points[0],
                latitud: 0, // No aplica
                velocidad: 0 // No aplica
            });
        }

        // 💡 MAESTRÍA: Calcular Aspectos Geométricos con los datos reales
        const aspectosCalculados = calcularAspectos(posicionesRaw);

        // Formatear posiciones finales para el cliente
        const posicionesFinales = posicionesRaw.map(p => {
            const signoIndex = Math.floor(p.grados_absolutos / 30);
            const gradoEnSigno = p.grados_absolutos % 30;
            return {
                nombre: p.nombre,
                grados_absolutos: p.grados_absolutos,
                grados: Math.floor(gradoEnSigno),
                minutos: Math.floor((gradoEnSigno - Math.floor(gradoEnSigno)) * 60),
                signo_id: signoIndex,
                latitud_raw: p.latitud,
                velocidad_raw: p.velocidad
            };
        });

        res.json({
            status: "ok",
            posiciones: posicionesFinales,
            aspectos: aspectosCalculados // 💡 ¡NUEVO: Líneas geométricas incluidas!
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
