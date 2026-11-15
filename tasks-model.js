export const TASK_STATUS={planned:'Запланировано',done:'Выполнено',blocked:'Недоступно'};
export function validateTasks(tasks,drawings){
 if(tasks===undefined)return [];
 if(!Array.isArray(tasks)||tasks.length>10000)return ['Некорректный список заданий.'];
 const ids=new Set(),numbers=new Set(),errors=[];
 for(const t of tasks){if(!t||typeof t.id!=='string'||!t.id||t.id.length>100||ids.has(t.id)||!Number.isSafeInteger(t.number)||t.number<1||numbers.has(t.number)||!drawings.some(d=>d.id===t.drawingId)||![t.x,t.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Object.hasOwn(TASK_STATUS,t.status)||typeof t.title!=='string'||!t.title.trim()||t.title.length>500||typeof t.note!=='string'||t.note.length>5000){errors.push('Некорректное задание на плане.');continue;}ids.add(t.id);numbers.add(t.number);}
 return errors;
}
export const validOriginal=p=>p.originalImageData===undefined||(typeof p.originalImageData==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.originalImageData));
