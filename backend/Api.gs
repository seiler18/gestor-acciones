/**
 * API del dashboard web — solo lectura.
 * Fuente: https://github.com/seiler18/gestor-acciones/blob/main/backend/Api.gs
 *
 * Entrega HECHOS, no cálculos: movimientos, precios, dólar, alertas y
 * umbrales. Las posiciones y resultados los calcula el front
 * (src/lib/cartera.js). Así cualquier otro backend que sirva este mismo JSON
 * —otra hoja, un Excel, una base de datos— hace funcionar el dashboard sin
 * reimplementar la lógica, y el contrato no depende de en qué fila cae un
 * total en la hoja Posiciones.
 *
 * Contrato: docs/contrato.md en el repo. Si cambias un campo, sube
 * API_VERSION y actualiza el documento y src/demo.js.
 *
 * Acceso: POST con cuerpo text/plain {accion, clave}. La clave NO se guarda:
 * en las Propiedades del script solo queda su SHA-256 (quien pueda editar la
 * hoja puede leer las propiedades; así no se lleva la clave). text/plain
 * evita el preflight CORS, que Apps Script no contesta.
 *
 * Despliegue: Implementar → Aplicación web · Ejecutar como: Yo ·
 * Acceso: Cualquier usuario. «Cualquier usuario» es correcto: sin la clave
 * la API solo responde el estado del servicio.
 */

var API_VERSION = 1;
var PROP_HASH_CLAVE = 'API_CLAVE_SHA256';
var FALLOS_POR_MINUTO = 10;
var MAX_ALERTAS = 30;

var TIPOS_API = {
  'Compra acción': 'compra',
  'Venta acción': 'venta',
  Dividendo: 'dividendo',
  'Compra USD': 'compraUsd',
  'Venta USD': 'ventaUsd',
};

/* GET no entrega datos: sirve para comprobar que la URL /exec es la correcta
   sin exponer nada. */
function doGet() {
  return json_({ ok: true, servicio: 'gestor-acciones', version: API_VERSION });
}

