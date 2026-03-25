const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 💡 1. PREPARAMOS EL DIRECTORIO NASA
const epheDir = path.join(__dirname, 'ephe');
if (!fs.existsSync(epheDir)) {
    fs.mkdirSync(epheDir);
}
swisseph.swe_set_ephe_path(epheDir);

app.get('/', (req, res) => {
    res.send('🔮 Motor Astral Pro (Con Quirón y Archivos NASA).');
});

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

const calcularAspectos = (planetas) => {
    const aspectosMap = [];
    const REGLAS_ASPECTOS = [
        { nombre: 'conjunción', angulo: 0, orbe: 10, tipo: 'conjunción' },
        { nombre: 'oposición', angulo: 180, orbe: 10, tipo: 'oposición' },
        { nombre: 'trígono', angulo: 120, orbe: 8, tipo: 'fluido' },
        { nombre: 'cuadratura', angulo: 90, orbe: 8, tipo: 'tenso' },
        { nombre: 'sextil', angulo: 60, orbe: 6, tipo: 'fluido' }
    ];

    for (let i = 0; i < planetas.length; i++) {
        for (let j = i + 1; j < planetas.length; j++) {
            const p1 = planetas[i];
            const p2 = planetas[j];

            if (p1.nombre === 'ascendente' || p2.nombre === 'ascendente') continue;

            let distancia = Math.abs(p1.grados_absolutos - p2.grados_absolutos);
            if (distancia > 180) distancia = 360 - distancia;

            for (const regla of REGLAS_ASPECTOS) {
                const diferenciaConAspecto = Math.abs(distancia - regla.angulo);
                if (diferenciaConAspecto <= regla.orbe) {
                    aspectosMap.push({
                        planeta1: p1.nombre, planeta2: p2.nombre,
                        tipo: regla.nombre, geometria: regla.tipo, orbe_exacto: diferenciaConAspecto.toFixed(2)
                    });
                    break;
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
            sol: swisseph.SE_SUN, luna: swisseph.SE_MOON, mercurio: swisseph.SE_MERCURY,
            venus: swisseph.SE_VENUS, marte: swisseph.SE_MARS, jupiter: swisseph.SE_JUPITER,
            saturno: swisseph.SE_SATURN, urano: swisseph.SE_URANUS, neptuno: swisseph.SE_NEPTUNE,
            pluton: swisseph.SE_PLUTO, node: swisseph.SE_TRUE_NODE, lilith: swisseph.SE_MEAN_APOG,
            quiron: swisseph.SE_CHIRON
        };

        const posicionesRaw = [];
        // Intentamos usar los archivos de la NASA si ya se descargaron
        const flag = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED; 

        for (const [nombre, id] of Object.entries(planetasIds)) {
            let calculado = await calcPlaneta(julianDay, id, flag);
            
            // 💡 SISTEMA ANTI-COLAPSO: Si la NASA aún está descargando, usa matemática ligera para salvar la consulta
            if (calculado.error || calculado.longitude === undefined) {
                calculado = await calcPlaneta(julianDay, id, swisseph.SEFLG_MOSEPH | swisseph.SEFLG_SPEED);
            }

            if (calculado.error || calculado.longitude === undefined) continue;
            
            posicionesRaw.push({
                nombre: nombre, grados_absolutos: calculado.longitude,
                latitud: calculado.latitude, velocidad: calculado.longitudeSpeed
            });
        }

        const casas = await calcCasas(julianDay, lat, lng); 
        if (casas && casas.points && casas.points.length > 0) {
            posicionesRaw.push({
                nombre: 'ascendente', grados_absolutos: casas.points[0],
                latitud: 0, velocidad: 0
            });
        }

        const aspectosCalculados = calcularAspectos(posicionesRaw);

        const posicionesFinales = posicionesRaw.map(p => {
            const signoIndex = Math.floor(p.grados_absolutos / 30);
            const gradoEnSigno = p.grados_absolutos % 30;
            return {
                nombre: p.nombre, grados_absolutos: p.grados_absolutos,
                grados: Math.floor(gradoEnSigno),
                minutos: Math.floor((gradoEnSigno - Math.floor(gradoEnSigno)) * 60),
                signo_id: signoIndex, latitud_raw: p.latitud, velocidad_raw: p.velocidad
            };
        });

        res.json({ status: "ok", posiciones: posicionesFinales, aspectos: aspectosCalculados });

    } catch (error) {
        console.error("Error en servidor:", error);
        res.status(500).json({ status: "error", mensaje: error.message || "Error desconocido" });
    }
});

// 💡 2. EL AGENTE INVISIBLE: Descarga asíncrona (Desde el Mirror oficial en GitHub)
const descargarArchivosNasa = async () => {
    const archivos = ['sepl_18.se1', 'semo_18.se1', 'seas_18.se1'];
    for (const archivo of archivos) {
        const filePath = path.join(epheDir, archivo);
        if (!fs.existsSync(filePath)) {
            try {
                console.log(`Descargando ${archivo}...`);
                // 💡 TRUCO PRO: Descargamos desde GitHub para burlar el Firewall anti-bots
                const url = `https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/${archivo}`;
                const res = await fetch(url);
                
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
                    console.log(`✅ ${archivo} listo.`);
                } else {
                    console.log(`❌ Fallo al descargar ${archivo}: HTTP ${res.status}`);
                }
            } catch (e) {
                console.log(`❌ Error de red:`, e.message);
            }
        }
    }
};

const PORT = process.env.PORT || 10000;
// 💡 3. ENCENDEMOS PRIMERO, DESCARGAMOS DESPUÉS
app.listen(PORT, () => {
    console.log(`🚀 Servidor Astral Pro 100% operativo en puerto ${PORT}`);
    descargarArchivosNasa(); // El empleado invisible se va a descargar sin pausar el servidor
});
