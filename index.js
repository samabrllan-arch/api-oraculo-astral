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

app.get('/', (req, res) => res.send('🔮 Motor Astral Pro (Con Dominantes).'));

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
            if (p1.nombre === 'ascendente' || p2.nombre === 'ascendente') continue;

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

// 💡 NUEVO MOTOR DE DOMINANTES
const calcularDominantes = (posiciones, aspectos, casas) => {
    const signos = ['aries', 'tauro', 'geminis', 'cancer', 'leo', 'virgo', 'libra', 'escorpio', 'sagitario', 'capricornio', 'acuario', 'piscis'];
    const elementos = ['Fuego', 'Tierra', 'Aire', 'Agua'];
    
    // Regencias modernas
    const regentes = { aries:'marte', tauro:'venus', geminis:'mercurio', cancer:'luna', leo:'sol', virgo:'mercurio', libra:'venus', escorpio:'pluton', sagitario:'jupiter', capricornio:'saturno', acuario:'urano', piscis:'neptuno' };
    
    // Dignidades (simplificadas)
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

    const getElemento = (signoIdx) => elementos[signoIdx % 4];

    // Inicializar planetas
    const validos = ['sol', 'luna', 'mercurio', 'venus', 'marte', 'jupiter', 'saturno', 'urano', 'neptuno', 'pluton'];
    validos.forEach(p => domPlanetas[p] = { signo: 0, casa: 0, angulo: 0, gob: 0, asp: 0 });

    const sol = posiciones.find(p => p.nombre === 'sol');
    const luna = posiciones.find(p => p.nombre === 'luna');
    const asc = posiciones.find(p => p.nombre === 'ascendente');
    const mcGrados = casas.points ? casas.points[9] : 0; // MC es la casa 10 (índice 9)

    // Puntos Elementos (Big 3)
    if(sol) domElementos[getElemento(Math.floor(sol.grados_absolutos/30))].sol += 3;
    if(luna) domElementos[getElemento(Math.floor(luna.grados_absolutos/30))].sol += 3;
    if(asc) domElementos[getElemento(Math.floor(asc.grados_absolutos/30))].sol += 3;

    posiciones.forEach(p => {
        if (!validos.includes(p.nombre)) return;
        const nombre = p.nombre;
        const signoNom = signos[Math.floor(p.grados_absolutos / 30)];
        const elemento = getElemento(Math.floor(p.grados_absolutos / 30));

        // 1. Signo (+6 reg, +5 ex, +1 caida, +0 detr, +3 neutral)
        let ptsSigno = 3; 
        if (dignidades[nombre]) {
            if (dignidades[nombre].reg === signoNom) ptsSigno = 6;
            else if (dignidades[nombre].ex === signoNom) ptsSigno = 5;
            else if (dignidades[nombre].caida === signoNom) ptsSigno = 1;
            else if (dignidades[nombre].detr === signoNom) ptsSigno = 0;
        }
        domPlanetas[nombre].signo += ptsSigno;

        // 2. Ángulos (+5 conj ASC/MC) - Simplificado con distancia
        if (asc) {
            let distAsc = Math.abs(p.grados_absolutos - asc.grados_absolutos);
            if (distAsc > 180) distAsc = 360 - distAsc;
            if (distAsc <= 6) domPlanetas[nombre].angulo += 5;
        }
        if (mcGrados) {
            let distMc = Math.abs(p.grados_absolutos - mcGrados);
            if (distMc > 180) distMc = 360 - distMc;
            if (distMc <= 6) domPlanetas[nombre].angulo += 5;
        }

        // 3. Aspectos (+3 arm, +2 conj, +1 tensos)
        aspectos.forEach(a => {
            if (a.planeta1 === nombre || a.planeta2 === nombre) {
                if (a.tipo === 'conjunción') domPlanetas[nombre].asp += 2;
                else if (a.geometria === 'fluido') domPlanetas[nombre].asp += 3;
                else if (a.geometria === 'tenso') domPlanetas[nombre].asp += 1;
            }
        });

        // 4. Elementos (Pers y Trans)
        if (['mercurio', 'venus', 'marte', 'jupiter'].includes(nombre)) domElementos[elemento].pers += 2;
        if (['saturno', 'urano', 'neptuno', 'pluton'].includes(nombre)) domElementos[elemento].trans += 1;
    });

    // 5. Gobernación (Regente del ASC y Sol)
    if (asc) {
        const regAsc = regentes[signos[Math.floor(asc.grados_absolutos / 30)]];
        if (domPlanetas[regAsc]) domPlanetas[regAsc].gob += 3;
    }
    if (sol) {
        const regSol = regentes[signos[Math.floor(sol.grados_absolutos / 30)]];
        if (domPlanetas[regSol]) domPlanetas[regSol].gob += 1;
    }

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

app.post('/calcular', async (req, res) => {
    try {
        const { dia, mes, anio, hora, lat, lng } = req.body;
        const julianDay = swisseph.swe_julday(anio, mes, dia, hora, swisseph.SE_GREG_CAL);

        const planetasIds = { sol: swisseph.SE_SUN, luna: swisseph.SE_MOON, mercurio: swisseph.SE_MERCURY, venus: swisseph.SE_VENUS, marte: swisseph.SE_MARS, jupiter: swisseph.SE_JUPITER, saturno: swisseph.SE_SATURN, urano: swisseph.SE_URANUS, neptuno: swisseph.SE_NEPTUNE, pluton: swisseph.SE_PLUTO, node: swisseph.SE_TRUE_NODE, lilith: swisseph.SE_MEAN_APOG, quiron: swisseph.SE_CHIRON };
        const posicionesRaw = [];
        // 💡 Preparamos ambas banderas. Usamos 2048 directamente (código bruto de SEFLG_EQUATORIAL)
        const flagEcliptica = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED; 
        const flagEcuador = swisseph.SEFLG_SWIEPH | 2048; 

        for (const [nombre, id] of Object.entries(planetasIds)) {
            // 1. Calculamos Coordenadas Eclípticas (Zodiaco)
            let calcEcl = await calcPlaneta(julianDay, id, flagEcliptica);
            if (calcEcl.error || typeof calcEcl.longitude !== 'number') {
                calcEcl = await calcPlaneta(julianDay, id, swisseph.SEFLG_MOSEPH | swisseph.SEFLG_SPEED);
            }
            if (calcEcl.error || typeof calcEcl.longitude !== 'number') continue;

            // 2. Calculamos Coordenadas Ecuatoriales (RA y Declinación)
            let calcEq = await calcPlaneta(julianDay, id, flagEcuador);
            if (calcEq.error || typeof calcEq.longitude !== 'number') {
                calcEq = await calcPlaneta(julianDay, id, swisseph.SEFLG_MOSEPH | 2048);
            }

            posicionesRaw.push({ 
                nombre, 
                grados_absolutos: calcEcl.longitude, 
                latitud: calcEcl.latitude, 
                velocidad: calcEcl.longitudeSpeed,
                ra_raw: (calcEq && typeof calcEq.longitude === 'number') ? calcEq.longitude : 0,
                decl_raw: (calcEq && typeof calcEq.latitude === 'number') ? calcEq.latitude : 0
            });
        }

        const casas = await calcCasas(julianDay, lat, lng); 
        if (casas && casas.points && casas.points.length > 0) {
            posicionesRaw.push({ 
                nombre: 'ascendente', grados_absolutos: casas.points[0], 
                latitud: 0, velocidad: 0, ra_raw: 0, decl_raw: 0 
            });
        }

        const aspectosCalculados = calcularAspectos(posicionesRaw);
        const dominantes = calcularDominantes(posicionesRaw, aspectosCalculados, casas);

        // 💡 FUNCIÓN BLINDADA ANTI-NAN
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
            ra: p.nombre === 'ascendente' ? "N/A" : formatGrados(p.ra_raw, false),
            decl: p.nombre === 'ascendente' ? "N/A" : formatGrados(p.decl_raw, true)
        }));

        res.json({ status: "ok", posiciones: posicionesFinales, aspectos: aspectosCalculados, dominantes: dominantes });
    } catch (error) { res.status(500).json({ status: "error", mensaje: error.message }); }
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
