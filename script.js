// ----------------- Referencias -----------------
const synth = window.speechSynthesis;
const $select = document.getElementById('voz');
const $texto  = document.getElementById('texto');

const $btnHablar  = document.getElementById('btnHablar');
const $btnPausa   = document.getElementById('btnPausa');
const $btnDetener = document.getElementById('btnDetener');
const $iconPausa  = document.getElementById('iconPausa');

const $rate = document.getElementById('rate');
const $pitch = document.getElementById('pitch');
const $vol = document.getElementById('vol');
const $rateVal = document.getElementById('rateVal');
const $pitchVal = document.getElementById('pitchVal');
const $volVal = document.getElementById('volVal');

// Picker de voces (modal)
const $openPicker = document.getElementById('openVoicePicker');
const $voiceModal = document.getElementById('voiceModal');
const $voiceSearch = document.getElementById('voiceSearch');
const $voiceList = document.getElementById('voiceList');
const $confirmVoice = document.getElementById('confirmVoice');

// ===== Estado de reproducción =====
let currentUtter = null;
let currentText  = "";
let lastBoundary = 0;
let isPaused = false;
let isProcessing = false;

// ===== Persistencia voz seleccionada =====
const VOICE_KEY = 'tts-voice-selected';

// ---------- Helpers UI ----------
function clearBtn(btn){
  btn.classList.remove('btn-primary','btn-warning','btn-danger','btn-outline-secondary','active');
  btn.setAttribute('aria-pressed','false');
}
function setBtn(btn, classes, pressed=true){
  btn.classList.add(...classes.split(' '));
  if(pressed){ btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
}
function setUIState(state){
  [$btnHablar,$btnPausa,$btnDetener].forEach(b=>{
    clearBtn(b);
    b.classList.add('btn','flex-fill','btn-outline-secondary');
  });
  if(state==='speaking'){ setBtn($btnHablar,'btn-primary'); setPauseIcon(false); }
  else if(state==='paused'){ setBtn($btnPausa,'btn-warning'); setPauseIcon(true); }
  else if(state==='stopped'){ setBtn($btnDetener,'btn-danger'); }
  else { setBtn($btnHablar,'btn-primary'); setPauseIcon(false); }
}
function setPauseIcon(paused){
  $iconPausa.classList.toggle('bi-pause-fill', !paused);
  $iconPausa.classList.toggle('bi-play-fill', paused);
}

// ---------- Sliders ----------
function syncLabels(){ $rateVal.textContent=$rate.value; $pitchVal.textContent=$pitch.value; $volVal.textContent=$vol.value; }
function setFill(el){ const min=+el.min,max=+el.max,val=+el.value; el.style.setProperty('--_fill', `${((val-min)/(max-min))*100}%`); }
function hookSlider(el){ setFill(el); el.addEventListener('input',()=>{ setFill(el); syncLabels(); }); }
[$rate,$pitch,$vol].forEach(hookSlider); syncLabels();

// ---------- Detección móvil y voces ----------
let orderedVoices=[], tempSelectedName="";

// Detectar móvil y mostrar advertencia
function detectMobile() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    document.getElementById('mobileWarning')?.classList.remove('d-none');
    console.log('Dispositivo móvil detectado - las voces pueden estar limitadas');
  }
  return isMobile;
}

function orderVoices(all){
  const isEsES = v => /^es([-_]?ES)?$/i.test(v.lang) || /Spanish\s*\(Spain\)/i.test(`${v.lang} ${v.name}`);
  const isEsMX = v => /^es([-_]?MX)?$/i.test(v.lang) || /Spanish\s*\(Mexico\)/i.test(`${v.lang} ${v.name}`);

  const esES = all.filter(isEsES);
  const esMX = all.filter(isEsMX);
  const others = all.filter(v => !esES.includes(v) && !esMX.includes(v));

  const esES_google = esES.filter(v => /google/i.test(v.name));
  const esES_sabina = esES.filter(v => /sabina/i.test(v.name) && !esES_google.includes(v));
  const esES_rest   = esES.filter(v => !esES_google.includes(v) && !esES_sabina.includes(v))
                          .sort((a,b)=>a.name.localeCompare(b.name));
  const esES_sorted = [...esES_google, ...esES_sabina, ...esES_rest];

  const esMX_raul   = esMX.filter(v => /ra[uú]l/i.test(v.name));
  const esMX_google = esMX.filter(v => /google/i.test(v.name) && !esMX_raul.includes(v));
  const esMX_rest   = esMX.filter(v => !esMX_raul.includes(v) && !esMX_google.includes(v))
                          .sort((a,b)=>a.name.localeCompare(b.name));
  const esMX_sorted = [...esMX_raul, ...esMX_google, ...esMX_rest];

  const others_sorted = others.sort(
    (a,b)=>(a.lang||'').localeCompare(b.lang||'') || a.name.localeCompare(b.name)
  );

  return { preferred:[...esES_sorted, ...esMX_sorted], rest: others_sorted };
}

