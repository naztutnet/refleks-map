"use strict";
(async function () {
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function readJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(response.status);
  return response.json();
}
let data;
try { data = await readJSON('data.json'); }
catch (error) {
  $('locationList').innerHTML = '<li class="empty-state">Съёмочные данные не загрузились. Обновите страницу.</li>';
  return;
}
let housing = {accommodations: []}, housingError = false;
try { housing = await readJSON('accommodations.json?v=20261027-1'); }
catch (error) { housingError = true; }
const {shifts} = data;
const shootings = data.locations;
const accommodations = housing.accommodations.map(l => ({...l, layer: 'housing'}));
const locations = [...shootings, ...accommodations];
const isHousing = l => l.layer === 'housing';
const byDate = new Map(shifts.map(s => [s.date, s]));
const labels = {address:'Адрес из списка',candidate:'Вариант',missing:'Адрес уточняется'};
const kinds = {
  hotel: {label:'Гостиницы', singular:'Гостиница', short:'Г', color:'#a44b18'},
  aparthotel: {label:'Апарт-отели', singular:'Апарт-отель', short:'А', color:'#137769'},
  apartment: {label:'Квартиры', singular:'Квартира', short:'К', color:'#7950a1'},
  studio: {label:'Студии', singular:'Студии', short:'С', color:'#a16a00'}
};
let activeLayer = 'all', activeType = 'all', activeDate = 'all', activeStatus = 'all', activeTerm = 'all';
let search = '', selected = null, map = null;
const markers = new Map();
const mobile = () => matchMedia('(max-width:720px)').matches;
const padding = () => mobile()
  ? {paddingTopLeft:[25,35],paddingBottomRight:[25,Math.round(innerHeight*.59)],maxZoom:15}
  : {paddingTopLeft:[440,45],paddingBottomRight:[45,45],maxZoom:15};
const datesFor = l => l.dates.filter(d => activeDate === 'all' || activeDate === d);
function filtered() {
  return locations.filter(l => {
    const home = isHousing(l);
    if ((activeLayer === 'housing' && !home) || (activeLayer === 'shooting' && home)) return false;
    if (home) {
      if (activeType !== 'all' && l.kind !== activeType) return false;
      if (activeTerm !== 'all' && (l.kind !== 'apartment' || l.rentalTerm !== activeTerm)) return false;
    } else {
      if (activeDate !== 'all' && !l.dates.includes(activeDate)) return false;
      if (activeStatus !== 'all' && l.status !== activeStatus) return false;
    }
    const text = home
      ? [l.name,l.address,kinds[l.kind].label,l.price,l.note,l.beds,l.parking,l.rentalTermLabel,l.regionLabel]
      : [l.name,l.address,l.note,l.coords?.join(' '),...l.dates,...l.dates.map(d => byDate.get(d).scenes.map(s => s.id+' '+s.object+' '+s.sub).join(' '))];
    return !search || text.join(' ').toLocaleLowerCase('ru').includes(search);
  });
}
const urlRoute = l => 'https://yandex.ru/maps/?rtext='+encodeURIComponent('~'+l.coords.join(','))+'&rtt=auto';
const mapURL = l => l.yandex || 'https://yandex.ru/maps/?text='+encodeURIComponent('Санкт-Петербург, '+l.address);
function shootingDetails(l){return `<article class="popup"><div class="popup__label">РЕФЛЕКС · ЗИМНИЙ БЛОК</div><h2>${esc(l.name)}</h2><span class="badge ${l.status}">${labels[l.status]}</span><p class="address">${esc(l.address)}</p>${l.coords?`<button class="coords" data-copy="${esc(l.coords.join(', '))}" aria-label="Копировать координаты"><span class="coords__label">По адресу здания:</span><span class="coords__value">${l.coords.map(x=>x.toFixed(6)).join(', ')}</span><span class="coords__hint">Копировать</span></button>`:''}${l.note?`<p class="data-note">${esc(l.note)}</p>`:''}<div class="schedule">${datesFor(l).map(d=>{const s=byDate.get(d);return `<div class="schedule-row"><strong>${d} · ${s.weekday}</strong><span>Смена №${s.number}</span></div><p>${esc(s.time)} · ${esc(s.mode)}</p>${s.special==='НОЧНАЯ СМЕНА'?'':s.note.includes('РАННЯЯ')?'<p><b>Ранняя смена</b></p>':''}`}).join('')}</div><nav class="popup-actions">${l.coords?`<a class="popup-action" href="${esc(urlRoute(l))}" target="_blank" rel="noopener">Маршрут ↗</a>`:''}${l.status!=='missing'?`<a class="popup-action popup-action--quiet" href="${esc(l.yandex)}" target="_blank" rel="noopener">Яндекс Карты ↗</a>`:''}<button class="popup-action popup-action--quiet" data-copy-location="${l.id}">Скопировать</button></nav>${datesFor(l).map(d=>{const s=byDate.get(d);return `<details><summary>КПП · ${d} · ${s.sceneCount} сцен</summary><p>Все сцены смены. Распределение сцен по адресам и варианты объектов уточняются.</p>${s.scenes.map(sc=>`<div class="scene"><strong>${esc(sc.id)} · ${esc(sc.mode)}</strong>${esc(sc.object)}${sc.sub?' / '+esc(sc.sub):''}<p>${esc(sc.summary)}</p></div>`).join('')}</details>`}).join('')}<details><summary>Данные и уточнения</summary><p>Адреса: рабочий список пользователя. Даты, номера смен, сцены: КПП от 26.10.2026, вкладка «Съемочная группа №1». Диапазон исходного КПП: 24.11–27.12.2026.</p><p>08:00–08:00 в исходной таблице показано как «Время уточняется». Точки сборов, въезды, парковки и порядок переездов не заданы.</p>${l.geoSource?`<p><a href="${esc(l.geoSource)}" target="_blank" rel="noopener">Геопривязка здания · OpenStreetMap ↗</a></p>`:''}<p>Наличие адреса не означает подтверждённое бронирование.</p></details></article>`}
function shootingText(l){return ['РЕФЛЕКС · ЗИМНИЙ БЛОК',l.name,l.address,labels[l.status],...datesFor(l).map(d=>{const s=byDate.get(d);return `${d}.2026 (${s.weekday}) · Смена №${s.number}\n${s.time} · ${s.mode}`}),l.note,l.status!=='missing'?l.yandex:'Точный адрес не задан'].filter(Boolean).join('\n')}

function occupancyRule(l) {
  return l.kind === 'apartment' && [2,3].includes(l.rooms)
    ? 'Двух- и трёхкомнатные квартиры: до 80 000 ₽ за весь заезд 24.11–25.12, включая обязательные доплаты. Возвратный залог — отдельно. Каждому изолированная комната: 2-комнатная — максимум 2 человека; 3-комнатная — до 3 только после проверки планировки.'
    : 'Приоритет — отдельная комната каждому. По 2–3 человека — запасной вариант после согласования. Лимит: 1 200 ₽/чел./сутки, 37 200 ₽ за 31 ночь. Полную стоимость и спальные места нужно подтвердить.';
}
function housingDetails(l) {
  const k = kinds[l.kind];
  return `<article class="popup housing-popup" style="--housing-color:${k.color}">
    <div class="popup__label">РЕФЛЕКС · ЖИЛЬЁ · 24.11–25.12.2026</div>
    <h2>${esc(l.name)}</h2><span class="badge housing-badge">${esc(k.singular)}</span>
    <p class="address">${esc(l.address)}</p>
    <p class="housing-price">${esc(l.price)}</p>
    <p class="budget-status budget-status--${esc(l.budgetStatus)}">${esc(l.budgetLabel)}</p>
    <p class="availability-note">${esc(l.availability)}</p>
    <dl class="housing-facts">${l.rentalTermLabel ? `<dt>Срок аренды</dt><dd>${esc(l.rentalTermLabel)}</dd>` : ''}<dt>Парковка</dt><dd>${esc(l.parking)}</dd><dt>Доплаты и залог</dt><dd>${esc(l.fees)}</dd>
      <dt>${esc(l.occupancyTitle || "Основной вариант — по одному")}</dt><dd>${esc(l.beds)}</dd>
      <dt>${l.kind === "apartment" ? "Условия размещения" : "Запасной вариант"}</dt><dd>${esc(l.fallbackNote)}</dd>
      <dt>Для экспедиции</dt><dd>${esc(l.note)}</dd></dl>
    <p class="data-note">${esc(occupancyRule(l))}</p>
    <nav class="popup-actions">
      <a class="popup-action" href="${esc(l.source)}" target="_blank" rel="noopener">Сайт и условия ↗</a>
      <a class="popup-action popup-action--quiet" href="${esc(mapURL(l))}" target="_blank" rel="noopener">Яндекс Карты ↗</a>
      ${l.coords ? `<a class="popup-action popup-action--quiet" href="${esc(urlRoute(l))}" target="_blank" rel="noopener">Маршрут ↗</a>` : ''}
      <button class="popup-action popup-action--quiet" data-copy-location="${l.id}">Скопировать</button>
    </nav>
    ${l.planSource ? `<p><a href="${esc(l.planSource)}" target="_blank" rel="noopener">План квартиры ↗</a></p>` : ''}
    ${l.phone ? `<p><a href="tel:${l.phone.replace(/[^+\d]/g,'')}">${esc(l.phone)}</a></p>` : ''}
    <details><summary>Источники и точка на карте</summary>
      <p>Проверка опубликованных условий: ${esc(l.checkedAt)}. Наличие на даты экспедиции не подтверждалось.</p>
      <p><a href="${esc(l.source)}" target="_blank" rel="noopener">Источник предложения ↗</a></p>
      ${l.secondarySource ? `<p><a href="${esc(l.secondarySource)}" target="_blank" rel="noopener">Дополнительный источник ↗</a></p>` : ''}
      <p>${esc(l.geoNote || 'Метка по адресу здания. Вход и место посадки группы уточняются.')}</p>
      ${l.geoSource ? `<p><a href="${esc(l.geoSource)}" target="_blank" rel="noopener">Геопривязка ↗</a></p>` : ''}
    </details></article>`;
}
function details(l) { return isHousing(l) ? housingDetails(l) : shootingDetails(l); }
function telegram(l) {
  return isHousing(l)
    ? ['РЕФЛЕКС · ЖИЛЬЁ · 24.11–25.12.2026',l.name,l.address,kinds[l.kind].singular,l.price,l.budgetLabel,occupancyRule(l),l.rentalTermLabel,'Парковка: '+l.parking,l.fees,l.beds,l.fallbackNote,l.note,l.availability,l.phone,l.source].filter(Boolean).join('\n')
    : shootingText(l);
}
function closeDetails() {
  const el = $('mobileDetails');
  el.classList.remove('is-open','desktop-details');
  el.setAttribute('aria-hidden','true');
  document.body.classList.remove('mobile-detail-open');
  map?.closePopup();
}
function openDetails(l) {
  const el = $('mobileDetails');
  el.innerHTML = '<button class="mobile-details__close" data-close aria-label="Закрыть карточку">×</button>'+details(l);
  el.classList.toggle('desktop-details',!mobile());
  el.classList.add('is-open'); el.setAttribute('aria-hidden','false'); el.scrollTop = 0;
  if (mobile()) document.body.classList.add('mobile-detail-open');
}
function select(id) {
  const l = locations.find(x => x.id === id);
  if (!l) return;
  selected = id; closeDetails(); renderList(filtered());
  const marker = markers.get(id);
  if (map && marker && l.coords) {
    map.flyTo(l.coords,Math.max(map.getZoom(),15),{duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:.5});
    if (!mobile()) marker.setPopupContent(details(l)).openPopup(); else openDetails(l);
  } else openDetails(l);
  document.querySelectorAll('.marker-shell').forEach(n => n.classList.remove('is-active'));
  marker?.getElement()?.classList.add('is-active');
}
function card(l) {
  if (isHousing(l)) {
    const k = kinds[l.kind];
    return `<li><button class="location-card housing-card${selected===l.id?' is-selected':''}" data-location-id="${l.id}" style="--housing-color:${k.color}">
      <span class="housing-card-icon" aria-hidden="true">${k.short}</span><span class="card-main">
      <span class="card-title">${esc(l.name)}</span><span class="card-address">${esc(l.address)}</span>
      ${l.rentalTermLabel?`<span class="card-meta">${esc(l.rentalTermLabel)}</span>`:''}<span class="card-meta housing-card-price">${esc(l.price)}</span><span class="card-meta budget-status--${esc(l.budgetStatus)}">${esc(l.budgetLabel)}</span><span class="card-meta">${esc(k.singular)} · ${esc(l.regionLabel || (l.priority==='reserve'?'Резерв по расположению':'Центральная часть города'))}</span></span><span class="card-arrow">›</span></button></li>`;
  }
  const d = datesFor(l)[0], s = byDate.get(d), [day,month] = d.split('.');
  return `<li><button class="location-card${selected===l.id?' is-selected':''}" data-location-id="${l.id}" data-status="${l.status}"><span class="card-date"><strong>${day}</strong><small>.${month}</small></span><span class="card-main"><span class="card-title">${esc(l.name)}</span><span class="card-address">${esc(l.address)}</span><span class="card-meta">${datesFor(l).join(' · ')} · ${l.status==='address'?s.mode:labels[l.status]}</span></span><span class="card-arrow">›</span></button></li>`;
}
function renderList(items) {
  if (!items.length) {
    $('locationList').innerHTML = '<li class="empty-state">По этому фильтру объектов нет.<br>Измените запрос или сбросьте фильтры.</li>';
    return;
  }
  let previous = null;
  $('locationList').innerHTML = items.map(l => {
    const group = isHousing(l) ? 'housing' : 'shooting';
    const heading = activeLayer === 'all' && group !== previous
      ? `<li class="list-group-title">${group==='housing'?'Варианты жилья':'Съёмочные локации'}</li>` : '';
    previous = group;
    return heading + card(l);
  }).join('');
}
function update() {
  const items = filtered(); renderList(items);
  const homes = items.filter(isHousing).length;
  $('resultCount').textContent = `Съёмки: ${items.length-homes} · Жильё: ${homes}`;
  const visible = new Set(items.map(l => l.id));
  for (const [id, marker] of markers) {
    if (visible.has(id) && !map.hasLayer(marker)) marker.addTo(map);
    if (!visible.has(id) && map.hasLayer(marker)) marker.remove();
  }
}
function fit() {
  const points = filtered().filter(l => l.coords);
  if (map && points.length) {
    map.stop();
    map.fitBounds(L.latLngBounds(points.map(l => l.coords)),{...padding(),animate:false});
  }
}
if (typeof L !== 'undefined') {
  map = L.map('map',{zoomControl:false,minZoom:7,maxZoom:19});
  L.control.zoom({position:'topright'}).addTo(map);
  L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri · Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China, OpenStreetMap contributors, GIS User Community'}).addTo(map);
  for (const l of locations.filter(x => x.coords)) {
    const home = isHousing(l), k = home ? kinds[l.kind] : null;
    const night = !home && l.dates.every(d => byDate.get(d).mode === 'Ночная смена');
    const width = home ? 34 : l.dates.length > 1 ? 110 : 60;
    const icon = L.divIcon({
      className:'marker-shell '+(home?'housing-marker-shell':l.status==='candidate'?'marker-candidate':''),
      html:home ? `<div class="housing-marker" style="--housing-color:${k.color}">${k.short}</div>` : `<div class="map-marker${night?' map-marker--night':''}"><span>${l.dates.join(' / ')}</span></div>`,
      iconSize:[width,43],iconAnchor:[width/2,43],popupAnchor:[0,-44]
    });
    const marker = L.marker(l.coords,{icon,title:l.name,riseOnHover:true})
      .bindPopup(details(l),{maxWidth:390,minWidth:280,autoPanPaddingTopLeft:[430,35],autoPanPaddingBottomRight:[25,35]});
    marker.on('click',() => select(l.id)); markers.set(l.id,marker);
  }
} else $('map').innerHTML = '<div class="load-error"><strong>Подложка карты не загрузилась.</strong>Список объектов и карточки доступны. Проверьте подключение к интернету.</div>';
$('dateFilters').innerHTML = '<button class="chip is-active" data-date="all">Все даты</button>'+shifts.map(s => `<button class="chip" data-date="${s.date}" title="${s.weekday} · Смена №${s.number}">${s.date}</button>`).join('');
$('housingFilters').innerHTML = '<button class="chip" data-type="all">Все типы</button>'+Object.entries(kinds).map(([type,k]) => `<button class="chip" data-type="${type}" style="--housing-color:${k.color}">${k.label} <span class="chip-count">${accommodations.filter(l=>l.kind===type).length}</span></button>`).join('');
for (const option of $('rentalTerm').options) {if(option.value!=='all')option.textContent += ' ('+accommodations.filter(l=>l.kind==='apartment'&&l.rentalTerm===option.value).length+')';}
$('housingNotice').textContent = housingError ? 'Жильё не загрузилось. Обновите страницу; съёмочные объекты доступны.' : housing.notice;
function syncButtons() {
  for (const [selector,key,value] of [['[data-date]','date',activeDate],['#statusFilters [data-status]','status',activeStatus],['[data-layer]','layer',activeLayer],['[data-type]','type',activeType]]) {
    document.querySelectorAll(selector).forEach(n => {
      const active = n.dataset[key] === value;
      n.classList.toggle('is-active',active); n.setAttribute('aria-pressed',active);
    });
  }
  $('shootingControls').hidden = activeLayer === 'housing';
  $('housingControls').hidden = activeLayer === 'shooting';
  $('rentalTerm').value = activeTerm;
  $('rentalTerm').disabled = activeType !== 'all' && activeType !== 'apartment';
  $('shootingSummary').textContent = 'Съёмки: '+(activeDate==='all'?'все даты':activeDate)+(activeStatus==='all'?'':' · '+labels[activeStatus]);
  $('filterHint').textContent = activeLayer === 'all' ? 'Дата и статус фильтруют только съёмки. Жильё остаётся для сравнения.' : '';
}
function saveFilters() {
  const params = new URLSearchParams();
  if (activeLayer !== 'all') params.set('layer',activeLayer);
  if (activeType !== 'all') params.set('type',activeType);
  if (activeDate !== 'all') params.set('date',activeDate);
  if (activeStatus !== 'all') params.set('status',activeStatus);
  if (activeTerm !== 'all') params.set('term',activeTerm);
  if (search) params.set('q',search);
  history.replaceState(null,'',location.pathname+location.search+(params.size?'#'+params.toString():''));
}
function applyFilters() {
  selected = null; closeDetails(); syncButtons(); update(); fit(); saveFilters();
}
$('layerFilters').onclick = e => {
  const n = e.target.closest('[data-layer]'); if (!n) return;
  activeLayer = n.dataset.layer;
  $('shootingControls').open = activeLayer === 'shooting';
  applyFilters();
};
$('housingFilters').onclick = e => { const n=e.target.closest('[data-type]'); if(n){activeType=n.dataset.type;if(!['all','apartment'].includes(activeType))activeTerm='all';applyFilters();} };
$('rentalTerm').onchange = e => {activeTerm=e.target.value;if(activeTerm!=='all'){activeType='apartment';activeLayer='housing';}applyFilters();};
$('dateFilters').onclick = e => { const n=e.target.closest('[data-date]'); if(n){activeDate=n.dataset.date;applyFilters();} };
$('statusFilters').onclick = e => { const n=e.target.closest('[data-status]'); if(n){activeStatus=n.dataset.status;applyFilters();} };
$('search').oninput = e => { search=e.target.value.trim().toLocaleLowerCase('ru'); selected=null;closeDetails();update();saveFilters(); };
$('locationList').onclick = e => { const n=e.target.closest('[data-location-id]'); if(n)select(Number(n.dataset.locationId)); };
$('fitButton').onclick = () => { closeDetails();fit(); };
$('resetButton').onclick = () => {
  activeLayer='all';activeType='all';activeDate='all';activeStatus='all';activeTerm='all';search='';$('search').value='';$('shootingControls').open=false;applyFilters();
};
async function copy(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const el=document.createElement('textarea');el.value=text;document.body.appendChild(el);el.select();
  const ok=document.execCommand('copy');el.remove();if(!ok)throw Error('copy');
}
document.addEventListener('click',async e => {
  if(e.target.closest('[data-close]'))return closeDetails();
  const n=e.target.closest('[data-copy],[data-copy-location]');if(!n)return;
  const initial=n.innerHTML;
  try {
    await copy(n.hasAttribute('data-copy')?n.dataset.copy:telegram(locations.find(l=>l.id===Number(n.dataset.copyLocation))));
    n.textContent='Скопировано';
  } catch(error) { n.textContent='Не удалось скопировать'; }
  setTimeout(()=>n.innerHTML=initial,1600);
},true);
document.addEventListener('keydown',e => { if(e.key==='Escape')closeDetails(); });
window.addEventListener('resize',() => {
  map?.invalidateSize();
  if (!selected) fit();
  if(selected && $('mobileDetails').classList.contains('is-open'))openDetails(locations.find(l=>l.id===selected));
});
const params = new URLSearchParams(location.hash.slice(1));
if(['housing','shooting'].includes(params.get('layer')))activeLayer=params.get('layer');
if(Object.hasOwn(kinds,params.get('type')))activeType=params.get('type');
if(['monthly','daily'].includes(params.get('term'))){activeTerm=params.get('term');activeType='apartment';activeLayer='housing';}
if(byDate.has(params.get('date')))activeDate=params.get('date');
if(Object.hasOwn(labels,params.get('status')))activeStatus=params.get('status');
search=(params.get('q')||'').toLocaleLowerCase('ru');$('search').value=search;
$('shootingControls').open=activeLayer==='shooting'||activeDate!=='all'||activeStatus!=='all';
syncButtons();update();fit();
window.reflexMap={data,housing,filtered,select,fit};
})();
