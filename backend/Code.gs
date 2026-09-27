/**
 * GESTOR DE ACCIONES — backend en Google Sheets (v4.2)
 * Fuente: https://github.com/seiler18/gestor-acciones/blob/main/backend/Code.gs
 * Va junto a Api.gs (el endpoint que lee el dashboard web).
 *
 * v4.2 (versionado en el repo). Respecto al código que corría en la hoja el
 * 2026-09-27, la lógica es la misma salvo:
 * - sin historial ni lista de activos embebidos (MOVIMIENTOS/WATCHLIST vacíos);
 * - buildMovimientos/buildMapa no vacían una hoja que ya tiene datos;
 * - espacios duros escritos como   (visibles) y también se normaliza  ;
 * - cabecera del Dashboard sin nombre propio;
 * - menú con «Generar clave del dashboard web» (Api.gs).
 *
 * FINTUAL — Sistema consolidado v4
 * Novedades v4:
 * 1) AUTO-MAPA: si compras/vendes/recibes dividendo de un activo nuevo, el script busca el ticker
 * por nombre (Yahoo Finance), lo agrega solo a la hoja "Mapa" y te avisa para que lo verifiques.
 * 2) PRECIOS POR SCRIPT: los precios ya NO dependen de GOOGLEFINANCE. El script los consulta por
 * internet y los escribe como VALORES fijos → el archivo funciona igual si lo abres/exportas a Excel.
 * (Si la consulta falla, usa GOOGLEFINANCE como respaldo solo en Google Sheets.)
 * 3) DASHBOARD renovado: tarjetas KPI, tabla de composición de cartera con barras y colores
 * verde/rojo automáticos. Todo con formatos y fórmulas compatibles con Excel.
 *
 * Instalación / actualización:
 * - Borra TODO el código anterior, pega este y guarda.
 * - Ejecuta "configurarTodo" UNA vez (es seguro re-ejecutarlo: protege Movimientos importados,
 * Mapa, Configuración y Alertas; solo reconstruye las hojas derivadas).
 * - Autoriza los permisos (Gmail + conexión externa para precios).
 */
/* Semilla de Movimientos y Mapa para una hoja NUEVA.
   Vacías a propósito: este archivo vive en un repositorio público y el
   historial de operaciones es dato personal. La hoja en uso ya tiene sus
   datos; si montas una desde cero, pega aquí tus filas SOLO en la copia del
   editor de Apps Script, nunca en el repo. */
var MOVIMIENTOS = [];
var WATCHLIST = [];
var TC_REF = 917.43;

/* ===== utilidades ===== */
function S_() {
  var loc = (SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetLocale() || '').toLowerCase();
  var lang = loc.split(/[_-]/)[0];
  var coma = [
    'es',
    'pt',
    'fr',
    'de',
    'it',
    'nl',
    'ru',
    'pl',
    'tr',
    'da',
    'fi',
    'sv',
    'nb',
    'cs',
    'hu',
    'ro',
    'el',
    'id',
    'vi',
    'uk',
    'ca',
    'hr',
    'sk',
    'sl',
    'bg',
  ];
  return coma.indexOf(lang) >= 0 ? ';' : ',';
}
function num_(s) {
  if (s == null) return null;
  s = String(s)
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  var v = parseFloat(s);
  return isNaN(v) ? null : v;
}
function grab_(text, re) {
  var m = text.match(re);
  return m ? num_(m[1]) : null;
}
function txt_(text, re) {
  var m = text.match(re);
  return m ? m[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
}

/* ===== menú ===== */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Fintual')
    .addItem('Configurar todo (primera vez)', 'configurarTodo')
    .addItem('Leer correos nuevos ahora', 'leerCorreosManual')
    .addItem('Actualizar precios ahora', 'actualizarPreciosManual')
    .addItem('Actualizar y revisar alertas', 'tareaProgramada')
    .addSeparator()
    .addItem('Generar clave del dashboard web', 'generarClaveApi')
    .addToUi();
}

/* ===== setup ===== */
function configurarTodo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Mapa: solo se crea si no existe o está vacío (protege activos auto-agregados)
  var mp = ss.getSheetByName('Mapa');
  if (!mp || mp.getLastRow() < 2) buildMapa(ss);

  // Movimientos: si ya hay correos importados, no se reescribe
  var mv = ss.getSheetByName('Movimientos');
  var tieneImport = false;
  if (mv && mv.getLastRow() > 1) {
    var ids = mv.getRange(2, 11, mv.getLastRow() - 1, 1).getValues();
    tieneImport = ids.some(function (r) {
      return r[0] !== '' && r[0] != null;
    });
  }
  if (!tieneImport) buildMovimientos(ss);

  // Configuración y Alertas: solo si no existen (protege tus parámetros e historial)
  if (!ss.getSheetByName('Configuración')) buildConfig(ss);
  if (!ss.getSheetByName('Alertas')) buildAlertas(ss);

  reconstruirDerivadas(ss);

  var h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja1');
  if (h1 && ss.getSheets().length > 1) ss.deleteSheet(h1);
  PropertiesService.getScriptProperties().deleteProperty('lastSig');
  setupTrigger();
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    'Listo. Sistema v4 configurado.\n\n• Precios escritos por el script (compatibles con Excel)\n• Auto-registro de activos nuevos en Mapa\n• Dashboard renovado\n• Lector de correos Gmail activo\n\nEs seguro re-ejecutar esta opción: tus importaciones, Mapa, Configuración y Alertas quedan protegidos.',
  );
}

