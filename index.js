const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const epheDir = path.join(__dirname, 'ephe');
if (!fs.existsSync(epheDir)) fs.mkdirSync(epheDir);
swisseph.swe_set_ephe_path(epheDir);

app.get('/', (req, res) => res.send('🔮 Motor Astral Pro (Con Dominantes Reales y Astrofísica).'));

const calcPlaneta = (julianDay, id, flag) => new Promise(resolve => swisseph.swe_calc_ut(julianDay, id, flag, resolve));
const calcCasas = (julianDay, lat, lng) => new Promise(resolve => swisseph.swe_houses(julianDay, lat, lng, 'P', resolve));

const calcularAspectos = (planetas) => {
    const aspectosMap = [];
    const REGLAS = [
        { nombre: 'conjunción', angulo: 0, orbe: 10, tipo: 'conjunción' },
        { nombre: 'oposición', angulo: 180, orbe: 10, tipo: 'oposición' },
        { nombre: 'trígono', angulo: 120, orbe: 8, tipo: 'fluido' },
        { nombre: 'cuadratura', angulo: 90, orbe: 8, tipo: 'tenso' },
        { nombre: 'sextil', angulo: 60, orbe: 6, tipo: 'fluido' }
    ];

    for (let i = 0; i < planetas.length; i++) {
        for (let j = i + 1; j < planetas.length; j++) {
            const p1 = planetas[i], p2 = planetas[j];
            if (p1.nombre === 'ascendente' || p2.nombre === 'ascendente' || p1.nombre === 'mc' || p2.nombre === 'mc') continue;

            let dist = Math.abs(p1.grados_absolutos - p2.grados_absolutos);
            if (dist > 180) dist = 360 - dist;

            for (const r of REGLAS) {
                if (Math.abs(dist - r.angulo) <= r.orbe) {
                    aspectosMap.push({ planeta1: p1.nombre, planeta2: p2.nombre, tipo: r.nombre, geometria: r.tipo });
                    break;
                }
            }
        }
    }
    return aspectosMap;
};

