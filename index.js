const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');
const fs = require('fs');
const https = require('https');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 💡 1. PREPARAMOS EL DIRECTORIO PARA LOS ARCHIVOS DE LA NASA
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
        // 💡 2. AHORA USAMOS SWIEPH PARA EXIGIR MÁXIMA PRECISIÓN CON LOS ARCHIVOS
        const flag = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED; 

        for (const [nombre, id] of Object.entries(planetasIds)) {
            const calculado = await calcPlaneta(julianDay, id, flag);
            if (calculado.error || calculado.longitude === undefined) {
                console.log(`Ignorando ${nombre}:`, calculado.error);
                continue;
            }
            
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

// 💡 3. EL SCRIPT MÁGICO: DESCARGA LOS ARCHIVOS DE LA NASA ANTES DE INICIAR
const descargarArchivo = (archivo) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(epheDir, archivo);
        if (fs.existsSync(filePath)) return resolve();
        
        console.log(`Descargando datos espaciales: ${archivo}...`);
        https.get(`https://www.astro.com/ftp/swisseph/ephe/${archivo}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' } // Evita bloqueos
        }, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`Error descargando ${archivo}`));
            const fileStream = fs.createWriteStream(filePath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                console.log(`✅ ${archivo} listo.`);
                resolve();
            });
        }).on('error', reject);
    });
};

const iniciarServidor = async () => {
    try {
        // Descargamos Planetas, Luna y Asteroides (Quirón)
        await descargarArchivo('sepl_18.se1');
        await descargarArchivo('semo_18.se1');
        await descargarArchivo('seas_18.se1');
        
        const PORT = process.env.PORT || 10000;
        app.listen(PORT, () => {
            console.log(`🚀 Servidor Astral Pro 100% operativo en puerto ${PORT}`);
        });
    } catch (error) {
        console.error("Fallo crítico al iniciar:", error);
    }
};

iniciarServidor();