function tareaProgramada() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  leerCorreosFintual(ss);
  reconstruirDerivadas(ss);
  checkAlerts();
}
function leerCorreosManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var n = leerCorreosFintual(ss);
  reconstruirDerivadas(ss);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Lectura de correos terminada. Movimientos nuevos importados: ' + n + '.');
}
function actualizarPreciosManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  reconstruirDerivadas(ss);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Precios y hojas actualizados.');
}
function reconstruirDerivadas(ss) {
  buildPrecios(ss);
  actualizarPrecios(ss);
  buildPosiciones(ss);
  buildResultados(ss);
  buildDashboard(ss);
}

function sheet_(ss, name, pos) {
  var s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name, pos);
  s.clear();
  return s;
}

/* ===== tickers dinámicos desde Movimientos ===== */
function tickersDeMovimientos(ss) {
  var s = ss.getSheetByName('Movimientos');
  var last = s.getLastRow();
  if (last < 2) return [];
  var d = s.getRange(2, 2, last - 1, 3).getValues(); // B tipo, C activo, D ticker
  var set = {};
  d.forEach(function (r) {
    var tipo = r[0],
      tk = r[2];
    if ((tipo === 'Compra acción' || tipo === 'Venta acción' || tipo === 'Dividendo') && tk && tk !== 'USD')
      set[tk] = true;
  });
  return Object.keys(set).sort();
}
function mapaTickerNombre(ss) {
  var s = ss.getSheetByName('Mapa'),
    m = {};
  if (!s || s.getLastRow() < 2) return m;
  var v = s.getRange(2, 1, s.getLastRow() - 1, 2).getValues();
  v.forEach(function (r) {
    if (r[1]) m[r[1]] = r[0];
  });
  return m;
}

/* ===== builders ===== */
function buildMapa(ss) {
  var s = sheet_(ss, 'Mapa', 7);
  s.appendRow(['Nombre del activo (como aparece en el correo)', 'Ticker']);
  var data = [];
  for (var i = 0; i < WATCHLIST.length; i++) data.push([WATCHLIST[i][1], WATCHLIST[i][0]]);
  data.sort(function (a, b) {
    return a[0] < b[0] ? -1 : 1;
  });
  if (data.length) s.getRange(2, 1, data.length, 2).setValues(data);
  s.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#2E5496').setFontColor('white');
  s.setColumnWidth(1, 360);
  s.setColumnWidth(2, 90);
  s.setFrozenRows(1);
}

function buildMovimientos(ss) {
  // Nunca sobre datos existentes: sheet_() hace clear() y se llevaría filas cargadas a mano.
  var previa = ss.getSheetByName('Movimientos');
  if (previa && previa.getLastRow() > 1) return;
  var s = sheet_(ss, 'Movimientos', 1);
  s.appendRow([
    'Fecha',
    'Tipo',
    'Activo',
    'Ticker',
    'Cantidad',
    'Monto USD',
    'Monto CLP',
    'Tipo cambio',
    'Comision CLP',
    'Fuente',
    'ID Correo',
  ]);
  if (MOVIMIENTOS.length) s.getRange(2, 1, MOVIMIENTOS.length, 10).setValues(MOVIMIENTOS);
  s.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#2E5496').setFontColor('white');
  s.setFrozenRows(1);
  s.autoResizeColumns(1, 11);
}