// 💡 MOTOR DE DOMINANTES COMPLETADO (CASAS, ÁNGULOS Y GOBERNACIONES)
const calcularDominantes = (posiciones, aspectos, casas) => {
    const signos = ['aries', 'tauro', 'geminis', 'cancer', 'leo', 'virgo', 'libra', 'escorpio', 'sagitario', 'capricornio', 'acuario', 'piscis'];
    const elementos = ['Fuego', 'Tierra', 'Aire', 'Agua'];
    
    const regentes = { aries:'marte', tauro:'venus', geminis:'mercurio', cancer:'luna', leo:'sol', virgo:'mercurio', libra:'venus', escorpio:'pluton', sagitario:'jupiter', capricornio:'saturno', acuario:'urano', piscis:'neptuno' };
    
    const dignidades = {
        sol: { reg: 'leo', ex: 'aries', caida: 'libra', detr: 'acuario' },
        luna: { reg: 'cancer', ex: 'tauro', caida: 'escorpio', detr: 'capricornio' },
        mercurio: { reg: 'geminis', ex: 'virgo', caida: 'piscis', detr: 'sagitario' },
        venus: { reg: 'libra', ex: 'piscis', caida: 'virgo', detr: 'aries' },
        marte: { reg: 'aries', ex: 'capricornio', caida: 'cancer', detr: 'libra' },
        jupiter: { reg: 'sagitario', ex: 'cancer', caida: 'capricornio', detr: 'geminis' },
        saturno: { reg: 'capricornio', ex: 'libra', caida: 'aries', detr: 'cancer' }
    };

    let domPlanetas = {};
    let domElementos = { 'Fuego': { sol:0, pers:0, trans:0, dom:0 }, 'Tierra': { sol:0, pers:0, trans:0, dom:0 }, 'Aire': { sol:0, pers:0, trans:0, dom:0 }, 'Agua': { sol:0, pers:0, trans:0, dom:0 } };

    const validos = ['sol', 'luna', 'mercurio', 'venus', 'marte', 'jupiter', 'saturno', 'urano', 'neptuno', 'pluton'];
    validos.forEach(p => domPlanetas[p] = { signo: 0, casa: 0, angulo: 0, gob: 0, asp: 0 });

    const getElemento = (signoIdx) => elementos[signoIdx % 4];

    // 💡 LÓGICA DE CASAS (Cruzamos los 360 grados para saber en qué casa cayó el planeta)
    const getCasa = (grados) => {
        if (!casas || !casas.house || casas.house.length < 12) return 0;
        for (let i = 0; i < 12; i++) {
            let curr = casas.house[i];
            let next = casas.house[(i + 1) % 12];
            if (curr < next) {
                if (grados >= curr && grados < next) return i + 1;
            } else { // Si cruza del grado 359 al grado 0
                if (grados >= curr || grados < next) return i + 1;
            }
        }
        return 1;
    };

    const asc = posiciones.find(p => p.nombre === 'ascendente');
    const mc = posiciones.find(p => p.nombre === 'mc');
    const sol = posiciones.find(p => p.nombre === 'sol');
    const luna = posiciones.find(p => p.nombre === 'luna');

    const ascGrados = asc ? asc.grados_absolutos : null;
    const mcGrados = mc ? mc.grados_absolutos : null;
    const dscGrados = ascGrados !== null ? (ascGrados + 180) % 360 : null; // Descendente opuesto al ASC
    const icGrados = mcGrados !== null ? (mcGrados + 180) % 360 : null; // Fondo de Cielo opuesto al MC

    const checkConj = (deg1, deg2, orbe) => {
        let dist = Math.abs(deg1 - deg2);
        if (dist > 180) dist = 360 - dist;
        return dist <= orbe;
    };

    // Puntos Elementos (Big 3)
    if(sol) domElementos[getElemento(Math.floor(sol.grados_absolutos/30))].sol += 3;
    if(luna) domElementos[getElemento(Math.floor(luna.grados_absolutos/30))].sol += 3;
    if(asc) domElementos[getElemento(Math.floor(asc.grados_absolutos/30))].sol += 3;

    posiciones.forEach(p => {
        if (!validos.includes(p.nombre)) return;
        const nombre = p.nombre;
        const signoIdx = Math.floor(p.grados_absolutos / 30);
        const signoNom = signos[signoIdx];
        const elemento = getElemento(signoIdx);

        // 1. Fuerza por Signo
        let ptsSigno = 3; 
        if (dignidades[nombre]) {
            if (dignidades[nombre].reg === signoNom) ptsSigno = 6;
            else if (dignidades[nombre].ex === signoNom) ptsSigno = 5;
            else if (dignidades[nombre].caida === signoNom) ptsSigno = 1;
            else if (dignidades[nombre].detr === signoNom) ptsSigno = 0;
        }
        domPlanetas[nombre].signo += ptsSigno;

        // 2. Fuerza por Casa (+1 si está en casa 1 o 10, o en su casa natural)
        const casaNum = getCasa(p.grados_absolutos);
        if (casaNum === 1 || casaNum === 10) domPlanetas[nombre].casa += 1;
        const regentesCasas = {1:'marte', 2:'venus', 3:'mercurio', 4:'luna', 5:'sol', 6:'mercurio', 7:'venus', 8:'pluton', 9:'jupiter', 10:'saturno', 11:'urano', 12:'neptuno'};
        if (regentesCasas[casaNum] === nombre) domPlanetas[nombre].casa += 1;

        // 3. Ángulos (Conjunción con ASC, MC, DSC o IC)
        if (ascGrados !== null && checkConj(p.grados_absolutos, ascGrados, 6)) domPlanetas[nombre].angulo += 5;
        if (mcGrados !== null && checkConj(p.grados_absolutos, mcGrados, 6)) domPlanetas[nombre].angulo += 5;
        if (dscGrados !== null && checkConj(p.grados_absolutos, dscGrados, 6)) domPlanetas[nombre].angulo += 3;
        if (icGrados !== null && checkConj(p.grados_absolutos, icGrados, 6)) domPlanetas[nombre].angulo += 3;

        // 4. Elementos (Personales y Transpersonales)
        if (['mercurio', 'venus', 'marte', 'jupiter'].includes(nombre)) domElementos[elemento].pers += 2;
        if (['saturno', 'urano', 'neptuno', 'pluton'].includes(nombre)) domElementos[elemento].trans += 1;
    });

    // 5. Gobernación (Revisamos qué planeta gobierna a cada cuerpo y ángulo de la carta)
    posiciones.forEach(p => {
        const signoIdx = Math.floor(p.grados_absolutos / 30);
        const regente = regentes[signos[signoIdx]];
        if (!domPlanetas[regente]) return; // Si no es uno de los planetas válidos, ignorar

        if (p.nombre === 'ascendente') domPlanetas[regente].gob += 3;
        else if (p.nombre === 'mc') domPlanetas[regente].gob += 1;
        else if (p.nombre === 'sol') domPlanetas[regente].gob += 1;
        else if (p.nombre === 'luna') domPlanetas[regente].gob += 1;
        else if (validos.includes(p.nombre)) domPlanetas[regente].gob += 1; // Rige a un planeta normal
    });

    // 6. Aspectos
    aspectos.forEach(a => {
        const p1 = a.planeta1.toLowerCase();
        const p2 = a.planeta2.toLowerCase();
        
        if (domPlanetas[p1]) {
            if (a.tipo === 'conjunción') domPlanetas[p1].asp += 2;
            else if (a.geometria === 'fluido') domPlanetas[p1].asp += 3;
            else if (a.geometria === 'tenso') domPlanetas[p1].asp += 1;
        }
        if (domPlanetas[p2]) {
            if (a.tipo === 'conjunción') domPlanetas[p2].asp += 2;
            else if (a.geometria === 'fluido') domPlanetas[p2].asp += 3;
            else if (a.geometria === 'tenso') domPlanetas[p2].asp += 1;
        }
    });

    // Formatear Planetas
    let planetasArr = Object.keys(domPlanetas).map(k => {
        const d = domPlanetas[k];
        const suma = d.signo + d.casa + d.angulo + d.gob + d.asp;
        return { 
            nombre: k.charAt(0).toUpperCase() + k.slice(1), 
            signo: `+${d.signo}`, casa: `+${d.casa}`, angulo: `+${d.angulo}`, 
            gob: `+${d.gob}`, asp: `+${d.asp}`, suma: suma.toString()
        };
    }).sort((a, b) => parseInt(b.suma) - parseInt(a.suma));

    // Calcular Porcentajes Planetas y sumar a Elemento Dominante
    const totalPuntosPlanetas = planetasArr.reduce((acc, p) => acc + parseInt(p.suma), 0);
    planetasArr = planetasArr.map((p, i) => {
        if (i < 3) { // Top 3 planetas dan +2 a su elemento
            const planetaData = posiciones.find(pos => pos.nombre === p.nombre.toLowerCase());
            if (planetaData) {
                const el = getElemento(Math.floor(planetaData.grados_absolutos / 30));
                domElementos[el].dom += 2;
            }
        }
        return { ...p, pct: totalPuntosPlanetas > 0 ? ((parseInt(p.suma) / totalPuntosPlanetas) * 100).toFixed(2) + '%' : '0%' };
    });

    // Formatear Elementos
    let elementosArr = Object.keys(domElementos).map(k => {
        const d = domElementos[k];
        const suma = d.sol + d.pers + d.trans + d.dom;
        return { elemento: k, sol: `+${d.sol}`, pers: `+${d.pers}`, trans: `+${d.trans}`, dom: `+${d.dom}`, suma: suma.toString() };
    }).sort((a, b) => parseInt(b.suma) - parseInt(a.suma));

    const totalPuntosElementos = elementosArr.reduce((acc, el) => acc + parseInt(el.suma), 0);
    elementosArr = elementosArr.map(el => ({ ...el, pct: totalPuntosElementos > 0 ? ((parseInt(el.suma) / totalPuntosElementos) * 100).toFixed(2) + '%' : '0%' }));

    return { planetas: planetasArr, elementos: elementosArr };
};