function doPost(e) {
  try {
    var body = {};
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      return json_({ ok: false, error: 'Petición no válida' });
    }

    // El freno va ANTES de verificar: sin él, adivinar a ciegas gasta la cuota
    // de ejecuciones del dueño y tumba también el lector de correos.
    if (fallosRecientes_() >= FALLOS_POR_MINUTO) {
      return json_({ ok: false, error: 'Demasiados intentos. Espera un minuto.' });
    }
    if (!claveValida_(body.clave)) {
      registrarFallo_();
      return json_({ ok: false, sesion: false, error: 'Clave incorrecta' });
    }

    if (body.accion === 'cartera') return json_(Object.assign({ ok: true }, cartera_()));
    return json_({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'Error interno' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===== clave ===== */

/* Se ejecuta desde el menú Fintual → «Generar clave del dashboard web».
   Muestra la clave UNA vez en pantalla y guarda solo su hash. No va al
   registro de ejecución: ese registro lo ve cualquiera con acceso al proyecto
   y no caduca. Generar otra invalida la anterior al instante. */
function generarClaveApi() {
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (err) {
    throw new Error('Ejecútala desde la hoja: menú Fintual → Generar clave del dashboard web.');
  }
  var clave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(PROP_HASH_CLAVE, sha256_(clave));
  ui.alert(
    'Clave del dashboard web',
    'Cópiala ahora: no se vuelve a mostrar.\n\n' +
      clave +
      '\n\nPégala en la página cuando te la pida. Si la pierdes, genera otra (la anterior deja de servir).',
    ui.ButtonSet.OK
  );
}

function claveValida_(clave) {
  if (typeof clave !== 'string' || clave.length < 32 || clave.length > 200) return false;
  var guardado = PropertiesService.getScriptProperties().getProperty(PROP_HASH_CLAVE);
  if (!guardado) return false;
  return igualesTiempoConstante_(sha256_(clave), guardado);
}

function sha256_(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

// Compara hashes de largo fijo sin cortar en el primer carácter distinto.
function igualesTiempoConstante_(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function claveFallos_() {
  return 'fallos_' + Math.floor(Date.now() / 60000);
}
function fallosRecientes_() {
  return Number(CacheService.getScriptCache().get(claveFallos_())) || 0;
}
function registrarFallo_() {
  var c = CacheService.getScriptCache();
  var k = claveFallos_();
  c.put(k, String((Number(c.get(k)) || 0) + 1), 120);
}

/* ===== datos ===== */

function cartera_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var precios = leerPrecios_(ss, tz);
  var dolar = null;
  precios = precios.filter(function (p) {
    if (p.ticker === 'USDCLP') {
      dolar = { clp: p.precio, actualizado: p.actualizado };
      return false;
    }
    return true;
  });
  var cfg = ss.getSheetByName('Configuración');
  return {
    version: API_VERSION,
    generado: new Date().toISOString(),
    zona: tz,
    moneda: 'USD',
    dolar: dolar,
    precios: precios,
    movimientos: leerMovimientos_(ss, tz),
    alertas: leerAlertas_(ss, tz),
    umbrales: {
      ventaPct: cfg ? numero_(cfg.getRange(5, 2).getValue()) : null,
      caidaPct: cfg ? numero_(cfg.getRange(6, 2).getValue()) : null,
    },
    ultimaEjecucion: cfg ? fechaHora_(cfg.getRange(9, 2).getValue(), tz) : null,
  };
}

/* Movimientos: columnas A–J. La K (ID del correo de Gmail) no sale: al
   dashboard no le sirve y es un identificador de tu buzón. */
function leerMovimientos_(ss, tz) {
  var s = ss.getSheetByName('Movimientos');
  if (!s || s.getLastRow() < 2) return [];
  var filas = s.getRange(2, 1, s.getLastRow() - 1, 10).getValues();
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    var r = filas[i];
    var tipo = TIPOS_API[String(r[1]).trim()];
    var fecha = fecha_(r[0], tz);
    if (!tipo || !fecha) continue; // fila vacía o de otro tipo: no se inventa
    out.push({
      fecha: fecha,
      tipo: tipo,
      activo: String(r[2] || ''),
      ticker: String(r[3] || '').trim(),
      cantidad: numero_(r[4]),
      usd: numero_(r[5]),
      clp: numero_(r[6]),
      tipoCambio: numero_(r[7]),
      comisionClp: numero_(r[8]),
      fuente: String(r[9] || ''),
    });
  }
  // Orden cronológico estable: la hoja mezcla lo cargado a mano (arriba) con lo importado (abajo).
  out.sort(function (a, b) {
    return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
  });
  return out;
}

function leerPrecios_(ss, tz) {
  var s = ss.getSheetByName('Precios');
  if (!s || s.getLastRow() < 2) return [];
  return s
    .getRange(2, 1, s.getLastRow() - 1, 5)
    .getValues()
    .filter(function (r) {
      return r[0];
    })
    .map(function (r) {
      return {
        ticker: String(r[0]).trim(),
        nombre: String(r[1] || ''),
        precio: numero_(r[2]), // "sin dato" → null
        cambioDia: numero_(r[3]), // fracción: -0.012 = -1,2 %
        actualizado: fechaHora_(r[4], tz),
      };
    });
}

function leerAlertas_(ss, tz) {
  var s = ss.getSheetByName('Alertas');
  if (!s || s.getLastRow() < 2) return [];
  var n = Math.min(MAX_ALERTAS, s.getLastRow() - 1);
  return s
    .getRange(s.getLastRow() - n + 1, 1, n, 3)
    .getValues()
    .reverse()
    .map(function (r) {
      return { fecha: fechaHora_(r[0], tz), tipo: String(r[1] || ''), detalle: String(r[2] || '') };
    });
}

/* ===== normalización ===== */

/* Números: la hoja trae números reales, pero las filas escritas a mano
   pueden ser texto con coma decimal («0,17»). */
function numero_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === '' || v == null) return null;
  var s = String(v).trim().replace(/\s/g, '');
  if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  var n = Number(s);
  return isFinite(n) && s !== '' ? n : null;
}

/* Fechas: Date de la hoja o texto dd/mm/aaaa (hay filas cargadas a mano así).
   Salen como aaaa-mm-dd, que ordena bien como texto. */
function fecha_(v, tz) {
  if (esFecha_(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var m = String(v || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

// Sin instanceof: un Date de otro contexto (la simulación de las pruebas) no lo pasa.
function esFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function fechaHora_(v, tz) {
  if (esFecha_(v)) return Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss");
  return null;
}