/* ===== PRECIOS (escritos por el script — compatibles con Excel) ===== */
function buildPrecios(ss) {
  var s = sheet_(ss, 'Precios', 2);
  s.appendRow(['Ticker', 'Nombre', 'Precio actual (USD)', 'Cambio % hoy', 'Actualizado']);
  var tks = tickersDeMovimientos(ss);
  var nombres = mapaTickerNombre(ss);
  var data = [];
  for (var i = 0; i < tks.length; i++) data.push([tks[i], nombres[tks[i]] || tks[i], '', '', '']);
  data.push(['USDCLP', 'Dólar observado (CLP/USD)', '', '', '']);
  s.getRange(2, 1, data.length, 5).setValues(data);
  s.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#2E5496').setFontColor('white');
  s.getRange(2, 3, data.length, 1).setNumberFormat('#,##0.00');
  s.getRange(2, 4, data.length, 1).setNumberFormat('0.00%');
  s.getRange(2, 5, data.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  s.setFrozenRows(1);
  s.autoResizeColumns(1, 5);
}

function actualizarPrecios(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName('Precios');
  if (!s || s.getLastRow() < 2) return 0;
  var S = S_();
  var n = s.getLastRow() - 1;
  var symbols = s
    .getRange(2, 1, n, 1)
    .getValues()
    .map(function (r) {
      return String(r[0]);
    });
  var reqs = symbols.map(function (tk) {
    var y = tk === 'USDCLP' ? 'CLP=X' : tk;
    return {
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(y) + '?range=1d&interval=1d',
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    };
  });
  var res = null;
  try {
    res = UrlFetchApp.fetchAll(reqs);
  } catch (e) {
    res = null;
  }
  var now = new Date(),
    ok = 0;
  for (var i = 0; i < n; i++) {
    var row = 2 + i,
      px = null,
      chg = null;
    if (res) {
      try {
        if (res[i].getResponseCode() === 200) {
          var meta = JSON.parse(res[i].getContentText()).chart.result[0].meta;
          px = meta.regularMarketPrice;
          var pc = meta.chartPreviousClose || meta.previousClose;
          if (px != null && pc) chg = px / pc - 1;
        }
      } catch (err) {}
    }
    if (px != null) {
      s.getRange(row, 3, 1, 3).setValues([[px, chg != null ? chg : '', now]]);
      ok++;
    } else if (symbols[i] === 'USDCLP') {
      // respaldo solo-Sheets si falla la consulta
      s.getRange(row, 3).setFormula('=IFERROR(GOOGLEFINANCE("CURRENCY:USDCLP")' + S + '"sin dato")');
      s.getRange(row, 5).setValue(now);
    } else {
      s.getRange(row, 3).setFormula('=IFERROR(GOOGLEFINANCE("' + symbols[i] + '"' + S + '"price")' + S + '"sin dato")');
      s.getRange(row, 4).setFormula('=IFERROR(GOOGLEFINANCE("' + symbols[i] + '"' + S + '"changepct")/100' + S + '"")');
      s.getRange(row, 5).setValue(now);
    }
  }
  return ok;
}

function buildPosiciones(ss) {
  var S = S_();
  var s = sheet_(ss, 'Posiciones', 3);
  s.appendRow([
    'Ticker',
    'Activo',
    'Acc. compradas',
    'USD invertido',
    'Acc. vendidas',
    'USD ventas',
    'Tenencia',
    'Precio prom. compra',
    'Precio mercado',
    'Valor actual',
    'G/P realizada',
    'G/P no realizada',
    'Dividendos',
  ]);
  var tks = tickersDeMovimientos(ss);
  var nombres = mapaTickerNombre(ss);
  var L = 5000;
  for (var r = 0; r < tks.length; r++) {
    var row = r + 2;
    var A = 'Movimientos!$D$2:$D$' + L,
      B = 'Movimientos!$B$2:$B$' + L,
      Q = 'Movimientos!$E$2:$E$' + L,
      U = 'Movimientos!$F$2:$F$' + L;
    s.getRange(row, 1).setValue(tks[r]);
    s.getRange(row, 2).setValue(nombres[tks[r]] || tks[r]);
    s.getRange(row, 3).setFormula('=SUMIFS(' + Q + S + A + S + 'A' + row + S + B + S + '"Compra acción")');
    s.getRange(row, 4).setFormula('=SUMIFS(' + U + S + A + S + 'A' + row + S + B + S + '"Compra acción")');
    s.getRange(row, 5).setFormula('=SUMIFS(' + Q + S + A + S + 'A' + row + S + B + S + '"Venta acción")');
    s.getRange(row, 6).setFormula('=SUMIFS(' + U + S + A + S + 'A' + row + S + B + S + '"Venta acción")');
    var dec = S === ';' ? '0,001' : '0.001';
    s.getRange(row, 7).setFormula(
      '=IF(ABS(C' + row + '-E' + row + ')<' + dec + S + '0' + S + 'C' + row + '-E' + row + ')',
    );
    s.getRange(row, 8).setFormula('=IF(C' + row + '>0' + S + 'D' + row + '/C' + row + S + '0)');
    s.getRange(row, 9).setFormula(
      '=IFERROR(VLOOKUP(A' + row + S + 'Precios!$A$2:$C$5000' + S + '3' + S + 'FALSE)' + S + '"")',
    );
    s.getRange(row, 10).setFormula('=IF(ISNUMBER(I' + row + ')' + S + 'G' + row + '*I' + row + S + '"")');
    // G/P realizada = ventas − acciones vendidas × costo promedio; no realizada =
    // valor − tenencia × costo promedio. Son las fórmulas del código que corre en
    // la hoja (verificado contra él el 2026-09-27). Una variante que circuló en
    // Drive (ventas − invertido si la tenencia es residual) cargaba todo el costo
    // a lo vendido con un residuo de 0,0001 acciones. src/lib/cartera.js calcula
    // lo mismo; si cambias una, cambia la otra.
    s.getRange(row, 11).setFormula('=F' + row + '-(E' + row + '*H' + row + ')');
    s.getRange(row, 12).setFormula('=IF(ISNUMBER(I' + row + ')' + S + 'J' + row + '-(G' + row + '*H' + row + ')' + S + '"")');
    s.getRange(row, 13).setFormula('=SUMIFS(' + U + S + A + S + 'A' + row + S + B + S + '"Dividendo")');
  }
  var n = tks.length;
  s.getRange(n + 2, 2)
    .setValue('TOTALES')
    .setFontWeight('bold');
  [4, 6, 10, 11, 12, 13].forEach(function (c) {
    var col = String.fromCharCode(64 + c);
    s.getRange(n + 2, c)
      .setFormula('=SUM(' + col + '2:' + col + (n + 1) + ')')
      .setFontWeight('bold');
  });
  s.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#2E5496').setFontColor('white');
  s.getRange(2, 4, n + 1, 1).setNumberFormat('"US$ "#,##0.00');
  s.getRange(2, 6, n + 1, 1).setNumberFormat('"US$ "#,##0.00');
  s.getRange(2, 8, n + 1, 5).setNumberFormat('"US$ "#,##0.00');
  s.getRange(2, 13, n + 1, 1).setNumberFormat('"US$ "#,##0.00');
  s.setFrozenRows(1);
  s.autoResizeColumns(1, 13);
}

function buildResultados(ss) {
  var S = S_();
  var s = sheet_(ss, 'Resultados', 4);
  s.appendRow(['Activo', 'G/P realizada', 'G/P no realizada', 'Dividendos', 'Resultado total']);
  var n = tickersDeMovimientos(ss).length;
  for (var r = 0; r < n; r++) {
    var row = r + 2,
      pr = r + 2;
    s.getRange(row, 1).setFormula('=Posiciones!A' + pr);
    s.getRange(row, 2).setFormula('=Posiciones!K' + pr);
    s.getRange(row, 3).setFormula('=IF(ISNUMBER(Posiciones!L' + pr + ')' + S + 'Posiciones!L' + pr + S + '0)');
    s.getRange(row, 4).setFormula('=Posiciones!M' + pr);
    s.getRange(row, 5).setFormula('=B' + row + '+C' + row + '+D' + row);
  }
  s.getRange(n + 2, 1)
    .setValue('TOTAL')
    .setFontWeight('bold');
  ['B', 'C', 'D', 'E'].forEach(function (col) {
    s.getRange(n + 2, col.charCodeAt(0) - 64)
      .setFormula('=SUM(' + col + '2:' + col + (n + 1) + ')')
      .setFontWeight('bold');
  });
  s.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#2E5496').setFontColor('white');
  s.getRange(2, 2, n + 1, 4).setNumberFormat('"US$ "#,##0.00');
  s.setFrozenRows(1);
  s.autoResizeColumns(1, 5);
}

/* ===== DASHBOARD v4 (diseño moderno, compatible con Excel) ===== */
function buildDashboard(ss) {
  var S = S_();
  var s = sheet_(ss, 'Dashboard', 0);
  s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).breakApart();
  s.setHiddenGridlines(true);

  var tks = tickersDeMovimientos(ss);
  var n = Math.max(tks.length, 1);
  var t = tks.length + 2; // fila TOTALES en Posiciones/Resultados
  var tz = ss.getSpreadsheetTimeZone();

  var firstC = 16,
    lastC = 15 + n; // tabla composición
  var rowR = lastC + 2; // sección resultado por activo
  var headR = rowR + 1,
    firstR = rowR + 2,
    lastR = firstR + n - 1,
    totR = lastR + 1;

  // fondo general
  s.getRange(1, 1, totR + 4, 12).setBackground('#F4F6FA');

  // ---- banner ----
  s.setRowHeight(2, 34);
  s.setRowHeight(3, 10);
  s.setRowHeight(4, 20);
  s.getRange(2, 2, 2, 10)
    .merge()
    .setValue('📊 GESTOR DE ACCIONES')
    .setBackground('#1F3864')
    .setFontColor('#FFFFFF')
    .setFontSize(20)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  s.getRange(4, 2, 1, 10)
    .merge()
    .setValue('Moneda base: USD · Actualizado: ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm'))
    .setBackground('#2E5496')
    .setFontColor('#DCE6F5')
    .setFontSize(9)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  // ---- chips fila 6 ----
  s.setRowHeight(6, 26);
  s.getRange(6, 2, 1, 2)
    .merge()
    .setValue('💵 Dólar hoy (CLP/USD)')
    .setBackground('#1F3864')
    .setFontColor('#FFFFFF')
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  s.getRange(6, 4)
    .setFormula('=IFERROR(VLOOKUP("USDCLP"' + S + 'Precios!$A$2:$C$5000' + S + '3' + S + 'FALSE)' + S + '"—")')
    .setBackground('#FFF2CC')
    .setFontWeight('bold')
    .setFontSize(12)
    .setNumberFormat('#,##0.00')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  s.getRange(6, 6, 1, 2)
    .merge()
    .setValue('🧾 Comisiones pagadas (CLP)')
    .setBackground('#1F3864')
    .setFontColor('#FFFFFF')
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  s.getRange(6, 8)
    .setFormula('=SUM(Movimientos!I2:I5000)')
    .setBackground('#FFF2CC')
    .setFontWeight('bold')
    .setFontSize(12)
    .setNumberFormat('"$ "#,##0')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // ---- tarjetas KPI ----
  var kpis1 = [
    ['USD INVERTIDO EN ACCIONES', '=Posiciones!D' + t, '"US$ "#,##0.00'],
    ['USD RECIBIDO POR VENTAS', '=Posiciones!F' + t, '"US$ "#,##0.00'],
    ['DIVIDENDOS ACUMULADOS', '=Posiciones!M' + t, '"US$ "#,##0.00'],
    ['VALOR CARTERA HOY (USD)', '=Posiciones!J' + t, '"US$ "#,##0.00'],
  ];
  var kpis2 = [
    ['G/P REALIZADA', '=Resultados!B' + t, '"US$ "#,##0.00'],
    ['G/P NO REALIZADA', '=Resultados!C' + t, '"US$ "#,##0.00'],
    ['RESULTADO TOTAL (USD)', '=Resultados!E' + t, '"US$ "#,##0.00'],
    ['RESULTADO APROX (CLP)', '=IFERROR(Resultados!E' + t + '*$D$6' + S + '"")', '"$ "#,##0'],
  ];
  function pintarKpis(fila, arr) {
    s.setRowHeight(fila, 20);
    s.setRowHeight(fila + 1, 34);
    for (var i = 0; i < arr.length; i++) {
      var c = 2 + i * 2;
      s.getRange(fila, c, 1, 2)
        .merge()
        .setValue(arr[i][0])
        .setBackground('#2E5496')
        .setFontColor('#FFFFFF')
        .setFontSize(8)
        .setFontWeight('bold')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');
      s.getRange(fila + 1, c, 1, 2)
        .merge()
        .setFormula(arr[i][1])
        .setBackground('#FFFFFF')
        .setFontSize(14)
        .setFontWeight('bold')
        .setNumberFormat(arr[i][2])
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');
      s.getRange(fila, c, 2, 2).setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        '#B7C4DC',
        SpreadsheetApp.BorderStyle.SOLID,
      );
    }
  }
  pintarKpis(8, kpis1);
  pintarKpis(11, kpis2);

  // ---- sección: composición de cartera ----
  s.setRowHeight(14, 24);
  s.getRange(14, 2, 1, 10)
    .merge()
    .setValue('🏦 COMPOSICIÓN DE CARTERA — posiciones activas')
    .setBackground('#1F3864')
    .setFontColor('#FFFFFF')
    .setFontSize(11)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  var hdr = [
    'Ticker',
    'Activo',
    'Tenencia',
    'Costo prom.',
    'Precio actual',
    'Valor (USD)',
    '% cartera',
    'G/P no real.',
    'Distribución',
  ];
  s.getRange(15, 2, 1, hdr.length)
    .setValues([hdr])
    .setBackground('#2E5496')
    .setFontColor('#FFFFFF')
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  for (var i = 0; i < n; i++) {
    var r = firstC + i,
      pr = i + 2;
    s.getRange(r, 2).setFormula('=IF(Posiciones!$G' + pr + '>0' + S + 'Posiciones!$A' + pr + S + '"")');
    s.getRange(r, 3).setFormula('=IF($B' + r + '=""' + S + '""' + S + 'Posiciones!$B' + pr + ')');
    s.getRange(r, 4).setFormula('=IF($B' + r + '=""' + S + '""' + S + 'Posiciones!$G' + pr + ')');
    s.getRange(r, 5).setFormula('=IF($B' + r + '=""' + S + '""' + S + 'Posiciones!$H' + pr + ')');
    s.getRange(r, 6).setFormula('=IF($B' + r + '=""' + S + '""' + S + 'Posiciones!$I' + pr + ')');
    s.getRange(r, 7).setFormula('=IF($B' + r + '=""' + S + '""' + S + 'Posiciones!$J' + pr + ')');
    s.getRange(r, 8).setFormula(
      '=IF($B' + r + '=""' + S + '""' + S + 'IFERROR($G' + r + '/Posiciones!$J$' + t + S + '""))',
    );
    s.getRange(r, 9).setFormula('=IF($B' + r + '=""' + S + '""' + S + 'Posiciones!$L' + pr + ')');
    s.getRange(r, 10).setFormula(
      '=IF($B' +
        r +
        '=""' +
        S +
        '""' +
        S +
        'IFERROR(REPT("█"' +
        S +
        'MAX(1' +
        S +
        'ROUND($H' +
        r +
        '*30' +
        S +
        '0)))' +
        S +
        '""))',
    );
    s.getRange(r, 2, 1, 9)
      .setBackground(i % 2 === 0 ? '#FFFFFF' : '#EAF0F9')
      .setVerticalAlignment('middle');
  }
  s.getRange(firstC, 4, n, 1).setNumberFormat('#,##0.0000');
  s.getRange(firstC, 5, n, 3).setNumberFormat('"US$ "#,##0.00');
  s.getRange(firstC, 8, n, 1).setNumberFormat('0.0%');
  s.getRange(firstC, 9, n, 1).setNumberFormat('"US$ "#,##0.00');
  s.getRange(firstC, 10, n, 1).setFontColor('#2E5496').setFontSize(9);
  s.getRange(15, 2, n + 1, 9).setBorder(
    true,
    true,
    true,
    true,
    true,
    true,
    '#D5DCE8',
    SpreadsheetApp.BorderStyle.SOLID,
  );

  // ---- sección: resultado por activo ----
  s.setRowHeight(rowR, 24);
  s.getRange(rowR, 2, 1, 10)
    .merge()
    .setValue('📈 RESULTADO POR ACTIVO — realizada + no realizada + dividendos')
    .setBackground('#1F3864')
    .setFontColor('#FFFFFF')
    .setFontSize(11)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  s.getRange(headR, 2, 1, 5)
    .setValues([['Ticker', 'G/P realizada', 'Dividendos', 'Resultado total', 'Balance']])
    .setBackground('#2E5496')
    .setFontColor('#FFFFFF')
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  for (var j = 0; j < n; j++) {
    var rr = firstR + j,
      pj = j + 2;
    s.getRange(rr, 2).setFormula('=Resultados!A' + pj);
    s.getRange(rr, 3).setFormula('=Resultados!B' + pj);
    s.getRange(rr, 4).setFormula('=Resultados!D' + pj);
    s.getRange(rr, 5).setFormula('=Resultados!E' + pj);
    s.getRange(rr, 6).setFormula(
      '=IF(ISNUMBER($E' +
        rr +
        ')' +
        S +
        'IF(ROUND(ABS($E' +
        rr +
        ')*4' +
        S +
        '0)=0' +
        S +
        '"·"' +
        S +
        'REPT("█"' +
        S +
        'MIN(30' +
        S +
        'ROUND(ABS($E' +
        rr +
        ')*4' +
        S +
        '0))))' +
        S +
        '"")',
    );
    s.getRange(rr, 2, 1, 5)
      .setBackground(j % 2 === 0 ? '#FFFFFF' : '#EAF0F9')
      .setVerticalAlignment('middle');
  }
  s.getRange(totR, 2).setValue('TOTAL').setFontWeight('bold');
  s.getRange(totR, 3)
    .setFormula('=Resultados!B' + t)
    .setFontWeight('bold');
  s.getRange(totR, 4)
    .setFormula('=Resultados!D' + t)
    .setFontWeight('bold');
  s.getRange(totR, 5)
    .setFormula('=Resultados!E' + t)
    .setFontWeight('bold');
  s.getRange(totR, 2, 1, 5).setBackground('#DCE6F5');
  s.getRange(firstR, 3, n + 1, 3).setNumberFormat('"US$ "#,##0.00');
  s.getRange(firstR, 6, n, 1).setFontSize(9);
  s.getRange(headR, 2, n + 2, 5).setBorder(
    true,
    true,
    true,
    true,
    true,
    true,
    '#D5DCE8',
    SpreadsheetApp.BorderStyle.SOLID,
  );

  // ---- formato condicional (verde/rojo) — se exporta bien a Excel ----
  var rules = [];
  function verdeRojo(range) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0)
        .setFontColor('#1E7E34')
        .setRanges([range])
        .build(),
    );
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(0)
        .setFontColor('#C00000')
        .setRanges([range])
        .build(),
    );
  }
  verdeRojo(s.getRange(12, 2, 1, 8)); // tarjetas KPI fila 2 (G/P y resultados)
  verdeRojo(s.getRange(firstC, 9, n, 1)); // G/P no realizada en composición
  verdeRojo(s.getRange(firstR, 3, n + 1, 3)); // resultados por activo + total
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$E' + firstR + '>0')
      .setFontColor('#1E7E34')
      .setRanges([s.getRange(firstR, 6, n, 1)])
      .build(),
  );
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$E' + firstR + '<0')
      .setFontColor('#C00000')
      .setRanges([s.getRange(firstR, 6, n, 1)])
      .build(),
  );
  s.setConditionalFormatRules(rules);

  // ---- anchos de columna ----
  s.setColumnWidth(1, 18);
  s.setColumnWidth(2, 100);
  s.setColumnWidth(3, 130);
  for (var c = 4; c <= 9; c++) s.setColumnWidth(c, 110);
  s.setColumnWidth(10, 200);
  s.setColumnWidth(11, 90);
  s.setColumnWidth(12, 24);
}