function cargarVoces(){
  const all = synth.getVoices(); 
  if(!all || !all.length) {
    console.warn('No se encontraron voces disponibles');
    return;
  }
  
  console.log('Voces disponibles:', all.map(v => `${v.name} (${v.lang}) ${v.default ? ' [DEFAULT]' : ''}`));
  
  const prev = localStorage.getItem(VOICE_KEY) || $select.value || '';
  const { preferred, rest } = orderVoices(all);
  orderedVoices = [...preferred, ...rest];

  $select.innerHTML = '';
  
  // Agregar opción por defecto para móviles
  const defaultOption = document.createElement('option');
  defaultOption.value = 'default';
  defaultOption.textContent = 'Voz por defecto del sistema';
  $select.appendChild(defaultOption);
  
  orderedVoices.forEach(v => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang}) ${v.default ? ' [DEFAULT]' : ''}`;
    $select.appendChild(o);
  });

  const fallback = preferred[0]?.name || orderedVoices[0]?.name || 'default';
  const target = orderedVoices.find(v => v.name === prev)?.name || fallback;
  
  if (target) {
    $select.value = target;
    console.log(`Voz seleccionada: ${target}`);
  }
}

function renderVoiceList(){
  const q=($voiceSearch && $voiceSearch.value || '').trim().toLowerCase();

  const isEsES = v => /^es([-_]?ES)?$/i.test(v.lang) || /Spanish\s*\(Spain\)/i.test(`${v.lang} ${v.name}`);
  const isEsMX = v => /^es([-_]?MX)?$/i.test(v.lang) || /Spanish\s*\(Mexico\)/i.test(`${v.lang} ${v.name}`);

  const esES = orderedVoices.filter(isEsES);
  const esMX = orderedVoices.filter(isEsMX);
  const rest = orderedVoices.filter(v => !esES.includes(v) && !esMX.includes(v));

  const groups=[
    {title:'🇪🇸 Español (España)', items: esES},
    {title:'🇲🇽 Español (México)', items: esMX},
    {title:'🌐 Otras voces',       items: rest}
  ];

  const frag=document.createDocumentFragment();
  $voiceList.innerHTML='';
  
  // Agregar opción por defecto primero
  const defaultRow = document.createElement('label');
  defaultRow.className = 'voice-item form-check';
  
  const defaultInput = document.createElement('input');
  defaultInput.type = 'radio';
  defaultInput.name = 'voice';
  defaultInput.value = 'default';
  defaultInput.id = 'voice_default';
  defaultInput.className = 'form-check-input';
  defaultInput.checked = ($select.value === 'default');
  defaultInput.addEventListener('change', () => { tempSelectedName = 'default'; });
  
  const defaultSpan = document.createElement('span');
  defaultSpan.className = 'form-check-label';
  defaultSpan.textContent = 'Voz por defecto del sistema';
  
  defaultRow.appendChild(defaultInput);
  defaultRow.appendChild(defaultSpan);
  frag.appendChild(defaultRow);

  groups.forEach(g=>{
    const items=g.items.filter(v=>{
      const t=`${v.name} ${v.lang}`.toLowerCase();
      return !q || t.includes(q);
    });
    if(items.length===0) return;

    const h=document.createElement('div');
    h.className='voice-group-title';
    h.textContent=g.title;
    frag.appendChild(h);

    items.forEach(v=>{
      const id=`voice_${v.name.replace(/\W+/g,'_')}`;
      const row=document.createElement('label');
      row.className='voice-item form-check';

      const input=document.createElement('input');
      input.type='radio';
      input.name='voice';
      input.value=v.name;
      input.id=id;
      input.className='form-check-input';
      input.checked=(v.name===$select.value);
      input.addEventListener('change',()=>{ tempSelectedName=v.name; });

      const span=document.createElement('span');
      span.className='form-check-label';
      span.textContent=`${v.name} (${v.lang}) ${v.default ? ' [DEFAULT]' : ''}`;

      row.appendChild(input);
      row.appendChild(span);
      frag.appendChild(row);
    });
  });
  $voiceList.appendChild(frag);
}

function openModal(){ 
  tempSelectedName=$select.value; 
  renderVoiceList(); 
  $voiceModal.setAttribute('aria-hidden','false'); 
  $voiceModal.classList.add('is-open'); 
  setTimeout(()=> $voiceSearch && $voiceSearch.focus(),0); 
}
function closeModal(){ 
  $voiceModal.setAttribute('aria-hidden','true'); 
  $voiceModal.classList.remove('is-open'); 
  if($voiceSearch) $voiceSearch.value=''; 
  renderVoiceList(); 
}
function confirmVoice(){ 
  if (tempSelectedName){ 
    $select.value=tempSelectedName; 
    localStorage.setItem(VOICE_KEY, tempSelectedName);
    console.log(`Voz confirmada: ${tempSelectedName}`);
    if (synth.speaking || isPaused) restartFromBoundary(); // aplica ya la nueva voz
  } 
  closeModal(); 
}

// ---------- Utilidades de habla ----------
// Inferencia simple de lang si la voz no lo trae
function inferEsFromName(name=''){
  if (/mex|mx|latino/i.test(name)) return 'es-MX';
  if (/us|usa/i.test(name)) return 'es-US';
  return 'es-ES';
}

// Verificar disponibilidad de voz
function verificarDisponibilidadVoz() {
  const selectedVoiceName = $select.value;
  if (selectedVoiceName === 'default') {
    return null; // Usar voz por defecto del sistema
  }
  
  const voices = synth.getVoices();
  const vozDisponible = voices.find(v => v.name === selectedVoiceName);
  
  if (!vozDisponible) {
    console.warn(`Voz seleccionada no disponible: ${selectedVoiceName}`);
  }
  
  return vozDisponible;
}

function makeUtter(text, startIdx=0){
  const utter = new SpeechSynthesisUtterance(text.slice(startIdx));
  const selectedVoiceName = $select.value;
  
  // Estrategia mejorada para compatibilidad móvil
  if (selectedVoiceName === 'default') {
    // Usar voz por defecto del sistema - mejor compatibilidad en móviles
    utter.lang = 'es-ES';
  } else {
    const voz = verificarDisponibilidadVoz();
    
    if (voz) {
      utter.voice = voz;
      utter.lang = voz.lang || inferEsFromName(voz.name);
    } else {
      // Fallback: buscar cualquier voz en español
      const voices = synth.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es-')) || voices[0];
      if (esVoice) {
        utter.voice = esVoice;
        utter.lang = esVoice.lang;
        console.log(`Usando voz de fallback: ${esVoice.name}`);
      } else {
        utter.lang = 'es-ES'; // Último recurso
      }
    }
  }

  utter.rate   = parseFloat($rate.value);
  utter.pitch  = parseFloat($pitch.value);
  utter.volume = parseFloat($vol.value);

  utter.onboundary = (e) => { 
    lastBoundary = startIdx + (e.charIndex || 0); 
  };
  
  utter.onend = () => { 
    console.log('Reproducción finalizada');
    currentUtter = null; 
    isPaused = false; 
    isProcessing = false; 
    setUIState('ready'); 
  };
  
  utter.onerror = (e) => { 
    console.error('Error en TTS:', e);
    currentUtter = null; 
    isPaused = false; 
    isProcessing = false; 
    setUIState('ready'); 
  };

  return utter;
}

// ---------- Handlers ----------
function hablar(){
  if (isProcessing) return;
  isProcessing = true;

  const texto = $texto.value.trim();
  if (!texto) { isProcessing = false; return; }

  if (isPaused && currentUtter) {
    try { 
      synth.resume(); 
      isPaused = false; 
      setUIState('speaking'); 
      console.log('Reanudando reproducción');
    }
    catch (e) { console.log('Error al reanudar:', e); }
    setTimeout(()=>{ isProcessing = false; }, 100);
    return;
  }

  if (synth.speaking && !isPaused) { isProcessing = false; return; }

  try {
    synth.cancel();
    currentText = texto;
    lastBoundary = 0;
    isPaused = false;
    const selectedVoiceName = $select.value;
    currentUtter = makeUtter(currentText, 0);
    synth.speak(currentUtter);
    setUIState('speaking');
    console.log(`Iniciando reproducción con voz: ${selectedVoiceName}`);

    // Verificación de voz usada vs seleccionada
    setTimeout(()=>{
      try{
        const used = currentUtter?.voice;
        if (selectedVoiceName && selectedVoiceName !== 'default' && used && used.name && used.name !== selectedVoiceName) {
          console.warn(`El navegador podría estar ignorando la voz seleccionada. Seleccionada: ${selectedVoiceName}, Usada: ${used.name}`);
        }
      }catch(_e){}
    }, 100);
  } catch (e) { 
    console.log('Error al hablar:', e); 
    isProcessing = false;
  }

  setTimeout(()=>{ isProcessing = false; }, 150);
}

function pausarReanudar(){
  if (isProcessing) return;
  isProcessing = true;

  if (!currentUtter && !synth.speaking) { isProcessing = false; return; }

  if (synth.speaking && !isPaused) {
    isPaused = true; 
    setUIState('paused');
    console.log('Pausando reproducción');
    setTimeout(()=>{ 
      try{ synth.pause(); }
      catch(e){ console.log('Error al pausar:',e); } 
      isProcessing=false; 
    }, 10);
    return;
  }

  if (isPaused && currentUtter) {
    isPaused = false; 
    setUIState('speaking');
    console.log('Reanudando reproducción');
    setTimeout(()=>{ 
      try{ synth.resume(); }
      catch(e){ 
        console.log('Error al reanudar:',e); 
        if (synth.paused) restartFromBoundary(); 
      }
      isProcessing=false;
    }, 10);
  } else { isProcessing = false; }
}

function restartFromBoundary() {
  if (!currentText || !currentUtter) return;
  const start = Math.min(lastBoundary || 0, currentText.length);
  if (start >= currentText.length) { detener(); setTimeout(hablar, 100); return; }
  try {
    synth.cancel();
    currentUtter = makeUtter(currentText, start);
    synth.speak(currentUtter);
    setUIState('speaking');
    console.log('Reiniciando reproducción desde posición:', start);
  } catch (e) { console.log('Error al reiniciar:', e); }
}

function detener(){
  if (isProcessing) return;
  try { 
    synth.cancel(); 
    currentUtter = null; 
    isPaused = false; 
    setUIState('ready'); 
    console.log('Reproducción detenida');
  }
  catch (e) { console.log('Error al detener:', e); }
}

// ---------- Eventos ----------
$btnHablar.addEventListener('click', hablar);
$btnPausa.addEventListener('click', pausarReanudar);
$btnDetener.addEventListener('click', detener);

$openPicker.addEventListener('click', openModal);
$voiceModal.addEventListener('click', (e)=>{ if(e.target.matches('[data-close]')) closeModal(); });
$confirmVoice.addEventListener('click', confirmVoice);
$voiceSearch?.addEventListener('input', renderVoiceList);

// Guardar selección si cambias en el <select> nativo (y aplicar en caliente)
$select.addEventListener('change', () => {
  localStorage.setItem(VOICE_KEY, $select.value);
  console.log(`Voz cambiada a: ${$select.value}`);
  if (synth.speaking || isPaused) restartFromBoundary();
});

// Reiniciar el progreso si cambias el texto mientras habla o está en pausa
$texto.addEventListener('input', () => {
  if (synth.speaking || isPaused) { detener(); }
});

// ---------- Inicialización mejorada ----------
function initVoicesWithRetry() {
  let attempts = 0;
  const maxAttempts = 5;
  
  function tryLoad() {
    const voices = synth.getVoices();
    if (voices.length > 0) {
      console.log(`Voces cargadas: ${voices.length}`);
      cargarVoces();
      setUIState('ready');
      detectMobile();
    } else if (attempts < maxAttempts) {
      attempts++;
      console.log(`Intento ${attempts}/${maxAttempts} para cargar voces...`);
      setTimeout(tryLoad, 500);
    } else {
      console.error('No se pudieron cargar las voces después de múltiples intentos');
      setUIState('ready');
      detectMobile();
    }
  }
  
  tryLoad();
}

// Voces (inicial + async)
function initVoices(){ 
  initVoicesWithRetry(); 
}

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
  initVoices();
  if (typeof speechSynthesis.onvoiceschanged !== 'undefined') {
    speechSynthesis.onvoiceschanged = initVoices;
  }
});