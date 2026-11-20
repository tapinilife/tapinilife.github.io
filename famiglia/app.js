/*
 * Il nostro sito – pagina per parenti, amici e invitati.
 * Legge la pagina dal servizio Google Apps Script (window.TAPINI_API) con il codice dopo il "#".
 * Ogni visitatore ha una chiave casuale salvata in questo browser: con quella può cambiare solo le proprie scelte.
 * Scritto in JavaScript "semplice" (niente librerie) per funzionare anche sui browser dei televisori.
 */
(function () {
  'use strict';

  var API = window.TAPINI_API || '';
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var RE_CODICE = /^[a-z][a-z0-9-]{9,47}$/;
  var NOMI_SEZIONI = {
    annuncio: 'Annuncio', novita: 'Le novità', bacheca: 'Bacheca', totodata: 'Toto-data: chi indovinerà il giorno?',
    totosesso: 'Toto-sesso: sarà maschio o femmina?', nome: 'Indovina il nome!', lista: 'Lista nascita',
    cena: 'Chi ci porta la cena', auguri: 'Auguri', evento: "L'evento", testo: '', galleria: 'Foto', sondaggio: 'Sondaggio'
  };
  var NOMI_BREVI = {
    annuncio: 'Annuncio', novita: 'Novità', bacheca: 'Bacheca', totodata: 'Toto-data', totosesso: 'Toto-sesso',
    nome: 'Indovina il nome', lista: 'Lista', cena: 'Cena', auguri: 'Auguri', evento: "L'evento", testo: 'Info',
    galleria: 'Foto', sondaggio: 'Sondaggio'
  };

  var stato = {
    codice: '', pagina: null, tv: false, selezioni: {}, aperti: {}, filtri: {}, nodi: {}, rsvp: {}, vocale: null
  };
  var chiaveMemoria = '';

  // ---------------------------------------------------------------- utilità

  function leggi(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function casuale(n) {
    var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    var buf = new Uint8Array(n * 2);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < buf.length && out.length < n; i++) if (buf[i] < 248) out += a.charAt(buf[i] % 62);
    while (out.length < n) out += a.charAt(Math.floor(Math.random() * 62));
    return out;
  }

  /** Chiave di questo browser: permette di cambiare o annullare solo le proprie scelte. */
  function chiave() {
    var c = leggi('tapini_chiave');
    if (c && /^[A-Za-z0-9_-]{16,64}$/.test(c)) return c;
    if (chiaveMemoria) return chiaveMemoria;
    c = casuale(32);
    if (!scrivi('tapini_chiave', c)) chiaveMemoria = c;
    return c;
  }

  function nomeRicordato() { return leggi('tapini_nome') || ''; }
  function ricordaNome(n) { if (n) scrivi('tapini_nome', n); }

  function h(tag, attr) {
    var el = document.createElement(tag);
    var a = attr || {};
    for (var k in a) {
      if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
      var v = a[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.substring(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (var i = 2; i < arguments.length; i++) aggiungiFigli(el, arguments[i]);
    return el;
  }

  function aggiungiFigli(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Object.prototype.toString.call(c) === '[object Array]') { for (var i = 0; i < c.length; i++) aggiungiFigli(el, c[i]); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }

  function https(u) { return typeof u === 'string' && /^https:\/\/[^\s"'<>()\\]+$/.test(u) ? u : ''; }

  function img(src, cls, alt) {
    var u = https(src);
    if (!u) return null;
    return h('img', { src: u, 'class': cls || '', alt: alt || '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  }

  function dataDa(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
  }
  function iso(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function dataLunga(s) { var d = dataDa(s); return d ? d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear() : s || ''; }
  function dataBreve(s) { var d = dataDa(s); return d ? d.getDate() + ' ' + MESI_BREVI[d.getMonth()] : s || ''; }
  function quando(s) {
    var d = dataDa(s);
    if (!d) return '';
    var oggi = dataDa(iso(new Date()));
    var giorni = Math.round((oggi - d) / 86400000);
    if (giorni === 0) return 'oggi';
    if (giorni === 1) return 'ieri';
    if (giorni > 1 && giorni < 7) return giorni + ' giorni fa';
    return dataLunga(s);
  }
  function aggiungiGiorni(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); }

  function rgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [158, 47, 84];
  }
  function scurisci(hex, f) {
    var c = rgb(hex);
    return '#' + c.map(function (x) { return ('0' + Math.round(x * f).toString(16)).slice(-2); }).join('');
  }

  function prezzo(p) {
    var s = String(p || '').trim();
    if (!s) return '';
    return /^[\d.,]+$/.test(s) ? 'circa ' + s + ' €' : s;
  }

  // ---------------------------------------------------------------- servizio

  function api(azione, dati) {
    var corpo = { azione: azione, chiave: chiave() };
    for (var k in dati || {}) if (Object.prototype.hasOwnProperty.call(dati, k)) corpo[k] = dati[k];
    return fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo),
      redirect: 'follow', credentials: 'omit', cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) throw new Error('Il servizio non risponde (errore ' + r.status + '). Riprova tra poco.');
      return r.json();
    }, function () {
      throw new Error('Nessuna connessione. Controlla internet e riprova.');
    }).then(function (j) {
      if (!j || !j.ok) {
        var e = new Error((j && j.errore) || 'Qualcosa non ha funzionato.');
        e.codice = j && j.motivo;
        throw e;
      }
      return j;
    });
  }

  // ---------------------------------------------------------------- avvio e schermate semplici

  var radice = document.getElementById('app');

  function svuota(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function schermo(figli) {
    svuota(radice);
    radice.appendChild(h('div', { 'class': 'centro' }, figli));
  }

  function linkNonValido() { schermo(h('h1', { text: 'Link non valido' })); }

  function errorePagina(msg, riprova) {
    schermo([
      h('h1', { text: msg }),
      riprova ? h('button', { 'class': 'btn', text: 'Riprova', onclick: function () { carica(false); } }) : null
    ]);
  }

  function avvia() {
    var hash = '';
    try { hash = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim(); } catch (e) { hash = ''; }
    if (!API || API.indexOf('INSERIRE') >= 0) { errorePagina('Pagina non ancora configurata.'); return; }
    if (/^tv/i.test(hash)) {
      attivaTv();
      var m = /^tv[-=:]?([A-Za-z0-9]{6})$/i.exec(hash);
      if (m) entraTv(m[1]); else schermoTv('');
      return;
    }
    var parti = hash.split('&');
    var codice = (parti[0] || '').toLowerCase();
    if (parti.indexOf('tv') > 0) attivaTv();
    if (!RE_CODICE.test(codice)) { linkNonValido(); return; }
    stato.codice = codice;
    carica(false);
  }

  function carica(mantieni) {
    var y = window.pageYOffset;
    var focus = document.activeElement && document.activeElement.getAttribute('data-sezione');
    return api('pagina', { codice: stato.codice }).then(function (j) {
      stato.pagina = j.pagina;
      disegna();
      if (mantieni) window.scrollTo(0, y);
      if (stato.tv) metti(focus);
    }, function (e) {
      if (e.codice === 'link') linkNonValido();
      else if (e.codice === 'sospesa') errorePagina(e.message);
      else if (!stato.pagina) errorePagina(e.message, true);
      else avviso(e.message);
    });
  }

  // ---------------------------------------------------------------- avvisi e finestre

  var timerAvviso = null;
  function avviso(testo, ok) {
    var vecchio = document.getElementById('avviso');
    if (vecchio) vecchio.parentNode.removeChild(vecchio);
    var el = h('div', {
      id: 'avviso', role: 'status',
      style: 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:70;max-width:90vw;padding:12px 16px;' +
        'border-radius:12px;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.18);background:' + (ok ? '#2E7D4F' : '#1F1A1C') + ';color:#fff'
    }, testo);
    document.body.appendChild(el);
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4500);
  }

  /** Finestra che chiede il nome (e, se serve, la quantità). Restituisce una Promise con {nome, quantita} o null. */
  function chiediNome(titolo, testo, maxQuantita) {
    return new Promise(function (fatto) {
      var campo = h('input', { 'class': 'campo', type: 'text', maxlength: '40', autocomplete: 'name', placeholder: 'Il tuo nome', value: nomeRicordato() });
      var quantita = maxQuantita > 1 ? h('input', { 'class': 'campo', type: 'number', min: '1', max: String(maxQuantita), value: '1' }) : null;
      var velo;
      function chiudi(v) { if (velo.parentNode) velo.parentNode.removeChild(velo); fatto(v); }
      function conferma() {
        var n = campo.value.trim();
        if (n.length < 2) { campo.focus(); return; }
        chiudi({ nome: n, quantita: quantita ? Math.max(1, Math.min(maxQuantita, Number(quantita.value) || 1)) : 1 });
      }
      campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') conferma(); });
      velo = h('div', { 'class': 'velo', onclick: function (e) { if (e.target === velo) chiudi(null); } },
        h('div', { 'class': 'finestra', role: 'dialog', 'aria-modal': 'true' },
          h('h3', { text: titolo }),
          testo ? h('p', { 'class': 'tenue piccolo', text: testo }) : null,
          campo,
          quantita ? h('label', { 'class': 'colonna piccolo' }, 'Quanti ne porti?', quantita) : null,
          h('div', { 'class': 'riga' },
            h('button', { 'class': 'btn', text: 'Conferma', onclick: conferma }),
            h('button', { 'class': 'btn chiaro', text: 'Annulla', onclick: function () { chiudi(null); } }))));
      document.body.appendChild(velo);
      campo.focus();
    });
  }

  function finestraTesto(titolo, figli) {
    var velo;
    function chiudi() { if (velo.parentNode) velo.parentNode.removeChild(velo); }
    velo = h('div', { 'class': 'velo', onclick: function (e) { if (e.target === velo) chiudi(); } },
      h('div', { 'class': 'finestra', role: 'dialog', 'aria-modal': 'true' },
        h('h3', { text: titolo }), figli, h('button', { 'class': 'btn chiaro', text: 'Chiudi', onclick: chiudi })));
    document.body.appendChild(velo);
  }

  function agisci(sezione, op, dati, okMsg) {
    var corpo = { codice: stato.codice, sezione: sezione, op: op };
    for (var k in dati || {}) if (Object.prototype.hasOwnProperty.call(dati, k)) corpo[k] = dati[k];
    return api('agisci', corpo).then(function (j) {
      if (dati && dati.nome) ricordaNome(dati.nome);
      avviso(j.messaggio || okMsg || 'Fatto!', true);
      return carica(true);
    }, function (e) {
      if (e.codice === 'link') { linkNonValido(); return; }
      avviso(e.message);
      throw e;
    });
  }

  function annulla(sezione, id, domanda) {
    if (domanda && !window.confirm(domanda)) return;
    agisci(sezione, 'annulla', { id: id }, 'Annullato.').catch(function () {});
  }

  // ---------------------------------------------------------------- pagina

  function disegna() {
    var p = stato.pagina;
    var accento = /^#[0-9a-fA-F]{6}$/.test(p.colore) ? p.colore : '#9E2F54';
    document.documentElement.style.setProperty('--accento', accento);
    document.documentElement.style.setProperty('--accento-scuro', scurisci(accento, 0.78));
    svuota(radice);
    stato.nodi = {};

    var copertina = h('div', { 'class': 'copertina' });
    if (https(p.copertina)) copertina.style.backgroundImage = 'url("' + https(p.copertina) + '")';
    radice.appendChild(h('header', { 'class': 'testata' },
      copertina,
      h('div', { 'class': 'dentro' },
        h('span', { 'class': 'riga-tapini' }, cuore(), h('span', { text: p.riga || 'La pagina dei Tapini' })),
        h('h1', { text: p.titolo }),
        p.sottotitolo ? h('p', { text: p.sottotitolo }) : null)));

    if (p.sezioni.length > 2) {
      radice.appendChild(h('nav', { 'class': 'schede', 'aria-label': 'Sezioni' }, p.sezioni.map(function (s) {
        return h('button', {
          'class': 'chip', type: 'button', text: s.titolo && s.titolo.length <= 22 ? s.titolo : (NOMI_BREVI[s.tipo] || s.titolo),
          onclick: function () { var n = stato.nodi[s.id]; if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'start' }); n.focus({ preventScroll: true }); } }
        });
      })));
    }

    var main = h('main');
    if (p.soloLettura) {
      main.appendChild(h('section', { 'class': 'scheda largo' }, h('p', { 'class': 'tenue', text: 'Questa pagina è archiviata: si può guardare ma non modificare.' })));
    }
    if (!p.sezioni.length) main.appendChild(h('section', { 'class': 'scheda largo' }, h('p', { 'class': 'tenue', text: 'La pagina è ancora vuota: torna a trovarci presto!' })));
    p.sezioni.forEach(function (s) {
      var n = sezione(s);
      stato.nodi[s.id] = n;
      main.appendChild(n);
    });
    radice.appendChild(main);
    radice.appendChild(piede());
    if (p.nascita && !sessionStorageLetto('nato:' + p.id)) radice.appendChild(copertinaNato(p.nascita));
  }

  function sessionStorageLetto(k) { try { return window.sessionStorage.getItem(k) === '1'; } catch (e) { return false; } }
  function sessionStorageSegna(k) { try { window.sessionStorage.setItem(k, '1'); } catch (e) { /* niente */ } }

  function cuore() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '20'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '2 5 20 17'); svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M12 21C12 21 3 15.2 3 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 9 2.6C21 15.2 12 21 12 21z');
    path.setAttribute('fill', '#F6E3E8');
    svg.appendChild(path);
    return svg;
  }

  function ridisegna(id) {
    var s = null;
    stato.pagina.sezioni.forEach(function (x) { if (x.id === id) s = x; });
    var vecchio = stato.nodi[id];
    if (!s || !vecchio) return;
    var nuovo = sezione(s);
    vecchio.parentNode.replaceChild(nuovo, vecchio);
    stato.nodi[id] = nuovo;
  }

  var LARGHE = { annuncio: 1, totodata: 1, lista: 1, cena: 1 };

  function sezione(s) {
    var cls = 'scheda' + (LARGHE[s.tipo] ? ' largo' : '') + (s.tipo === 'annuncio' ? ' evidenza' : '');
    var el = h('section', { 'class': cls, id: 's-' + s.id, tabindex: '0', 'data-sezione': s.id, 'aria-label': s.titolo || NOMI_SEZIONI[s.tipo] || '' });
    var titolo = s.titolo || (s.tipo === 'lista' && s.modo === 'porta' ? 'Cose da portare' : NOMI_SEZIONI[s.tipo]) || '';
    if (titolo) el.appendChild(h('p', { 'class': 'etichetta', text: titolo }));
    if (s.sottotitolo) el.appendChild(h('p', { 'class': 'sottotitolo', text: s.sottotitolo }));
    var f = DISEGNATORI[s.tipo];
    if (f) aggiungiFigli(el, f(s));
    return el;
  }

  function piede() {
    return h('footer', null,
      h('span', { text: 'Pagina privata: per favore non condividere il link.' }),
      h('span', { 'class': 'riga' },
        h('button', { type: 'button', text: 'Aggiorna', onclick: function () { carica(true); } }),
        h('button', { type: 'button', 'class': 'solo-telefono', text: 'Guarda sul TV', onclick: codicePerTv }),
        h('button', { type: 'button', text: stato.tv ? 'Esci dalla modalità TV' : 'Modalità TV', onclick: function () {
          if (stato.tv) { stato.tv = false; document.body.classList.remove('tv'); } else attivaTv();
          disegna();
          if (stato.tv) metti(null);
        } })));
  }

  // ---------------------------------------------------------------- È nato!

  function copertinaNato(n) {
    var velo = h('div', { 'class': 'nato', role: 'dialog', 'aria-label': 'È nato!' });
    var dati = [];
    if (n.data) dati.push(dataLunga(n.data));
    if (n.ora) dati.push('ore ' + n.ora);
    if (n.peso) dati.push(n.peso);
    aggiungiFigli(velo, [
      h('p', { 'class': 'etichetta', style: 'color:#F6E3E8', text: 'Benvenuto al mondo' }),
      img(n.foto, '', n.nome),
      h('h1', { text: n.nome ? n.nome + ' è qui!' : 'È nato!' }),
      dati.length ? h('p', { 'class': 'dati', text: dati.join(' · ') }) : null,
      n.testo ? h('p', { text: n.testo }) : null,
      h('button', { 'class': 'btn', text: 'Entra nella pagina', onclick: function () {
        sessionStorageSegna('nato:' + stato.pagina.id);
        if (velo.parentNode) velo.parentNode.removeChild(velo);
        if (stato.tv) metti(null);
      } })
    ]);
    setTimeout(function () { var b = velo.querySelector('button'); if (b) b.focus(); }, 50);
    return velo;
  }

  // ---------------------------------------------------------------- sezioni

  var DISEGNATORI = {
    annuncio: function (s) {
      var out = [];
      if (s.nascita) {
        var n = s.nascita;
        var dati = [n.data ? dataLunga(n.data) : '', n.ora ? 'ore ' + n.ora : '', n.peso || ''].filter(String);
        out.push(img(n.foto, 'foto-post', n.nome));
        out.push(h('h2', { 'class': 'grande', text: n.nome ? 'È nato ' + n.nome + '!' : 'È nato!' }));
        if (dati.length) out.push(h('p', { text: dati.join(' · ') }));
        if (n.testo) out.push(h('p', { 'class': 'testo-lungo', text: n.testo }));
      }
      if (s.nome && !s.nascita) out.push(h('h2', { 'class': 'grande', text: 'Si chiamerà ' + s.nome + '!' }));
      if (s.sesso && !s.nascita) {
        var t = /^m/i.test(s.sesso) ? 'È un maschio!' : /^f/i.test(s.sesso) ? 'È una femmina!' : s.sesso;
        out.push(h(s.nome ? 'p' : 'h2', { 'class': s.nome ? '' : 'grande', text: t }));
      }
      if (s.testo) out.push(h('p', { 'class': 'testo-lungo', text: s.testo }));
      if (!out.length) {
        out.push(h('h2', { 'class': 'grande', text: 'Qui compariranno le grandi notizie' }));
        out.push(h('p', { 'class': 'tenue piccolo', text: 'Il sesso, il nome e la nascita, quando saremo pronti a dirlo.' }));
      }
      return out;
    },

    novita: function (s) { return listaPost(s, true); },
    bacheca: function (s) { return listaPost(s, false); },

    totodata: function (s) {
      var out = [h('p', { 'class': 'tenue piccolo', text: 'Quando nascerà? Più il colore è intenso, più il giorno è probabile. I pallini sono le date già scelte.' })];
      var dal = dataDa(s.dal), al = dataDa(s.al);
      if (!dal || !al) return out;
      var conti = {};
      s.scelte.forEach(function (x) { conti[x.data] = (conti[x.data] || 0) + 1; });
      var scelta = stato.selezioni[s.id] || '';
      var mia = s.mia ? s.mia.data : '';
      var prob = probabilita(stato.pagina.dataPresunta);
      var acc = rgb(getComputedStyle(document.documentElement).getPropertyValue('--accento').trim());
      var cal = h('div', { 'class': 'calendario', role: 'grid', 'aria-label': 'Calendario del toto-data' });
      ['L', 'M', 'M', 'G', 'V', 'S', 'D'].forEach(function (g) { cal.appendChild(h('div', { 'class': 'intestazione', text: g })); });
      var vuoti = (dal.getDay() + 6) % 7;
      for (var i = 0; i < vuoti; i++) cal.appendChild(h('div', { 'class': 'giorno vuoto' }));
      for (var d = dal; d <= al; d = aggiungiGiorni(d, 1)) {
        (function (giorno) {
          var k = iso(giorno);
          var n = conti[k] || 0;
          var p = prob ? prob(giorno) : 0;
          var b = h('button', {
            type: 'button', 'class': 'giorno' + (k === scelta ? ' selezionato' : '') + (k === mia ? ' mio' : ''),
            disabled: s.chiuso || stato.tv ? true : null,
            'aria-label': dataLunga(k) + (n ? ', ' + n + (n === 1 ? ' persona' : ' persone') : ''),
            onclick: function () { stato.selezioni[s.id] = k; ridisegna(s.id); }
          },
            h('span', { 'class': 'piccolo', style: 'font-size:10px;color:var(--tenue);min-height:10px', text: giorno.getDate() === 1 || k === s.dal ? MESI_BREVI[giorno.getMonth()] : '' }),
            h('span', { text: String(giorno.getDate()) }),
            h('span', { 'class': 'punti', text: n ? (n > 4 ? '●●●●+' : new Array(n + 1).join('●')) : '' }));
          if (p > 0) b.style.background = 'rgba(' + acc[0] + ',' + acc[1] + ',' + acc[2] + ',' + (0.06 + 0.55 * p).toFixed(2) + ')';
          cal.appendChild(b);
        })(d);
      }
      out.push(cal);
      out.push(elencoNomi(s.id, s.scelte.map(function (x) { return x.nome + ' · ' + dataBreve(x.data); }), 8));
      if (s.chiuso) {
        out.push(h('p', { 'class': 'tenue piccolo', text: 'Il toto-data è chiuso.' + (mia ? ' La tua data: ' + dataLunga(mia) + '.' : '') }));
        return out;
      }
      var nome = h('input', { 'class': 'campo', type: 'text', maxlength: '40', placeholder: 'Il tuo nome', value: (s.mia && s.mia.nome) || nomeRicordato() });
      out.push(h('div', { 'class': 'colonna solo-telefono' },
        mia ? h('p', { 'class': 'piccolo', text: 'La tua data: ' + dataLunga(mia) + '. Tocca un altro giorno per cambiarla.' }) : null,
        h('div', { 'class': 'riga' }, nome,
          h('button', {
            'class': 'btn', type: 'button', disabled: !scelta || scelta === mia ? true : null,
            text: scelta && scelta !== mia ? 'Scelgo il ' + dataBreve(scelta) : 'Scegli la tua data sul calendario',
            onclick: function () {
              var n = nome.value.trim();
              if (n.length < 2) { avviso('Scrivi il tuo nome.'); nome.focus(); return; }
              delete stato.selezioni[s.id];
              agisci(s.id, 'data', { valore: scelta, nome: n }, 'Data salvata!').catch(function () { stato.selezioni[s.id] = scelta; });
            }
          })),
        h('p', { 'class': 'tenue piccolo', text: 'Potrai cambiarla da questo telefono' + (s.scadenza ? ' fino al ' + dataLunga(s.scadenza) : '') + '.' })));
      return out;
    },

    totosesso: function (s) { return sondaggio(s, true); },
    sondaggio: function (s) { return sondaggio(s, false); },

    nome: function (s) {
      var out = [];
      if (s.nomeAnnunciato) {
        out.push(h('h2', { 'class': 'grande', text: 'Si chiama ' + s.nomeAnnunciato + '!' }));
        out.push(h('p', { text: s.indovinato && s.indovinato.length ? "L'hanno indovinato: " + s.indovinato.join(', ') : "Nessuno l'aveva indovinato!" }));
        return out;
      }
      out.push(h('p', { 'class': 'tenue piccolo', text: 'Lo leggeremo solo noi, alla fine pubblicheremo il nome di chi ha indovinato!' }));
      if (s.miei && s.miei.length) out.push(h('p', { 'class': 'piccolo', text: 'I tuoi nomi: ' + s.miei.join(', ') }));
      if (s.chiuso) { out.push(h('p', { 'class': 'tenue piccolo', text: 'Le proposte sono chiuse.' })); return out; }
      var chi = h('input', { 'class': 'campo', type: 'text', maxlength: '40', placeholder: 'Il tuo nome', value: nomeRicordato() });
      var proposta = h('input', { 'class': 'campo', type: 'text', maxlength: '30', placeholder: 'Il nome che pensi' });
      out.push(h('div', { 'class': 'colonna solo-telefono' }, h('div', { 'class': 'riga' }, chi, proposta),
        h('button', {
          'class': 'btn', type: 'button', text: 'Indovina il nome :)', onclick: function () {
            if (chi.value.trim().length < 2) { avviso('Scrivi il tuo nome.'); chi.focus(); return; }
            if (proposta.value.trim().length < 2) { avviso('Scrivi il nome che pensi.'); proposta.focus(); return; }
            agisci(s.id, 'nome', { nome: chi.value.trim(), valore: proposta.value.trim() }, 'Ricevuto! Lo leggeremo solo noi.').catch(function () {});
          }
        })));
      return out;
    },

    lista: function (s) { return s.modo === 'porta' ? listaPorta(s) : listaRegali(s); },

    cena: function (s) {
      var out = [h('p', { 'class': 'tenue piccolo', text: s.nota || 'Nelle prime settimane un pasto pronto è il regalo più bello. Scegli un giorno libero: così nessuno si sovrappone.' })];
      if (!s.giorni.length) return out;
      var cal = h('div', { 'class': 'calendario' });
      ['L', 'M', 'M', 'G', 'V', 'S', 'D'].forEach(function (g) { cal.appendChild(h('div', { 'class': 'intestazione', text: g })); });
      var primo = dataDa(s.giorni[0].data);
      for (var i = 0; i < (primo.getDay() + 6) % 7; i++) cal.appendChild(h('div', { 'class': 'giorno vuoto' }));
      s.giorni.forEach(function (g) {
        var d = dataDa(g.data);
        cal.appendChild(h('button', {
          type: 'button', 'class': 'giorno' + (g.mia ? ' mio' : g.preso ? ' preso' : ''),
          disabled: s.chiuso || stato.tv || (g.preso && !g.mia) ? true : null,
          title: g.nome || '',
          'aria-label': dataLunga(g.data) + (g.mia ? ', prenotato da te' : g.preso ? ', già preso' : ', libero'),
          onclick: function () {
            if (g.mia) { annulla(s.id, g.mia, 'Vuoi annullare la cena del ' + dataLunga(g.data) + '?'); return; }
            chiediNome('Porti la cena il ' + dataLunga(g.data) + '?', 'Ti chiediamo solo il nome. Potrai annullare da questo telefono.').then(function (r) {
              if (r) agisci(s.id, 'cena', { valore: g.data, nome: r.nome }, 'Grazie! Ti aspettiamo.').catch(function () {});
            });
          }
        },
          h('span', { 'class': 'piccolo', style: 'font-size:10px;color:var(--tenue);min-height:10px', text: d.getDate() === 1 || g === s.giorni[0] ? MESI_BREVI[d.getMonth()] : '' }),
          h('span', { text: String(d.getDate()) }),
          h('span', { 'class': 'punti', text: g.mia ? 'tu' : g.preso ? (g.nome ? g.nome.split(' ')[0] : 'preso') : '' })));
      });
      out.push(cal);
      var mie = s.giorni.filter(function (g) { return g.mia; });
      out.push(h('p', { 'class': 'tenue piccolo', text: (mie.length ? 'I tuoi giorni: ' + mie.map(function (g) { return dataBreve(g.data); }).join(', ') + '. ' : '') +
        s.giorni.filter(function (g) { return !g.preso; }).length + ' giorni ancora liberi.' }));
      return out;
    },

    evento: function (s) { return evento(s); },

    auguri: function (s) { return auguri(s); },

    testo: function (s) {
      return [
        s.testo ? h('p', { 'class': 'testo-lungo', text: s.testo }) : null,
        foto(s.foto)
      ];
    },

    galleria: function (s) {
      return [
        s.testo ? h('p', { 'class': 'testo-lungo', text: s.testo }) : null,
        foto(s.foto),
        s.album ? h('div', { 'class': 'colonna solo-telefono' },
          h('a', { 'class': 'btn', href: s.album, target: '_blank', rel: 'noopener noreferrer', text: "Apri l'album condiviso" }),
          h('p', { 'class': 'tenue piccolo', text: 'Per aggiungere le tue foto all\'album serve un account Google.' })) : null,
        !s.album && !s.foto.length ? h('p', { 'class': 'tenue piccolo', text: 'Le foto arriveranno presto.' }) : null
      ];
    }
  };

  function elencoNomi(id, voci, quanti) {
    if (!voci.length) return h('p', { 'class': 'tenue piccolo', text: 'Ancora nessuno: sii il primo!' });
    var aperto = stato.aperti['n' + id] || stato.tv;
    var visibili = aperto ? voci : voci.slice(0, quanti);
    var resto = voci.length - visibili.length;
    return h('p', { 'class': 'piccolo' }, visibili.join(', '),
      resto > 0 ? [' ', h('button', {
        type: 'button', 'class': 'btn chiaro piccolo', text: '+ altri ' + resto,
        onclick: function () { stato.aperti['n' + id] = true; ridisegna(id); }
      })] : null);
  }

  /** Probabilità relativa (0..1) di nascita per giorno: normale centrata sulla data presunta + 1, deviazione 9 giorni. */
  function probabilita(presunta) {
    var p = dataDa(presunta);
    if (!p) return null;
    var centro = aggiungiGiorni(p, 1);
    return function (d) {
      var x = Math.round((d - centro) / 86400000);
      return Math.exp(-0.5 * (x / 9) * (x / 9));
    };
  }

  function foto(lista) {
    var l = (lista || []).map(https).filter(String);
    if (!l.length) return null;
    if (l.length === 1) return img(l[0], 'foto-post');
    if (stato.tv) return presentazione(l);
    return h('div', { 'class': 'griglia-foto' }, l.map(function (u) {
      return h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, img(u, ''));
    }));
  }

  /** In modalità TV le foto scorrono da sole. */
  function presentazione(l) {
    var i = 0;
    var el = img(l[0], 'foto-post');
    var t = setInterval(function () {
      if (!document.body.contains(el)) { clearInterval(t); return; }
      i = (i + 1) % l.length;
      el.src = l[i];
    }, 8000);
    return el;
  }

  function listaPost(s, novita) {
    var post = s.post || [];
    if (!post.length) return h('p', { 'class': 'tenue piccolo', text: novita ? 'Ancora nessuna novità.' : 'Ancora nessun post.' });
    var quanti = stato.tv ? 6 : (stato.aperti['p' + s.id] ? post.length : 4);
    var out = post.slice(0, quanti).map(function (p) {
      if (p.tipo === 'pancione') {
        var testo = [p.dimensione ? 'Grande come ' + p.dimensione.replace(/^grande come /i, '') : '', dataLunga(p.data)].filter(String).join(' · ');
        return h('article', { 'class': 'post' }, h('div', { 'class': 'pancione' },
          img(p.foto[0], '', 'Foto del pancione'),
          h('span', null,
            h('strong', { style: 'display:block', text: p.settimana ? 'Settimana ' + p.settimana : (p.titolo || 'Il pancione') }),
            h('span', { 'class': 'tenue piccolo', text: testo }),
            p.testo ? h('p', { 'class': 'testo-lungo piccolo', style: 'margin-top:6px', text: p.testo }) : null)));
      }
      if (p.tipo === 'diario') {
        var d = dataDa(p.data);
        return h('article', { 'class': 'post' },
          h('div', { 'class': 'diario' }, h('span', { 'class': 'pallino' }),
            h('span', null, h('strong', { text: d ? MESI[d.getMonth()].charAt(0).toUpperCase() + MESI[d.getMonth()].slice(1) : '' }), ' · ' + (p.titolo || ''))),
          p.testo ? h('p', { 'class': 'testo-lungo piccolo', text: p.testo }) : null,
          foto(p.foto));
      }
      return h('article', { 'class': 'post' },
        h('span', { 'class': 'autore' }, h('span', { 'class': 'avatar', text: (p.autore || '·').charAt(0).toUpperCase() }),
          (p.autore ? p.autore + ' · ' : '') + quando(p.data)),
        p.titolo ? h('strong', { text: p.titolo }) : null,
        p.testo ? h('p', { 'class': 'testo-lungo', text: p.testo }) : null,
        foto(p.foto));
    });
    if (post.length > quanti && !stato.tv) {
      out.push(h('button', { type: 'button', 'class': 'btn chiaro piccolo', text: 'Post precedenti ›', onclick: function () { stato.aperti['p' + s.id] = true; ridisegna(s.id); } }));
    }
    return out;
  }

  function sondaggio(s, sesso) {
    var out = [];
    if (s.domanda) out.push(h('h2', { 'class': 'grande', text: s.domanda }));
    if (s.esito) out.push(h('p', { style: 'font-weight:700', text: /^m/i.test(s.esito) ? 'È un maschio!' : /^f/i.test(s.esito) ? 'È una femmina!' : s.esito }));
    if (!s.chiuso && !s.mio) out.push(h('p', { 'class': 'tenue piccolo', text: sesso ? 'Indovina! Dopo il tuo voto vedi come hanno votato tutti gli altri.' : 'Dopo il tuo voto vedi i risultati.' }));
    if (!s.chiuso) {
      out.push(h('div', { 'class': 'riga solo-telefono' }, s.opzioni.map(function (o) {
        return h('button', {
          type: 'button', 'class': 'btn' + (s.mio === o ? ' scelto' : s.mio ? ' chiaro' : ''), text: o, style: 'flex:1 1 120px',
          onclick: function () { if (s.mio !== o) agisci(s.id, 'voto', { valore: o }, 'Voto salvato!').catch(function () {}); }
        });
      })));
    }
    if (s.risultati) {
      var tot = 0;
      for (var k in s.risultati) if (Object.prototype.hasOwnProperty.call(s.risultati, k)) tot += s.risultati[k];
      if (s.mio) out.push(h('p', { 'class': 'piccolo', text: 'Hai votato ' + s.mio + ' · ' + tot + (tot === 1 ? ' voto' : ' voti') + ' finora' }));
      else out.push(h('p', { 'class': 'piccolo', text: tot + (tot === 1 ? ' voto' : ' voti') }));
      s.opzioni.forEach(function (o) {
        var pct = tot ? Math.round(100 * s.risultati[o] / tot) : 0;
        out.push(h('div', { 'class': 'risultato' }, h('span', { text: o }),
          h('div', { 'class': 'barra' }, h('span', { style: 'width:' + pct + '%' })), h('strong', { text: pct + '%' })));
      });
      if (!s.chiuso && sesso) out.push(h('p', { 'class': 'tenue piccolo', text: "Puoi cambiare il voto fino all'annuncio. Quando sveleremo il sesso, il voto si chiude." }));
    } else if (s.chiuso) {
      out.push(h('p', { 'class': 'tenue piccolo', text: 'Il voto è chiuso.' }));
    } else if (stato.tv) {
      out.push(h('p', { 'class': 'tenue piccolo', text: s.totale + (s.totale === 1 ? ' voto' : ' voti') + ' finora: si vota dal telefono!' }));
    }
    return out;
  }

  function listaRegali(s) {
    var filtro = stato.filtri[s.id] || 'tutti';
    var out = [h('p', { 'class': 'tenue piccolo', text: s.testo || 'Se vuoi farci un regalo, scegli qualcosa da qui: così non arrivano doppioni. Nessuno vedrà chi ha scelto cosa, solo noi.' })];
    var liberi = s.voci.filter(function (v) { return !v.completo; }).length;
    out.push(h('p', { 'class': 'piccolo', style: 'font-weight:700', text: liberi + (liberi === 1 ? ' regalo ancora disponibile' : ' regali ancora disponibili') }));
    out.push(h('div', { 'class': 'filtri solo-telefono' }, [['tutti', 'Tutti'], ['liberi', 'Disponibili'], ['gruppo', 'Regali di gruppo']].map(function (f) {
      return h('button', { type: 'button', 'class': filtro === f[0] ? 'attivo' : '', text: f[1], onclick: function () { stato.filtri[s.id] = f[0]; ridisegna(s.id); } });
    })));
    var voci = s.voci.filter(function (v) {
      return filtro === 'liberi' ? !v.completo || v.mia : filtro === 'gruppo' ? v.gruppo : true;
    });
    out.push(h('div', { 'class': 'colonna' }, voci.map(function (v) {
      var dett = [prezzo(v.prezzo), v.gruppo ? 'regalo di gruppo' : ''].filter(String).join(' · ');
      var azione;
      if (v.mia) {
        azione = h('div', { 'class': 'colonna', style: 'align-items:flex-end' }, h('span', { 'class': 'stato-voce verde', text: v.gruppo ? 'Partecipi' : "L'hai scelto tu" }),
          s.chiuso ? null : h('button', { type: 'button', 'class': 'btn bordo piccolo solo-telefono', text: 'Annulla', onclick: function () { annulla(s.id, v.mia, 'Vuoi annullare la tua scelta per "' + v.titolo + '"?'); } }));
      } else if (v.completo) {
        azione = h('span', { 'class': 'stato-voce', text: 'Già preso' });
      } else if (s.chiuso) {
        azione = null;
      } else {
        azione = h('button', {
          type: 'button', 'class': 'btn piccolo solo-telefono', text: v.gruppo ? 'Partecipo' : 'Lo regalo io', onclick: function () {
            chiediNome(v.gruppo ? 'Partecipi a "' + v.titolo + '"?' : 'Regali "' + v.titolo + '"?',
              'Ti chiediamo solo il nome. Potrai annullare da questo telefono; se cambi telefono scrivici e lo sistemiamo noi.').then(function (r) {
              if (r) agisci(s.id, 'prenota', { valore: v.id, nome: r.nome }, 'Grazie! Lo segniamo come preso.').catch(function () {});
            });
          }
        });
      }
      return h('div', { 'class': 'voce' },
        img(v.foto, '', v.titolo) || h('div', { 'class': 'senza-foto' }),
        h('div', { 'class': 'info' },
          h('span', { 'class': 'titolo', text: v.titolo }),
          h('span', { 'class': 'tenue piccolo' }, dett, v.url ? [dett ? ' · ' : '', h('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer', text: 'vedi nel negozio' })] : null),
          v.nota ? h('span', { 'class': 'tenue piccolo', text: v.nota }) : null,
          v.gruppo ? h('div', { 'class': 'barra', title: v.presi + ' su ' + v.quote }, h('span', { style: 'width:' + Math.min(100, Math.round(100 * v.presi / v.quote)) + '%' })) : null,
          v.gruppo ? h('span', { 'class': 'tenue piccolo', text: v.presi + ' su ' + v.quote + ' partecipanti' }) : null),
        azione);
    })));
    if (!voci.length) out.push(h('p', { 'class': 'tenue piccolo', text: 'Nessun regalo in questo elenco.' }));
    out.push(h('p', { 'class': 'tenue piccolo', text: 'Prezzi indicativi, presi dai negozi al momento dell\'inserimento.' }));
    return out;
  }

  function listaPorta(s) {
    var complete = s.voci.filter(function (v) { return v.completo; }).length;
    var out = [];
    if (s.testo) out.push(h('p', { 'class': 'tenue piccolo', text: s.testo }));
    out.push(h('p', { 'class': 'piccolo', style: 'font-weight:700', text: complete + ' su ' + s.voci.length + ' completate' }));
    out.push(h('div', { 'class': 'colonna' }, s.voci.map(function (v) {
      var mancano = v.quote - v.presi;
      var chi = s.mostraNomi ? (v.nomi && v.nomi.length ? v.nomi.join(', ') : 'nessuno ancora') : '';
      var azione;
      if (v.mia) {
        azione = s.chiuso ? h('span', { 'class': 'stato-voce verde', text: 'Lo porti tu' }) :
          h('button', { type: 'button', 'class': 'btn bordo piccolo solo-telefono', text: 'Annulla', onclick: function () { annulla(s.id, v.mia, 'Non porti più "' + v.titolo + '"?'); } });
      } else if (v.completo) {
        azione = h('span', { 'class': 'stato-voce verde', text: 'Completo' });
      } else if (!s.chiuso) {
        azione = h('button', {
          type: 'button', 'class': 'btn piccolo solo-telefono', text: 'Lo porto io', onclick: function () {
            chiediNome('Porti "' + v.titolo + '"?', 'Potrai cancellare la tua scelta da questo telefono.', mancano).then(function (r) {
              if (r) agisci(s.id, 'prenota', { valore: v.id, nome: r.nome, quantita: r.quantita }, 'Grazie!').catch(function () {});
            });
          }
        });
      }
      return h('div', { 'class': 'voce' },
        h('div', { 'class': 'info' },
          h('span', { 'class': 'titolo', text: v.titolo + ' ' + v.presi + '/' + v.quote }),
          chi ? h('span', { 'class': 'tenue piccolo', text: chi }) : null,
          v.nota ? h('span', { 'class': 'tenue piccolo', text: v.nota }) : null),
        azione);
    })));
    if (s.altro && s.altro.length) {
      out.push(h('p', { 'class': 'piccolo', style: 'font-weight:700', text: 'Porteranno anche' }));
      out.push(h('div', { 'class': 'colonna' }, s.altro.map(function (a) {
        return h('div', { 'class': 'riga', style: 'justify-content:space-between' },
          h('span', { 'class': 'piccolo', text: a.testo + (a.nome ? ' · ' + a.nome : '') }),
          a.mia && !s.chiuso ? h('button', { type: 'button', 'class': 'btn bordo piccolo solo-telefono', text: 'Annulla', onclick: function () { annulla(s.id, a.mia, 'Togliere "' + a.testo + '"?'); } }) : null);
      })));
    }
    if (s.permettiAltro && !s.chiuso) {
      var campo = h('input', { 'class': 'campo', type: 'text', maxlength: '60', placeholder: 'Porto anche altro…' });
      out.push(h('div', { 'class': 'riga solo-telefono' }, campo, h('button', {
        type: 'button', 'class': 'btn chiaro', text: 'Aggiungi', onclick: function () {
          var t = campo.value.trim();
          if (t.length < 2) { campo.focus(); return; }
          chiediNome('Porti "' + t + '"?', 'Potrai cancellare la tua scelta da questo telefono.').then(function (r) {
            if (r) agisci(s.id, 'altro', { valore: t, nome: r.nome }, 'Grazie!').catch(function () {});
          });
        }
      })));
    }
    out.push(h('p', { 'class': 'tenue piccolo solo-telefono', text: 'Potrai cancellare la tua scelta da questo telefono.' }));
    return out;
  }

  // ---------------------------------------------------------------- evento

  function evento(s) {
    var out = [];
    var d = dataDa(s.data);
    if (d) {
      out.push(h('div', { 'class': 'data-evento' },
        h('div', { 'class': 'calendarietto', 'aria-hidden': 'true' },
          h('div', { 'class': 'm', text: MESI_BREVI[d.getMonth()] }), h('div', { 'class': 'g', text: String(d.getDate()) }), h('div', { 'class': 's', text: GIORNI[d.getDay()] })),
        h('div', { 'class': 'colonna', style: 'gap:2px' },
          h('strong', { text: GIORNI[d.getDay()] + ' ' + dataLunga(s.data) }),
          s.ora ? h('span', { text: (s.oraFine ? 'Dalle ' + s.ora + ' alle ' + s.oraFine : 'Dalle ' + s.ora) }) : null,
          s.luogo ? h('span', { text: s.luogo }) : null,
          (s.indirizzo || s.luogo) ? h('a', {
            'class': 'solo-telefono', target: '_blank', rel: 'noopener noreferrer',
            href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.indirizzo || s.luogo), text: 'Apri in Maps ›'
          }) : null)));
    }
    if (s.note) out.push(h('p', { 'class': 'testo-lungo', text: s.note }));
    var c = s.conteggi || { si: 0, forse: 0, adulti: 0, bambini: 0 };
    var persone = c.adulti + c.bambini;
    out.push(h('p', { 'class': 'piccolo', text: persone + (persone === 1 ? ' ci sarà' : ' ci saranno') + (c.forse ? ' · ' + c.forse + ' forse' : '') +
      (s.scadenza ? ' · rispondete entro il ' + dataLunga(s.scadenza) : '') }));
    var mia = s.mia;
    if (mia && !stato.rsvp[s.id]) {
      var parole = { si: 'Ci sarò', forse: 'Forse', no: 'Non ci sarò' }[mia.risposta];
      var dett = mia.risposta === 'no' ? '' : ' (' + mia.adulti + (mia.adulti === 1 ? ' adulto' : ' adulti') +
        (mia.bambini ? ', ' + mia.bambini + (mia.bambini === 1 ? ' bambino' : ' bambini') : '') + ')';
      out.push(h('div', { 'class': 'colonna solo-telefono' },
        h('p', { text: 'La tua risposta: ' + parole + dett }),
        mia.allergie ? h('p', { 'class': 'tenue piccolo', text: 'Allergie e intolleranze: ' + mia.allergie }) : null,
        h('div', { 'class': 'riga' },
          mia.risposta === 'si' && d ? h('button', { type: 'button', 'class': 'btn', text: 'Aggiungi al calendario', onclick: function () { scaricaIcs(s); } }) : null,
          s.chiuso ? null : h('button', { type: 'button', 'class': 'btn chiaro', text: 'Modifica la risposta', onclick: function () { stato.rsvp[s.id] = { risposta: mia.risposta, adulti: mia.adulti, bambini: mia.bambini }; ridisegna(s.id); } }))));
      return out;
    }
    if (s.chiuso) { out.push(h('p', { 'class': 'tenue piccolo', text: 'Le risposte sono chiuse.' })); return out; }
    var bozza = stato.rsvp[s.id] || (stato.rsvp[s.id] = { risposta: '', adulti: 1, bambini: 0 });
    var nome = h('input', { 'class': 'campo', type: 'text', maxlength: '40', placeholder: 'Il tuo nome', value: (mia && mia.nome) || nomeRicordato() });
    var allergie = s.chiediAllergie ? h('textarea', { 'class': 'campo', maxlength: '300', placeholder: 'Allergie o intolleranze (facoltativo)', value: (mia && mia.allergie) || '' }) : null;
    function contatore(etichetta, k, min) {
      var out_ = h('output', { text: String(bozza[k]) });
      return h('div', { 'class': 'riga', style: 'justify-content:space-between' }, h('span', { text: etichetta }),
        h('span', { 'class': 'contatore' },
          h('button', { type: 'button', 'aria-label': 'Meno', text: '−', onclick: function () { bozza[k] = Math.max(min, bozza[k] - 1); out_.textContent = bozza[k]; } }),
          out_,
          h('button', { type: 'button', 'aria-label': 'Più', text: '+', onclick: function () { bozza[k] = Math.min(20, bozza[k] + 1); out_.textContent = bozza[k]; } })));
    }
    var scelte = h('div', { 'class': 'riga' }, [['si', 'Ci sarò'], ['forse', 'Forse'], ['no', 'Non ci sarò']].map(function (r) {
      return h('button', {
        type: 'button', 'class': 'btn' + (bozza.risposta === r[0] ? ' scelto' : ' chiaro'), text: r[1], style: 'flex:1 1 90px',
        onclick: function () { bozza.risposta = r[0]; ridisegna(s.id); }
      });
    }));
    out.push(h('div', { 'class': 'colonna solo-telefono' },
      nome, scelte,
      bozza.risposta && bozza.risposta !== 'no' ? [contatore('Adulti', 'adulti', 0), s.chiediBambini ? contatore('Bambini', 'bambini', 0) : null, allergie] : null,
      h('button', {
        type: 'button', 'class': 'btn', text: 'Invia la risposta', disabled: bozza.risposta ? null : true, onclick: function () {
          var n = nome.value.trim();
          if (n.length < 2) { avviso('Scrivi il tuo nome.'); nome.focus(); return; }
          delete stato.rsvp[s.id];
          agisci(s.id, 'rsvp', {
            nome: n, valore: bozza.risposta, adulti: bozza.adulti, bambini: bozza.bambini, allergie: allergie ? allergie.value.trim() : ''
          }, bozza.risposta === 'no' ? 'Grazie per averci avvisato.' : 'Grazie! Ti aspettiamo.').catch(function () { stato.rsvp[s.id] = bozza; });
        }
      })));
    return out;
  }

  function scaricaIcs(s) {
    var d = dataDa(s.data);
    if (!d) return;
    function f(x) { return ('0' + x).slice(-2); }
    function giorno(dd) { return dd.getFullYear() + f(dd.getMonth() + 1) + f(dd.getDate()); }
    function ora(o) { var m = /^(\d{1,2})[:.](\d{2})/.exec(o || ''); return m ? f(Number(m[1])) + m[2] + '00' : ''; }
    function esc(t) { return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    var inizio, fine;
    if (ora(s.ora)) {
      inizio = 'DTSTART:' + giorno(d) + 'T' + ora(s.ora);
      if (ora(s.oraFine)) fine = 'DTEND:' + giorno(d) + 'T' + ora(s.oraFine);
      else { var h3 = (Number(ora(s.ora).substring(0, 2)) + 3); fine = h3 < 24 ? 'DTEND:' + giorno(d) + 'T' + f(h3) + ora(s.ora).substring(2) : 'DTEND:' + giorno(d) + 'T235900'; }
    } else {
      inizio = 'DTSTART;VALUE=DATE:' + giorno(d);
      fine = 'DTEND;VALUE=DATE:' + giorno(aggiungiGiorni(d, 1));
    }
    var adesso = new Date();
    var stamp = adesso.getUTCFullYear() + f(adesso.getUTCMonth() + 1) + f(adesso.getUTCDate()) + 'T' + f(adesso.getUTCHours()) + f(adesso.getUTCMinutes()) + '00Z';
    var righe = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tapini//Il nostro sito//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', 'UID:' + stato.pagina.id + '-' + s.id + '@pagina-di-famiglia', 'DTSTAMP:' + stamp, inizio, fine,
      'SUMMARY:' + esc(stato.pagina.titolo),
      s.indirizzo || s.luogo ? 'LOCATION:' + esc([s.luogo, s.indirizzo].filter(String).join(', ')) : '',
      s.note ? 'DESCRIPTION:' + esc(s.note) : '',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(stato.pagina.titolo), 'TRIGGER:-P1D', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].filter(String);
    var blob = new Blob([righe.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: 'evento.ics' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
  }

  // ---------------------------------------------------------------- auguri e vocali

  function auguri(s) {
    var out = [];
    var lista = s.approvati || [];
    var quanti = stato.tv ? 8 : (stato.aperti['a' + s.id] ? lista.length : 6);
    lista.slice(0, quanti).forEach(function (a) {
      out.push(h('blockquote', { 'class': 'augurio' },
        a.testo ? h('span', { 'class': 'testo-lungo', text: '"' + a.testo + '"' }) : null,
        a.voce ? h('button', { type: 'button', 'class': 'btn chiaro piccolo', style: 'align-self:flex-start', text: 'Ascolta il vocale' + (a.durata ? ' (' + durata(a.durata) + ')' : ''), onclick: function (e) { ascolta(a.id, e.currentTarget); } }) : null,
        h('span', { 'class': 'firma', text: '— ' + a.nome })));
    });
    if (lista.length > quanti && !stato.tv) out.push(h('button', { type: 'button', 'class': 'btn chiaro piccolo', text: 'Altri auguri ›', onclick: function () { stato.aperti['a' + s.id] = true; ridisegna(s.id); } }));
    if (!lista.length) out.push(h('p', { 'class': 'tenue piccolo', text: 'Ancora nessun augurio: lascia il primo!' }));
    if (s.inAttesa) out.push(h('p', { 'class': 'messaggio ok', text: s.inAttesa === 1 ? 'Il tuo augurio è in attesa di approvazione.' : 'Hai ' + s.inAttesa + ' auguri in attesa di approvazione.' }));
    if (s.chiuso) return out;

    var nome = h('input', { 'class': 'campo', type: 'text', maxlength: '40', placeholder: 'Il tuo nome', value: nomeRicordato() });
    var testo = h('textarea', { 'class': 'campo', maxlength: '600', placeholder: 'Scrivi un augurio…' });
    var zonaVoce = h('div', { 'class': 'registra' });
    var puoRegistrare = s.voce && window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (puoRegistrare) disegnaRegistratore(zonaVoce);
    out.push(h('div', { 'class': 'colonna solo-telefono' }, nome, testo, puoRegistrare ? zonaVoce : null,
      h('button', {
        type: 'button', 'class': 'btn', text: 'Invia', onclick: function (e) {
          var n = nome.value.trim();
          var t = testo.value.trim();
          if (n.length < 2) { avviso('Scrivi il tuo nome.'); nome.focus(); return; }
          if (t.length < 2 && !stato.vocale) { avviso('Scrivi un messaggio o registra un vocale.'); testo.focus(); return; }
          var bottone = e.currentTarget;
          bottone.disabled = true;
          bottone.textContent = 'Invio…';
          var v = stato.vocale;
          var prima = v ? base64(v.blob) : Promise.resolve('');
          prima.then(function (b64) {
            return agisci(s.id, 'augurio', { nome: n, valore: t, audio: b64, mime: v ? v.mime : '', durata: v ? v.secondi : 0 });
          }).then(function () { stato.vocale = null; }, function () { bottone.disabled = false; bottone.textContent = 'Invia'; });
        }
      }),
      h('p', { 'class': 'tenue piccolo', text: 'Gli auguri compaiono sulla pagina dopo che li avremo letti.' })));
    return out;
  }

  function durata(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }

  function base64(blob) {
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).replace(/^data:[^,]*,/, '')); };
      r.onerror = function () { ko(new Error('Non riesco a leggere il vocale.')); };
      r.readAsDataURL(blob);
    });
  }

  function ascolta(id, bottone) {
    bottone.disabled = true;
    var testo = bottone.textContent;
    bottone.textContent = 'Carico…';
    api('audio', { codice: stato.codice, id: id }).then(function (j) {
      var a = new Audio('data:' + j.mime + ';base64,' + j.dati);
      bottone.textContent = 'In riproduzione…';
      a.onended = function () { bottone.disabled = false; bottone.textContent = testo; };
      return a.play();
    }).catch(function (e) {
      bottone.disabled = false; bottone.textContent = testo;
      avviso(e && e.message ? e.message : 'Non riesco a riprodurre il vocale.');
    });
  }

  var MAX_SECONDI = 60;
  var registratore = null;

  function scegliMime() {
    var prove = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
    for (var i = 0; i < prove.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(prove[i])) return prove[i];
    return '';
  }

  function disegnaRegistratore(zona) {
    svuota(zona);
    if (stato.vocale) {
      var url = URL.createObjectURL(stato.vocale.blob);
      aggiungiFigli(zona, [
        h('audio', { controls: true, src: url, style: 'max-width:100%' }),
        h('span', { 'class': 'tenue piccolo', text: durata(stato.vocale.secondi) }),
        h('button', { type: 'button', 'class': 'btn chiaro piccolo', text: 'Elimina il vocale', onclick: function () { stato.vocale = null; URL.revokeObjectURL(url); disegnaRegistratore(zona); } })
      ]);
      return;
    }
    if (registratore) {
      var tempo = h('span', { 'class': 'piccolo', text: '0:00 / 1:00' });
      registratore.etichetta = tempo;
      aggiungiFigli(zona, [h('span', { 'class': 'rec' }), tempo,
        h('button', { type: 'button', 'class': 'btn piccolo', text: 'Ferma', onclick: function () { fermaRegistrazione(); } })]);
      return;
    }
    aggiungiFigli(zona, [
      h('button', { type: 'button', 'class': 'btn bordo piccolo', text: 'Registra un vocale', onclick: function () { iniziaRegistrazione(zona); } }),
      h('span', { 'class': 'tenue piccolo', text: 'massimo un minuto' })
    ]);
  }

  function iniziaRegistrazione(zona) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (flusso) {
      var mime = scegliMime();
      var opzioni = { audioBitsPerSecond: 32000 };
      if (mime) opzioni.mimeType = mime;
      var rec;
      try { rec = new MediaRecorder(flusso, opzioni); } catch (e) { rec = new MediaRecorder(flusso); }
      var pezzi = [];
      var inizio = Date.now();
      registratore = { rec: rec, flusso: flusso, etichetta: null, timer: null };
      rec.ondataavailable = function (e) { if (e.data && e.data.size) pezzi.push(e.data); };
      rec.onstop = function () {
        flusso.getTracks().forEach(function (t) { t.stop(); });
        clearInterval(registratore && registratore.timer);
        registratore = null;
        var tipo = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        var blob = new Blob(pezzi, { type: tipo });
        var secondi = Math.min(MAX_SECONDI, (Date.now() - inizio) / 1000);
        stato.vocale = blob.size ? { blob: blob, mime: tipo, secondi: Math.round(secondi) } : null;
        disegnaRegistratore(zona);
      };
      rec.start(1000);
      registratore.timer = setInterval(function () {
        var sec = (Date.now() - inizio) / 1000;
        if (registratore && registratore.etichetta) registratore.etichetta.textContent = durata(sec) + ' / 1:00';
        if (sec >= MAX_SECONDI) fermaRegistrazione();
      }, 250);
      disegnaRegistratore(zona);
    }, function () {
      avviso('Per registrare serve il permesso del microfono.');
    });
  }

  function fermaRegistrazione() {
    if (registratore && registratore.rec.state !== 'inactive') registratore.rec.stop();
  }

  // ---------------------------------------------------------------- modalità TV

  function attivaTv() {
    stato.tv = true;
    document.body.classList.add('tv');
  }

  function schermoTv(errore) {
    var campo = h('input', { 'class': 'campo tv-codice', type: 'text', maxlength: '6', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'Codice per il TV' });
    function vai() { if (campo.value.trim().length === 6) entraTv(campo.value.trim()); }
    campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') vai(); });
    schermo([
      h('h1', { style: 'color:#fff;font-size:44px', text: 'Pagina di famiglia sul TV' }),
      h('p', { style: 'color:#F6E3E8;font-size:24px', text: 'Inserisci il codice di 6 caratteri che vedi sul telefono.' }),
      campo,
      h('button', { 'class': 'btn', style: 'font-size:24px;padding:14px 28px', text: 'Apri', onclick: vai }),
      errore ? h('p', { style: 'color:#FFD8D8;font-size:22px', text: errore }) : null
    ]);
    campo.focus();
  }

  function entraTv(breve) {
    api('tv', { breve: breve }).then(function (j) {
      stato.codice = j.codice; // resta solo in memoria: sul TV non compare il link completo
      try { history.replaceState(null, '', location.pathname + '#tv'); } catch (e) { /* niente */ }
      carica(false);
      setInterval(function () { carica(true); }, 120000);
    }, function (e) {
      schermoTv(e.message);
    });
  }

  function codicePerTv() {
    api('tvCodice', { codice: stato.codice }).then(function (j) {
      var indirizzo = location.origin + location.pathname + '#tv';
      finestraTesto('Guarda sul TV', [
        h('p', { 'class': 'piccolo', text: 'Sul browser del TV apri questo indirizzo:' }),
        h('p', { style: 'font-weight:700;word-break:break-all', text: indirizzo }),
        h('p', { 'class': 'piccolo', text: 'e inserisci il codice:' }),
        h('p', { 'class': 'tv-breve', text: j.breve }),
        h('p', { 'class': 'tenue piccolo', text: 'Il codice vale ' + j.minuti + ' minuti. In alternativa puoi trasmettere lo schermo del telefono.' })
      ]);
    }, function (e) { avviso(e.message); });
  }

  /** Mette il focus su una sezione (frecce del telecomando). */
  function metti(id) {
    var lista = document.querySelectorAll('section.scheda');
    if (!lista.length) return;
    var el = null;
    for (var i = 0; i < lista.length; i++) if (id && lista[i].getAttribute('data-sezione') === id) el = lista[i];
    el = el || lista[0];
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center' });
  }

  document.addEventListener('keydown', function (e) {
    if (!stato.tv || !stato.pagina) return;
    if (document.querySelector('.velo') || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
    var tasti = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 1, PageUp: -1 };
    var passo = tasti[e.key];
    if (!passo) return;
    var lista = Array.prototype.slice.call(document.querySelectorAll('section.scheda'));
    if (!lista.length) return;
    var attuale = lista.indexOf(document.activeElement && document.activeElement.closest ? document.activeElement.closest('section.scheda') : null);
    var prossimo = lista[Math.max(0, Math.min(lista.length - 1, attuale + passo))];
    if (attuale < 0) prossimo = lista[0];
    e.preventDefault();
    prossimo.focus({ preventScroll: true });
    prossimo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  window.addEventListener('hashchange', function () { location.reload(); });

  avvia();
})();