function buildConfig(ss) {
  var s = sheet_(ss, 'Configuración', 6);
  var email = Session.getActiveUser().getEmail();
  s.getRange(1, 1, 10, 2).setValues([
    ['CONFIGURACIÓN', ''],
    ['', ''],
    ['Parámetro', 'Valor'],
    ['Email para alertas', email],
    ['VENDER si la ganancia supera (%) — solo activos que tienes', 5],
    ['COMPRAR si cae hoy más de (%) — caída brusca del día', 3],
    ['Trigger cada (horas)', 8],
    ['Importar correos desde (dd/mm/aaaa)', '04/06/2026'],
    ['Última ejecución', ''],
    ['Correos leídos (total)', 0],
  ]);
  s.getRange(3, 1, 1, 2).setFontWeight('bold').setBackground('#2E5496').setFontColor('white');
  s.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  s.getRange(5, 2, 2, 1).setBackground('#FFF2CC');
  s.getRange(8, 2).setBackground('#FFF2CC');
  s.setColumnWidth(1, 520);
  s.setColumnWidth(2, 170);
}

function buildAlertas(ss) {
  var s = sheet_(ss, 'Alertas', 8);
  s.appendRow(['Fecha/Hora', '# Señales / evento', 'Detalle']);
  s.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#2E5496').setFontColor('white');
  s.setColumnWidth(3, 620);
  s.setFrozenRows(1);
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'checkAlerts' || h === 'tareaProgramada') ScriptApp.deleteTrigger(t);
  });
  var cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuración');
  var horas = 8;
  if (cfg) {
    var v = cfg.getRange(7, 2).getValue();
    if (v) horas = v;
  }
  ScriptApp.newTrigger('tareaProgramada').timeBased().everyHours(horas).create();
}

