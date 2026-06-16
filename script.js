(function () {
  'use strict';

  /* ===================== Constants ===================== */

  var STORAGE_KEY = 'guessWhoCardMaker_v1';

  var PAGE_SIZES = {
    A4: { w: 210, h: 297 },
    Letter: { w: 215.9, h: 279.4 }
  };

  var PRESETS = {
    '4x4': { cols: 4, rows: 4 },
    '4x6': { cols: 4, rows: 6 },
    '3x4': { cols: 3, rows: 4 },
    '3x3': { cols: 3, rows: 3 }
  };

  var FONT_MAP = {
    inter: "'Inter', sans-serif",
    playfair: "'Playfair Display', serif",
    patrick: "'Patrick Hand', cursive",
    typewriter: "'Special Elite', monospace"
  };

  var SAMPLE_NAMES = [
    'Ava', 'Theo', 'Priya', 'Mateo', 'Yuki', 'Soren', 'Imani', 'Diego',
    'Freya', 'Kwame', 'Lucia', 'Hassan', 'Nadia', 'Oliver', 'Maya', 'Ezra',
    'Chiara', 'Andre', 'Sana', 'Felix', 'Zoe', 'Leo', 'Amara', 'Tobias'
  ];

  var PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.4c-3.6 0-9 1.8-9 5.4v1.8h18v-1.8c0-3.6-5.4-5.4-9-5.4z"/></svg>';

  var DEFAULT_SETTINGS = {
    pageSize: 'A4',
    customPageW: 210,
    customPageH: 297,
    orientation: 'portrait',
    sizeMode: 'fit',
    gridPreset: '4x4',
    rows: 4,
    cols: 4,
    cardW: 63,
    cardH: 88,
    margin: 10,
    gutter: 4,
    showCutLines: true,
    bgColor: '#fbf7ee',
    textColor: '#232838',
    font: 'inter',
    borderWidth: 2,
    borderColor: '#232838',
    radius: 10,
    showSubtitle: false
  };

  /* ===================== State ===================== */

  var cards = [];
  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var currentEditingId = null;

  /* ===================== DOM refs ===================== */

  var $ = function (id) { return document.getElementById(id); };

  var bulkNamesEl = $('bulkNames');
  var bulkAddBtn = $('bulkAddBtn');
  var sampleBtn = $('sampleBtn');
  var cardListEl = $('cardList');
  var addCardBtn = $('addCardBtn');
  var clearAllBtn = $('clearAllBtn');

  var pageSizeEl = $('pageSize');
  var orientationEl = $('orientation');
  var customPageRowEl = $('customPageRow');
  var customPageWEl = $('customPageW');
  var customPageHEl = $('customPageH');
  var modeFitEl = $('modeFit');
  var modeCustomEl = $('modeCustom');
  var fitControlsEl = $('fitControls');
  var gridPresetEl = $('gridPreset');
  var customGridRowEl = $('customGridRow');
  var rowsInputEl = $('rowsInput');
  var colsInputEl = $('colsInput');
  var customSizeControlsEl = $('customSizeControls');
  var cardWInputEl = $('cardWInput');
  var cardHInputEl = $('cardHInput');
  var marginInputEl = $('marginInput');
  var gutterInputEl = $('gutterInput');
  var showCutLinesEl = $('showCutLines');
  var layoutSummaryEl = $('layoutSummary');

  var bgColorEl = $('bgColor');
  var textColorEl = $('textColor');
  var fontSelectEl = $('fontSelect');
  var borderWidthEl = $('borderWidth');
  var radiusInputEl = $('radiusInput');
  var borderColorEl = $('borderColor');
  var showSubtitleEl = $('showSubtitle');

  var canvasEl = $('canvas');
  var canvasStatusEl = $('canvasStatus');
  var imageInputEl = $('imageInput');
  var printBtn = $('printBtn');
  var pdfBtn = $('pdfBtn');
  var dynamicPageSizeEl = $('dynamicPageSize');

  /* ===================== Utilities ===================== */

  function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return escapeHTML(str).replace(/"/g, '&quot;');
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /* ===================== Persistence ===================== */

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: cards, settings: settings }));
    } catch (e) {
      console.warn('Could not save card data to this browser.', e);
    }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (Array.isArray(data.cards)) cards = data.cards;
      if (data.settings) settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
      return true;
    } catch (e) {
      console.warn('Could not load saved card data.', e);
      return false;
    }
  }

  /* ===================== Layout math ===================== */

  function getPageDimensions(s) {
    var base;
    if (s.pageSize === 'Custom') {
      base = { w: s.customPageW || 210, h: s.customPageH || 297 };
    } else {
      base = PAGE_SIZES[s.pageSize] || PAGE_SIZES.A4;
    }
    var long = Math.max(base.w, base.h);
    var short = Math.min(base.w, base.h);
    return s.orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
  }

  function computeLayout(s, cardCount) {
    var page = getPageDimensions(s);
    var cols, rows, cardW, cardH;

    if (s.sizeMode === 'fit') {
      if (s.gridPreset === 'custom') {
        rows = clamp(parseInt(s.rows, 10) || 1, 1, 20);
        cols = clamp(parseInt(s.cols, 10) || 1, 1, 20);
      } else {
        var preset = PRESETS[s.gridPreset] || PRESETS['4x4'];
        rows = preset.rows;
        cols = preset.cols;
      }
      cardW = (page.w - 2 * s.margin - (cols - 1) * s.gutter) / cols;
      cardH = (page.h - 2 * s.margin - (rows - 1) * s.gutter) / rows;
      cardW = Math.max(10, cardW);
      cardH = Math.max(10, cardH);
    } else {
      cardW = Math.max(10, parseFloat(s.cardW) || 63);
      cardH = Math.max(10, parseFloat(s.cardH) || 88);
      cols = Math.max(1, Math.floor((page.w - 2 * s.margin + s.gutter) / (cardW + s.gutter)));
      rows = Math.max(1, Math.floor((page.h - 2 * s.margin + s.gutter) / (cardH + s.gutter)));
    }

    var cardsPerPage = cols * rows;
    var totalPages = cardCount > 0 ? Math.ceil(cardCount / cardsPerPage) : 0;

    return {
      pageW: page.w,
      pageH: page.h,
      cols: cols,
      rows: rows,
      cardW: cardW,
      cardH: cardH,
      margin: s.margin,
      gutter: s.gutter,
      cardsPerPage: cardsPerPage,
      totalPages: totalPages
    };
  }

  function applyRootVars(layout, s) {
    var root = document.documentElement.style;
    root.setProperty('--page-w', layout.pageW + 'mm');
    root.setProperty('--page-h', layout.pageH + 'mm');
    root.setProperty('--cols', layout.cols);
    root.setProperty('--rows', layout.rows);
    root.setProperty('--card-w', layout.cardW + 'mm');
    root.setProperty('--card-h', layout.cardH + 'mm');
    root.setProperty('--gutter', layout.gutter + 'mm');
    root.setProperty('--margin', layout.margin + 'mm');
    root.setProperty('--card-bg', s.bgColor);
    root.setProperty('--card-text', s.textColor);
    root.setProperty('--card-font', FONT_MAP[s.font] || FONT_MAP.inter);
    root.setProperty('--card-border-w', s.borderWidth + 'px');
    root.setProperty('--card-border-color', s.borderColor);
    root.setProperty('--card-radius', s.radius + 'px');
  }

  /* ===================== Rendering: canvas ===================== */

  function cardMarkup(card) {
    var photoStyle = card.image ? ' style="background-image:url(\'' + card.image + '\')"' : '';
    var photoInner = card.image ? '' : PLACEHOLDER_SVG;
    var subtitle = settings.showSubtitle
      ? '<div class="card-subtitle" contenteditable="true" data-id="' + card.id + '" data-field="subtitle">' +
        escapeHTML(card.subtitle || '') + '</div>'
      : '';
    return (
      '<div class="card" data-id="' + card.id + '">' +
        '<div class="card-photo" data-id="' + card.id + '"' + photoStyle + '>' + photoInner + '</div>' +
        '<div class="card-name" contenteditable="true" data-id="' + card.id + '" data-field="name">' +
          escapeHTML(card.name || '') +
        '</div>' +
        subtitle +
      '</div>'
    );
  }

  function updateStatusText(layout) {
    var text;
    if (cards.length === 0) {
      text = 'No characters yet.';
    } else {
      text = cards.length + (cards.length === 1 ? ' card' : ' cards') +
        ' · ' + layout.totalPages + (layout.totalPages === 1 ? ' page' : ' pages') +
        ' · ' + layout.cardsPerPage + ' per sheet (' + layout.cols + ' × ' + layout.rows + ')' +
        ' · card ' + layout.cardW.toFixed(0) + ' × ' + layout.cardH.toFixed(0) + 'mm';
    }
    canvasStatusEl.textContent = text;
    layoutSummaryEl.textContent = text;
  }

  function renderCanvas() {
    canvasEl.classList.toggle('show-cut-lines', !!settings.showCutLines);

    var layout = computeLayout(settings, cards.length);
    applyRootVars(layout, settings);
    updateStatusText(layout);

    if (cards.length === 0) {
      canvasEl.innerHTML =
        '<div class="empty-canvas">' +
          '<h2>No characters yet</h2>' +
          '<p>Paste a list of names, fill in some samples, or add a blank card to start your sheet.</p>' +
          '<button type="button" class="btn btn-small btn-primary" id="emptyFillBtn">Fill sample names</button>' +
        '</div>';
      var emptyBtn = $('emptyFillBtn');
      if (emptyBtn) emptyBtn.addEventListener('click', fillSample);
      return;
    }

    var html = '';
    for (var p = 0; p < layout.totalPages; p++) {
      var slice = cards.slice(p * layout.cardsPerPage, (p + 1) * layout.cardsPerPage);
      html += '<div class="page">' + slice.map(cardMarkup).join('') + '</div>';
    }
    canvasEl.innerHTML = html;
  }

  /* ===================== Rendering: sidebar roster ===================== */

  function rosterRowMarkup(card, index) {
    var thumbStyle = card.image ? ' style="background-image:url(\'' + card.image + '\')"' : '';
    var thumbInner = card.image ? '' : PLACEHOLDER_SVG;
    return (
      '<li class="card-row" data-id="' + card.id + '">' +
        '<div class="card-row-thumb" data-id="' + card.id + '"' + thumbStyle + ' title="Click to set a photo">' + thumbInner + '</div>' +
        '<input type="text" value="' + escapeAttr(card.name || '') + '" data-id="' + card.id + '" aria-label="Character name">' +
        '<div class="card-row-actions">' +
          '<button type="button" class="icon-btn move-up" data-id="' + card.id + '" title="Move up"' + (index === 0 ? ' disabled' : '') + '>&uarr;</button>' +
          '<button type="button" class="icon-btn move-down" data-id="' + card.id + '" title="Move down"' + (index === cards.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
          '<button type="button" class="icon-btn remove-card" data-id="' + card.id + '" title="Remove">&#10005;</button>' +
        '</div>' +
      '</li>'
    );
  }

  function renderRoster() {
    if (cards.length === 0) {
      cardListEl.innerHTML = '<li class="empty-roster">No characters yet — paste some names above or add a blank card.</li>';
      return;
    }
    cardListEl.innerHTML = cards.map(rosterRowMarkup).join('');
  }

  function renderAll() {
    renderRoster();
    renderCanvas();
    saveState();
  }

  /* ===================== Card data operations ===================== */

  function addCard(initial) {
    initial = initial || {};
    cards.push({
      id: uid(),
      name: initial.name || 'New Character',
      subtitle: initial.subtitle || '',
      image: initial.image || null
    });
    renderAll();
  }

  function removeCard(id) {
    cards = cards.filter(function (c) { return c.id !== id; });
    renderAll();
  }

  function moveCard(id, dir) {
    var idx = cards.findIndex(function (c) { return c.id === id; });
    if (idx < 0) return;
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= cards.length) return;
    var tmp = cards[idx];
    cards[idx] = cards[newIdx];
    cards[newIdx] = tmp;
    renderAll();
  }

  function bulkAddNames() {
    var names = bulkNamesEl.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (names.length === 0) return;
    names.forEach(function (n) { cards.push({ id: uid(), name: n, subtitle: '', image: null }); });
    bulkNamesEl.value = '';
    renderAll();
  }

  function fillSample() {
    var pool = SAMPLE_NAMES.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 8);
    pool.forEach(function (n) { cards.push({ id: uid(), name: n, subtitle: '', image: null }); });
    renderAll();
  }

  function clearAllCards() {
    if (cards.length === 0) return;
    if (!window.confirm('Remove all characters from your roster? This cannot be undone.')) return;
    cards = [];
    renderAll();
  }

  function updateCardField(id, field, value, source) {
    var card = cards.filter(function (c) { return c.id === id; })[0];
    if (!card) return;
    card[field] = value;
    saveState();
    if (field === 'name') {
      if (source === 'canvas') {
        var sideInput = cardListEl.querySelector('input[data-id="' + id + '"]');
        if (sideInput && sideInput.value !== value) sideInput.value = value;
      } else {
        var canvasNameEl = canvasEl.querySelector('.card-name[data-id="' + id + '"]');
        if (canvasNameEl && canvasNameEl.textContent !== value) canvasNameEl.textContent = value;
      }
    }
  }

  function setCardImage(id, dataURL) {
    var card = cards.filter(function (c) { return c.id === id; })[0];
    if (!card) return;
    card.image = dataURL;
    saveState();
    var photoEl = canvasEl.querySelector('.card-photo[data-id="' + id + '"]');
    if (photoEl) { photoEl.style.backgroundImage = "url('" + dataURL + "')"; photoEl.innerHTML = ''; }
    var thumbEl = cardListEl.querySelector('.card-row-thumb[data-id="' + id + '"]');
    if (thumbEl) { thumbEl.style.backgroundImage = "url('" + dataURL + "')"; thumbEl.innerHTML = ''; }
  }

  /* ===================== Settings <-> form ===================== */

  function readSettingsFromForm() {
    settings.pageSize = pageSizeEl.value;
    settings.customPageW = parseFloat(customPageWEl.value) || 210;
    settings.customPageH = parseFloat(customPageHEl.value) || 297;
    settings.orientation = orientationEl.value;
    settings.sizeMode = modeCustomEl.checked ? 'custom' : 'fit';
    settings.gridPreset = gridPresetEl.value;
    settings.rows = parseInt(rowsInputEl.value, 10) || 4;
    settings.cols = parseInt(colsInputEl.value, 10) || 4;
    settings.cardW = parseFloat(cardWInputEl.value) || 63;
    settings.cardH = parseFloat(cardHInputEl.value) || 88;
    settings.margin = parseFloat(marginInputEl.value) || 0;
    settings.gutter = parseFloat(gutterInputEl.value) || 0;
    settings.showCutLines = showCutLinesEl.checked;
    settings.bgColor = bgColorEl.value;
    settings.textColor = textColorEl.value;
    settings.font = fontSelectEl.value;
    settings.borderWidth = parseFloat(borderWidthEl.value) || 0;
    settings.borderColor = borderColorEl.value;
    settings.radius = parseFloat(radiusInputEl.value) || 0;
    settings.showSubtitle = showSubtitleEl.checked;
  }

  function applySettingsToForm() {
    pageSizeEl.value = settings.pageSize;
    customPageWEl.value = settings.customPageW;
    customPageHEl.value = settings.customPageH;
    orientationEl.value = settings.orientation;
    if (settings.sizeMode === 'custom') { modeCustomEl.checked = true; } else { modeFitEl.checked = true; }
    gridPresetEl.value = settings.gridPreset;
    rowsInputEl.value = settings.rows;
    colsInputEl.value = settings.cols;
    cardWInputEl.value = settings.cardW;
    cardHInputEl.value = settings.cardH;
    marginInputEl.value = settings.margin;
    gutterInputEl.value = settings.gutter;
    showCutLinesEl.checked = settings.showCutLines;
    bgColorEl.value = settings.bgColor;
    textColorEl.value = settings.textColor;
    fontSelectEl.value = settings.font;
    borderWidthEl.value = settings.borderWidth;
    radiusInputEl.value = settings.radius;
    borderColorEl.value = settings.borderColor;
    showSubtitleEl.checked = settings.showSubtitle;
  }

  function updateConditionalVisibility() {
    customPageRowEl.hidden = settings.pageSize !== 'Custom';
    fitControlsEl.hidden = settings.sizeMode !== 'fit';
    customSizeControlsEl.hidden = settings.sizeMode !== 'custom';
    customGridRowEl.hidden = !(settings.sizeMode === 'fit' && settings.gridPreset === 'custom');
  }

  function onSettingsChanged() {
    readSettingsFromForm();
    updateConditionalVisibility();
    renderCanvas();
    saveState();
  }

  /* ===================== Print & PDF export ===================== */

  function handlePrint() {
    var layout = computeLayout(settings, cards.length);
    dynamicPageSizeEl.textContent = '@page { size: ' + layout.pageW + 'mm ' + layout.pageH + 'mm; margin: 0; }';
    window.print();
  }

  function handleExportPDF() {
    if (cards.length === 0) {
      window.alert('Add at least one character before exporting a PDF.');
      return;
    }
    if (!window.jspdf || !window.html2canvas) {
      window.alert('The PDF library has not loaded. Check your internet connection and try again.');
      return;
    }

    var originalLabel = pdfBtn.textContent;
    pdfBtn.disabled = true;

    var layout = computeLayout(settings, cards.length);
    var orientation = layout.pageW > layout.pageH ? 'landscape' : 'portrait';
    var jsPDFCtor = window.jspdf.jsPDF;
    var pdf = new jsPDFCtor({ orientation: orientation, unit: 'mm', format: [layout.pageW, layout.pageH] });
    var pages = Array.prototype.slice.call(canvasEl.querySelectorAll('.page'));

    var renderNext = function (i) {
      if (i >= pages.length) {
        pdf.save('guess-who-cards.pdf');
        pdfBtn.disabled = false;
        pdfBtn.textContent = originalLabel;
        return;
      }
      pdfBtn.textContent = 'Rendering page ' + (i + 1) + ' of ' + pages.length + '…';
      window.html2canvas(pages[i], { scale: 3, useCORS: true, backgroundColor: '#ffffff' }).then(function (renderedCanvas) {
        var imgData = renderedCanvas.toDataURL('image/jpeg', 0.92);
        if (i > 0) pdf.addPage([layout.pageW, layout.pageH], orientation);
        pdf.addImage(imgData, 'JPEG', 0, 0, layout.pageW, layout.pageH);
        renderNext(i + 1);
      }).catch(function (err) {
        console.error(err);
        window.alert('Something went wrong generating the PDF. See the browser console for details.');
        pdfBtn.disabled = false;
        pdfBtn.textContent = originalLabel;
      });
    };

    renderNext(0);
  }

  /* ===================== Event wiring ===================== */

  function wireEvents() {
    bulkAddBtn.addEventListener('click', bulkAddNames);
    sampleBtn.addEventListener('click', fillSample);
    addCardBtn.addEventListener('click', function () { addCard(); });
    clearAllBtn.addEventListener('click', clearAllCards);

    cardListEl.addEventListener('click', function (e) {
      var thumb = e.target.closest('.card-row-thumb');
      if (thumb) { currentEditingId = thumb.getAttribute('data-id'); imageInputEl.click(); return; }
      var up = e.target.closest('.move-up');
      if (up) { moveCard(up.getAttribute('data-id'), -1); return; }
      var down = e.target.closest('.move-down');
      if (down) { moveCard(down.getAttribute('data-id'), 1); return; }
      var rm = e.target.closest('.remove-card');
      if (rm) { removeCard(rm.getAttribute('data-id')); return; }
    });

    cardListEl.addEventListener('input', function (e) {
      if (e.target.matches('input[type="text"]')) {
        updateCardField(e.target.getAttribute('data-id'), 'name', e.target.value, 'sidebar');
      }
    });

    canvasEl.addEventListener('click', function (e) {
      var photo = e.target.closest('.card-photo');
      if (photo) { currentEditingId = photo.getAttribute('data-id'); imageInputEl.click(); }
    });

    canvasEl.addEventListener('input', function (e) {
      var t = e.target;
      if (t.classList.contains('card-name')) {
        updateCardField(t.getAttribute('data-id'), 'name', t.textContent, 'canvas');
      } else if (t.classList.contains('card-subtitle')) {
        updateCardField(t.getAttribute('data-id'), 'subtitle', t.textContent, 'canvas');
      }
    });

    imageInputEl.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file || !currentEditingId) return;
      var reader = new FileReader();
      reader.onload = function () {
        setCardImage(currentEditingId, reader.result);
        imageInputEl.value = '';
        currentEditingId = null;
      };
      reader.readAsDataURL(file);
    });

    var settingsInputs = [
      pageSizeEl, customPageWEl, customPageHEl, orientationEl, modeFitEl, modeCustomEl,
      gridPresetEl, rowsInputEl, colsInputEl, cardWInputEl, cardHInputEl,
      marginInputEl, gutterInputEl, showCutLinesEl, bgColorEl, textColorEl,
      fontSelectEl, borderWidthEl, radiusInputEl, borderColorEl, showSubtitleEl
    ];
    settingsInputs.forEach(function (el) {
      el.addEventListener('input', onSettingsChanged);
      el.addEventListener('change', onSettingsChanged);
    });

    printBtn.addEventListener('click', handlePrint);
    pdfBtn.addEventListener('click', handleExportPDF);
  }

  /* ===================== Init ===================== */

  function init() {
    var loaded = loadState();
    if (!loaded) {
      settings = Object.assign({}, DEFAULT_SETTINGS);
      cards = SAMPLE_NAMES.slice(0, 8).map(function (n) {
        return { id: uid(), name: n, subtitle: '', image: null };
      });
    }
    applySettingsToForm();
    updateConditionalVisibility();
    wireEvents();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
