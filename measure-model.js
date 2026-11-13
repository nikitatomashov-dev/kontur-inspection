import {brushPath} from './measure-paint.js';
import {WORLD_LIMIT,contentBounds} from './measure-space.js';
import {strokePath} from './measure-stroke.js';
export const SHEET = { width: 1000, height: 700 };
export function createSketch(id, name, floor = '') {
  return {id,name,floor,nodes:[],edges:[],dimensions:[],labels:[]};
}
export function validateSketches(sketches) {
  if(sketches===undefined)return [];
  if(!Array.isArray(sketches)||sketches.length>100)return ['Обмеры: допускается не более 100 эскизов.'];
  const errors=[],ids=new Set(),obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const str=(v,max,required=false)=>typeof v==='string'&&v.length<=max&&(!required||!!v.trim());
  const xy=v=>obj(v)&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Math.abs(v.x)<=WORLD_LIMIT&&Math.abs(v.y)<=WORLD_LIMIT;
  for(const s of sketches){
    if(!obj(s)){errors.push('Обмеры: неверная запись эскиза.');continue;}
    if(!str(s.id,100,true)||ids.has(s.id))errors.push('Обмеры: неверный или повторный номер эскиза.');ids.add(s.id);
    if(s.construction!==undefined&&!str(s.construction,200))errors.push('Обмеры: неверная марка конструкции.');
    if(s.drawingId!==undefined&&!str(s.drawingId,100))errors.push('Обмеры: неверный чертёж связи.');
    if(s.structure!==undefined&&!['wall','column','slab','foundation','beam','roof','stairs'].includes(s.structure))errors.push('Обмеры: неверный тип конструкции.');
    if(!str(s.name,200,true)||!str(s.floor,200))errors.push('Обмеры: неверное название или этаж.');
    if(![['nodes',2000],['edges',4000],['dimensions',2000],['labels',500]].every(([k,n])=>Array.isArray(s[k])&&s[k].length<=n)){errors.push('Обмеры: неверный состав или слишком много элементов.');continue;}
    if(s.brushes!==undefined&&(!Array.isArray(s.brushes)||s.brushes.length>10000)){errors.push('Обмеры: неверный список штрихов кисти.');continue;}
    for(const b of s.brushes??[])if(!obj(b)||!/^#[0-9a-fA-F]{6}$/.test(b.color)||!Number.isFinite(b.width)||b.width<=0||b.width>1e9||!Array.isArray(b.points)||b.points.length<1||b.points.length>4096||!b.points.every(xy))errors.push('Обмеры: неверный штрих кисти.');
    const elements=new Set(),nodes=new Map();
    for(const element of [...s.nodes,...s.edges,...s.dimensions,...s.labels,...(s.brushes??[])]){
      if(!obj(element)||!str(element.id,100,true)||elements.has(element.id))errors.push('Обмеры: неверный или повторный идентификатор элемента.');
      if(obj(element))elements.add(element.id);
    }
    for(const n of s.nodes){if(!xy(n))errors.push('Обмеры: угол вне листа.');if(obj(n))nodes.set(n.id,n);}
    const links=v=>obj(v)&&nodes.has(v.a)&&nodes.has(v.b)&&v.a!==v.b&&Math.hypot(nodes.get(v.a).x-nodes.get(v.b).x,nodes.get(v.a).y-nodes.get(v.b).y)>.01;
    for(const e of s.edges)if(!links(e)||!['wall','partition','door','window'].includes(e.kind))errors.push('Обмеры: неверная стена или её углы.');
    for(const e of s.edges){
      if(!obj(e))continue;
      if(e.shape!==undefined&&!['line','arc','free'].includes(e.shape))errors.push('Обмеры: неизвестный тип линии.');
      if(e.shape==='arc'&&(!Number.isFinite(e.bulge)||Math.abs(e.bulge)<.025||Math.abs(e.bulge)>1))errors.push('Обмеры: неверная дуга.');
      if(e.stroke!==undefined&&(!Array.isArray(e.stroke)||e.stroke.length<2||e.stroke.length>2048||!e.stroke.every(p=>obj(p)&&Number.isFinite(p.u)&&Number.isFinite(p.v)&&Math.abs(p.u)<=1000&&Math.abs(p.v)<=1000)))errors.push('Обмеры: неверный штрих.');
      if(e.shape==='free'&&!Array.isArray(e.stroke))errors.push('Обмеры: отсутствует штрих.');
    }
    for(const d of s.dimensions)if(!links(d)||!Number.isFinite(d.value)||d.value<=0||d.value>1e9||!['мм','см','м'].includes(d.unit)||![42,-42].includes(d.offset))errors.push('Обмеры: неверный размер.');
    for(const l of s.labels)if(!xy(l)||!str(l.text,1000,true))errors.push('Обмеры: неверная подпись.');
  }
  return errors.slice(0,20);
}
export function measuredValue(text){
  const normalized=String(text).trim().replace(',','.');
  if(!/^\d+(?:\.\d+)?$/.test(normalized))throw new Error('Введите положительный размер числом, например 3250 или 3,25.');
  const value=Number(normalized);
  if(value<=0||value>1e9)throw new Error('Размер должен быть больше нуля и не более 1 000 000 000.');
  return value;
}
export function snappedPoint(point, origin, grid, orthogonal){
  let x=Math.max(-WORLD_LIMIT,Math.min(WORLD_LIMIT,point.x)),y=Math.max(-WORLD_LIMIT,Math.min(WORLD_LIMIT,point.y));
  if(grid){x=Math.round(x/20)*20;y=Math.round(y/20)*20;}
  if(origin&&orthogonal){if(Math.abs(x-origin.x)>=Math.abs(y-origin.y))y=origin.y;else x=origin.x;}
  return {x,y};
}
export function removeSketchElement(sketch, kind, id){
  const next=structuredClone(sketch);next[kind]=next[kind].filter(e=>e.id!==id);
  if(kind==='nodes'){next.edges=next.edges.filter(e=>e.a!==id&&e.b!==id);next.dimensions=next.dimensions.filter(e=>e.a!==id&&e.b!==id);}
  return next;
}
export function dimensionGeometry(sketch,d){
  const a=sketch.nodes.find(n=>n.id===d.a),b=sketch.nodes.find(n=>n.id===d.b);
  const length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
  return {a,b,start:{x:a.x+nx*d.offset,y:a.y+ny*d.offset},end:{x:b.x+nx*d.offset,y:b.y+ny*d.offset}};
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sketchSvg(sketch,{editing=false,grid=false,selected=null,chain=null,projectName='',view={x:0,y:0,width:1000,height:700}}={}){
  const selectedId=selected?.id, node=id=>sketch.nodes.find(n=>n.id===id);
  const attrs=(kind,item,label)=>editing?`data-kind="${kind}" data-id="${esc(item.id)}" role="button" tabindex="0" aria-label="${esc(label)}"`:'';
  const walls=sketch.edges.map(e=>{const a=node(e.a),b=node(e.b),d=strokePath(a,b,e);if(['door','window'].includes(e.kind)){const L=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;return `<g ${attrs('edges',e,e.kind==='door'?'Дверь':'Окно')} transform="translate(${a.x} ${a.y}) rotate(${angle})" stroke="${selectedId===e.id?'#de7c30':'#28625c'}" fill="none" stroke-width="3"><path d="M0 0H${L}" stroke="white" stroke-width="14"/>${e.kind==='door'?`<path d="M0 0V${-L}M0 ${-L}A${L} ${L} 0 0 1 ${L} 0"/>`:`<path d="M0 -5H${L}M0 0H${L}M0 5H${L}M0 -8V8M${L} -8V8"/>`}<path d="M0 0H${L}" stroke="transparent" stroke-width="24" vector-effect="non-scaling-stroke"/></g>`;}return `<g ${attrs('edges',e,e.shape==='arc'?'Дуга':e.shape==='free'?'Свободная линия':e.kind==='wall'?'Стена':'Перегородка')}><path d="${d}" fill="none" stroke="${selectedId===e.id?'#de7c30':'#344f55'}" stroke-width="${e.kind==='wall'?8:4}" stroke-linecap="round"/>${editing?`<path d="${d}" fill="none" stroke="transparent" stroke-width="20" vector-effect="non-scaling-stroke"/>`:''}</g>`;}).join('');
  const dimensions=sketch.dimensions.map(d=>{const {a,b,start:c,end:f}=dimensionGeometry(sketch,d),mx=(c.x+f.x)/2,my=(c.y+f.y)/2,label=`${String(d.value).replace('.',',')} ${d.unit}`;return `<g ${attrs('dimensions',d,'Размер '+label)} stroke="${selectedId===d.id?'#de7c30':'#39736c'}" stroke-width="1.6"><path d="M${a.x} ${a.y}L${c.x} ${c.y}M${b.x} ${b.y}L${f.x} ${f.y}M${c.x} ${c.y}L${f.x} ${f.y}" fill="none"/><path d="M${c.x-5} ${c.y+5}l10 -10M${f.x-5} ${f.y+5}l10 -10"/><rect x="${mx-label.length*4.9-7}" y="${my-13}" width="${label.length*9.8+14}" height="26" fill="white" stroke="none"/><text x="${mx}" y="${my+5}" text-anchor="middle" fill="${selectedId===d.id?'#b75816':'#285a54'}" stroke="none" font-size="17">${esc(label)}</text></g>`;}).join('');
  const labels=sketch.labels.map(l=>`<g ${attrs('labels',l,'Подпись '+l.text)}><text x="${l.x}" y="${l.y}" fill="${selectedId===l.id?'#b75816':'#344f55'}" font-size="18" paint-order="stroke" stroke="white" stroke-width="4">${l.text.split('\n').map((line,i)=>`<tspan x="${l.x}" dy="${i?'1.3em':'0'}">${esc(line)}</tspan>`).join('')}</text></g>`).join('');
  const nodes=editing?sketch.nodes.map((n,i)=>`<g ${attrs('nodes',n,`Угол ${i+1}`)}><circle cx="${n.x}" cy="${n.y}" r="10" fill="transparent" stroke="transparent" stroke-width="36" vector-effect="non-scaling-stroke"/><circle cx="${n.x}" cy="${n.y}" r="8" fill="${selectedId===n.id||chain===n.id?'#e4934c':'white'}" stroke="#136f63" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/></g>`).join(''):'';
  const gridSvg=grid?`<defs><pattern id="measureGridPattern" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#dbe5e5" stroke-width=".6"/></pattern></defs><rect x="${view.x}" y="${view.y}" width="${view.width}" height="${view.height}" fill="url(#measureGridPattern)"/>`:'';
  const header=editing?'':`<text x="30" y="30" font-size="18" fill="#344f55">${esc(projectName.slice(0,80))}</text><text x="30" y="57" font-size="18" fill="#344f55">${esc((sketch.name+(sketch.floor?' · Этаж: '+sketch.floor:'')).slice(0,90))}</text>`;
  const bounds=contentBounds(sketch),factor=Math.min(1000/bounds.width,700/bounds.height),tx=(1000-bounds.width*factor)/2-bounds.x*factor,ty=(700-bounds.height*factor)/2-bounds.y*factor;
  const paint=(sketch.brushes??[]).map(b=>`<path ${attrs('brushes',b,'Штрих кисти')} d="${brushPath(b.points)}" fill="none" stroke="${b.color}" stroke-width="${b.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const art=walls+paint+'<g class="dimension-layer">'+dimensions+'</g>'+labels+nodes;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${editing?view.x+' '+view.y+' '+view.width+' '+view.height:'-65 -90 1130 850'}" width="${editing?view.width:2260}" height="${editing?view.height:1700}" style="font-family:Arial,sans-serif;user-select:none"><rect x="${editing?view.x:-65}" y="${editing?view.y:-90}" width="${editing?view.width:1130}" height="${editing?view.height:850}" fill="white"/>${editing?'':`<g transform="translate(-40,-85)">${header}</g>`}${gridSvg}${editing?art:`<g transform="translate(${tx} ${ty}) scale(${factor})">${art}</g>`}${editing?'':'<text x="-35" y="735" font-size="16" fill="#5c6e73">Обмерный эскиз. Не в масштабе. Размеры внесены по результатам замеров.</text>'}</svg>`;
}