/* ===== LECTOR DE CORREOS FINTUAL ===== */
function leerCorreosFintual(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var mv = ss.getSheetByName('Movimientos');
  var cfg = ss.getSheetByName('Configuración');
  var ale = ss.getSheetByName('Alertas');
  if (!mv || !cfg) return 0;

  // fecha de corte
  var desde = cfg.getRange(8, 2).getValue();
  var corte;
  if (desde instanceof Date) corte = desde;
  else {
    var p = String(desde).split('/');
    corte = p.length === 3 ? new Date(p[2], p[1] - 1, p[0]) : new Date(2026, 5, 4);
  }
  var q = 'from:hola@fintual.com after:' + Utilities.formatDate(corte, ss.getSpreadsheetTimeZone(), 'yyyy/MM/dd');

  // IDs ya importados
  var yaIds = {};
  if (mv.getLastRow() > 1) {
    mv.getRange(2, 11, mv.getLastRow() - 1, 1)
      .getValues()
      .forEach(function (r) {
        if (r[0]) yaIds[r[0]] = true;
      });
  }

  var tz = ss.getSpreadsheetTimeZone();
  var threads = GmailApp.search(q, 0, 100);
  var nuevos = [],
    avisos = [],
    leidos = 0;

  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j];
      if (m.getFrom().indexOf('hola@fintual.com') < 0) continue;
      var id = m.getId();
      if (yaIds[id]) continue;
      leidos++;
      var fila = parsearCorreo_(ss, m, tz);
      if (fila === null) continue; // no es un correo de operación
      if (fila.error) {
        avisos.push(fila.error);
        continue;
      }
      fila.row[10] = id; // ID Correo en col 11
      nuevos.push(fila.row);
      yaIds[id] = true;
    }
  }

  if (nuevos.length) {
    var start = mv.getLastRow() + 1;
    mv.getRange(start, 1, nuevos.length, 11).setValues(nuevos);
    ale.appendRow([new Date(), 'IMPORTACIÓN', nuevos.length + ' movimiento(s) nuevo(s) leído(s) de Gmail.']);
  }
  if (avisos.length) {
    ale.appendRow([new Date(), 'REVISAR', avisos.join(' | ')]);
    var em = cfg.getRange(4, 2).getValue();
    if (em) MailApp.sendEmail(em, 'Fintual: revisar correos no clasificados', avisos.join('\n'));
  }
  cfg.getRange(9, 2).setValue(new Date());
  var prev = Number(cfg.getRange(10, 2).getValue()) || 0;
  cfg.getRange(10, 2).setValue(prev + nuevos.length);
  return nuevos.length;
}