// Trigonometría esférica pura para sacar Ascensión Recta y Declinación
const eclipticaAEcuador = (lonDeg, latDeg) => {
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;
    const eps = 23.4392911 * rad; 
    
    const lon = lonDeg * rad;
    const lat = latDeg * rad;
    
    const x = Math.cos(lat) * Math.cos(lon);
    const y = Math.cos(lat) * Math.sin(lon) * Math.cos(eps) - Math.sin(lat) * Math.sin(eps);
    const z = Math.cos(lat) * Math.sin(lon) * Math.sin(eps) + Math.sin(lat) * Math.cos(eps);
    
    let ra = Math.atan2(y, x) * deg;
    if (ra < 0) ra += 360;
    const decl = Math.asin(z) * deg;
    
    return { ra, decl };
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
        const flag = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED; 

        for (const [nombre, id] of Object.entries(planetasIds)) {
            let calculado = await calcPlaneta(julianDay, id, flag);
            if (calculado.error || typeof calculado.longitude !== 'number') {
                calculado = await calcPlaneta(julianDay, id, swisseph.SEFLG_MOSEPH | swisseph.SEFLG_SPEED);
            }
            if (calculado.error || typeof calculado.longitude !== 'number') continue;

            const ecuador = eclipticaAEcuador(calculado.longitude, calculado.latitude);

            posicionesRaw.push({ 
                nombre, 
                grados_absolutos: calculado.longitude, 
                latitud: calculado.latitude, 
                velocidad: calculado.longitudeSpeed,
                ra_raw: ecuador.ra,       
                decl_raw: ecuador.decl    
            });
        }

        // 💡 Calculamos las casas y extraemos el ASC y el MC para agregarlos a las posiciones
        const casas = await calcCasas(julianDay, lat, lng); 
        if (casas) {
            const ascG = casas.ascendant !== undefined ? casas.ascendant : (casas.points ? casas.points[0] : 0);
            const mcG = casas.mc !== undefined ? casas.mc : (casas.points ? casas.points[1] : 0);
            
            if (ascG) posicionesRaw.push({ nombre: 'ascendente', grados_absolutos: ascG, latitud: 0, velocidad: 0, ra_raw: 0, decl_raw: 0 });
            if (mcG) posicionesRaw.push({ nombre: 'mc', grados_absolutos: mcG, latitud: 0, velocidad: 0, ra_raw: 0, decl_raw: 0 });
        }

        const aspectosCalculados = calcularAspectos(posicionesRaw);
        const dominantes = calcularDominantes(posicionesRaw, aspectosCalculados, casas);

        const formatGrados = (decimales, conSigno = false) => {
            if (decimales === undefined || decimales === null || isNaN(decimales)) return "0°00'";
            const deg = Math.floor(Math.abs(decimales));
            const min = Math.floor((Math.abs(decimales) - deg) * 60);
            const sign = conSigno ? (decimales >= 0 ? '+' : '-') : '';
            return `${sign}${deg}°${String(min).padStart(2, '0')}'`;
        };

        const posicionesFinales = posicionesRaw.map(p => ({
            nombre: p.nombre, 
            grados_absolutos: p.grados_absolutos,
            grados: Math.floor(p.grados_absolutos % 30), 
            minutos: Math.floor(((p.grados_absolutos % 30) - Math.floor(p.grados_absolutos % 30)) * 60),
            signo_id: Math.floor(p.grados_absolutos / 30), 
            latitud_raw: p.latitud, 
            velocidad_raw: p.velocidad,
            ra: (p.nombre === 'ascendente' || p.nombre === 'mc') ? "N/A" : formatGrados(p.ra_raw, false),
            decl: (p.nombre === 'ascendente' || p.nombre === 'mc') ? "N/A" : formatGrados(p.decl_raw, true)
        }));

        res.json({ status: "ok", posiciones: posicionesFinales, aspectos: aspectosCalculados, dominantes: dominantes });

    } catch (error) {
        console.error("Error en servidor:", error);
        res.status(500).json({ status: "error", mensaje: error.message || "Error desconocido" });
    }
});

const descargarArchivosNasa = async () => {
    const archivos = ['sepl_18.se1', 'semo_18.se1', 'seas_18.se1'];
    for (const archivo of archivos) {
        const filePath = path.join(epheDir, archivo);
        if (!fs.existsSync(filePath)) {
            try {
                const res = await fetch(`https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/${archivo}`);
                if (res.ok) fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
            } catch (e) { console.log(e.message); }
        }
    }
};

app.listen(process.env.PORT || 10000, () => { console.log(`🚀 Servidor Pro Operativo`); descargarArchivosNasa(); });