function parsearCorreo_(ss, m, tz) {
  var subj = (m.getSubject() || '').replace(/&amp;/g, '&');
  var body = (m.getPlainBody() || '').replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ');
  var all = subj + '\n' + body;
  var fecha = Utilities.formatDate(m.getDate(), tz, 'dd/MM/yyyy');
  var row = [fecha, '', '', '', '', '', '', '', '', 'Correo Gmail', ''];

  // COMPRA USD
  if (/Compraste/i.test(subj) && /d[oó]lares/i.test(subj)) {
    var usd = grab_(body, /compraste US\s*\$?\s*([\d.,]+)/i) || grab_(subj, /US\s*\$?\s*([\d.,]+)/i);
    var clp = grab_(body, /tus\s*\$\s*([\d.,]+)\s*pesos/i);
    var tc = grab_(body, /tipo de cambio de\s*\$\s*([\d.,]+)/i);
    if (usd == null) return { error: 'Compra USD sin monto: ' + subj };
    row[1] = 'Compra USD';
    row[2] = 'Dólares (USD)';
    row[3] = 'USD';
    row[4] = usd;
    row[5] = usd;
    row[6] = clp;
    row[7] = tc;
    row[8] = Math.round(usd * 4 * 100) / 100;
    return { row: row };
  }
  // VENTA USD
  if (/venta de tus.*d[oó]lares/i.test(subj) || /Convertimos los US/i.test(body)) {
    var usd2 =
      grab_(body, /Convertimos los US\s*\$?\s*([\d.,]+)/i) || grab_(subj, /venta de tus\s*([\d.,]+)\s*d[oó]lares/i);
    var clp2 = grab_(body, /vender a\s*\$\s*([\d.,]+)/i) || grab_(subj, /Recibir[aá]s\s*([\d.,]+)\s*pesos/i);
    var tc2 = grab_(body, /tasa de\s*\$\s*([\d.,]+)/i);
    if (usd2 == null) return { error: 'Venta USD sin monto: ' + subj };
    row[1] = 'Venta USD';
    row[2] = 'Dólares (USD)';
    row[3] = 'USD';
    row[4] = usd2;
    row[5] = usd2;
    row[6] = clp2;
    row[7] = tc2;
    row[8] = Math.round(usd2 * 4 * 100) / 100;
    return { row: row };
  }
  // DIVIDENDO
  if (/Recibiste un dividendo/i.test(subj)) {
    var monto = grab_(body, /por US\s*\$?\s*([\d.,]+)/i) || grab_(subj, /por\s*([\d.,]+)\s*d[oó]lares/i);
    var nomD = txt_(body, /dividendo de\s+(.+?)\s+por US/i);
    var tkSubj = (subj.match(/dividendo de\s+([A-Z0-9.]{1,6})\s+por/) || [])[1] || '';
    var tkD = resolverTicker_(ss, nomD) || tkSubj;
    if (monto == null) return { error: 'Dividendo sin monto: ' + subj };
    if (!tkD && nomD) tkD = autoMapa_(ss, nomD); // AUTO-MAPA
    row[1] = 'Dividendo';
    row[2] = nomD || tkD;
    row[3] = tkD;
    row[5] = monto;
    return { row: row };
  }
  // COMPRA ACCION
  if (/Invertiste/i.test(subj)) {
    var inv = grab_(body, /Monto invertido US\s*\$?\s*([\d.,]+)/i) || grab_(subj, /US\s*\$?\s*([\d.,]+)\s*d[oó]lares/i);
    var sh = grab_(body, /Acciones compradas\s*([\d.,]+)/i) || grab_(subj, /en\s*([\d.,]+)\s*acciones/i);
    var nomC = txt_(subj, /acciones de\s+(.+)$/i) || txt_(body, /d[oó]lares en\s+(.+?)\s*\n/i);
    if (inv == null || sh == null) return { error: 'Compra acción incompleta: ' + subj };
    var tkC = resolverTicker_(ss, nomC);
    if (!tkC) tkC = autoMapa_(ss, nomC); // AUTO-MAPA: agrega el activo nuevo solo
    row[1] = 'Compra acción';
    row[2] = nomC;
    row[3] = tkC;
    row[4] = sh;
    row[5] = inv;
    return { row: row };
  }
  // VENTA ACCION (total o parcial)
  if (/Vendiste/i.test(subj)) {
    var qty =
      grab_(body, /Cantidad de acciones\s*([\d.,]+)/i) ||
      grab_(body, /Vendiste\s*([\d.,]+)\s*acciones/i) ||
      grab_(subj, /Vendiste\s*([\d.,]+)\s*acciones/i);
    var tot = grab_(body, /Recibiste US\s*\$?\s*([\d.,]+)/i) || grab_(body, /total de US\s*\$?\s*([\d.,]+)/i);
    var nomV = txt_(body, /acciones de\s+(.+?)(?:\s+por un total|\n)/i) || txt_(subj, /acciones de\s+(.+)$/i);
    if (qty == null || tot == null) return { error: 'Venta acción incompleta: ' + subj };
    var tkV = resolverTicker_(ss, nomV);
    if (!tkV) tkV = autoMapa_(ss, nomV); // AUTO-MAPA
    row[1] = 'Venta acción';
    row[2] = nomV;
    row[3] = tkV;
    row[4] = qty;
    row[5] = tot;
    return { row: row };
  }
  return null; // newsletter u otro: ignorar
}

function resolverTicker_(ss, name) {
  if (!name) return '';
  var s = ss.getSheetByName('Mapa');
  if (!s || s.getLastRow() < 2) return '';
  var v = s.getRange(2, 1, s.getLastRow() - 1, 2).getValues();
  var n = name.trim().toLowerCase();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === n) return v[i][1];
  }
  return '';
}

/* ===== AUTO-MAPA: registra activos nuevos automáticamente ===== */
function autoMapa_(ss, nombre) {
  nombre = (nombre || '').trim();
  if (!nombre) return '';
  var ya = resolverTicker_(ss, nombre);
  if (ya) return ya;
  var tk = buscarTickerYahoo_(nombre);
  var mapa = ss.getSheetByName('Mapa');
  if (mapa) mapa.appendRow([nombre, tk]);
  var msg = tk
    ? 'AUTO-MAPA: nuevo activo "' +
      nombre +
      '" agregado a Mapa con ticker ' +
      tk +
      '. Verifica en la hoja Mapa que el ticker sea el correcto.'
    : 'AUTO-MAPA: nuevo activo "' +
      nombre +
      '" agregado a Mapa SIN ticker (no se encontró coincidencia). Escribe el ticker en la hoja Mapa y en la columna D del movimiento.';
  var ale = ss.getSheetByName('Alertas');
  if (ale) ale.appendRow([new Date(), 'AUTO-MAPA', msg]);
  var cfg = ss.getSheetByName('Configuración');
  var em = cfg ? cfg.getRange(4, 2).getValue() : '';
  if (em) MailApp.sendEmail(em, 'Fintual: nuevo activo detectado — ' + (tk || nombre), msg);
  return tk;
}

function buscarTickerYahoo_(nombre) {
  try {
    var url =
      'https://query1.finance.yahoo.com/v1/finance/search?q=' +
      encodeURIComponent(nombre) +
      '&quotesCount=6&newsCount=0';
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.getResponseCode() !== 200) return '';
    var qs = (JSON.parse(r.getContentText()).quotes || []).filter(function (q) {
      return q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF');
    });
    qs.sort(function (a, b) {
      return scoreTicker_(b) - scoreTicker_(a);
    });
    return qs.length ? String(qs[0].symbol) : '';
  } catch (e) {
    return '';
  }
}
function scoreTicker_(q) {
  var s = 0;
  if (String(q.symbol).indexOf('.') < 0) s += 4; // preferir listado US (sin sufijo)
  var exUS = ['NMS', 'NYQ', 'PCX', 'NGM', 'BTS', 'ASE', 'NCM'];
  if (exUS.indexOf(q.exchange) >= 0) s += 2;
  if (q.quoteType === 'ETF') s += 1;
  return s;
}

/* ===== ALERTAS relevantes con anti-spam ===== */
function checkAlerts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss.getSheetByName('Configuración');
  var pos = ss.getSheetByName('Posiciones');
  var pre = ss.getSheetByName('Precios');
  var ale = ss.getSheetByName('Alertas');
  if (!cfg || !pos || !pre) return;
  SpreadsheetApp.flush();

  var email = cfg.getRange(4, 2).getValue();
  var sellPct = Number(cfg.getRange(5, 2).getValue()) || 5;
  var buyPct = Number(cfg.getRange(6, 2).getValue()) || 3;
  cfg.getRange(9, 2).setValue(new Date());

  var nP = pos.getLastRow() - 2;
  var nR = pre.getLastRow() - 1;
  if (nP < 1 || nR < 1) return;
  var P = pos.getRange(2, 1, nP, 9).getValues();
  var R = pre.getRange(2, 1, nR, 4).getValues();
  var chg = {};
  R.forEach(function (r) {
    chg[r[0]] = typeof r[3] === 'number' ? r[3] : null;
  });

  var tokens = [],
    lines = [];
  P.forEach(function (r) {
    var tk = r[0],
      ten = Number(r[6]) || 0,
      avg = Number(r[7]) || 0,
      px = r[8];
    if (typeof px === 'number' && px > 0 && ten > 0.0001 && avg > 0) {
      var g = ((px - avg) / avg) * 100;
      if (g >= sellPct) {
        tokens.push('SELL:' + tk);
        lines.push(
          '🟢 VENDER? ' +
            tk +
            ' va +' +
            g.toFixed(1) +
            '% sobre tu costo (actual US$' +
            px.toFixed(2) +
            ', costo US$' +
            avg.toFixed(2) +
            ').',
        );
      }
    }
    var c = chg[tk];
    if (c !== null && c !== undefined && c <= -(buyPct / 100)) {
      tokens.push('BUY:' + tk);
      lines.push(
        '🔻 COMPRAR? ' +
          tk +
          ' cae ' +
          (c * 100).toFixed(1) +
          '% hoy (actual US$' +
          (typeof px === 'number' ? px.toFixed(2) : '?') +
          ').',
      );
    }
  });

  if (lines.length === 0) return;
  tokens.sort();
  var sig = tokens.join('|');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('lastSig') === sig) return;
  props.setProperty('lastSig', sig);

  ale.appendRow([new Date(), lines.length + ' señal(es)', lines.join('\n')]);
  if (email) {
    MailApp.sendEmail(
      email,
      'Fintual: ' + lines.length + ' señal(es) relevante(s)',
      lines.join('\n\n') +
        '\n\nRevisado: ' +
        new Date().toLocaleString('es-CL') +
        '\n\n(No repetiré este aviso hasta que cambien las señales.)',
    );
  }
}
