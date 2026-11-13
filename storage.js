const DB_NAME = 'kontur-inspection-v1';
let dbPromise, migrationPromise;
function database() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Закройте другие вкладки приложения.'));
  });
  return dbPromise;
}
const summary = p => ({id:p.id, name:p.name, drawings:p.drawings.length, defects:p.defects.length, updatedAt:p.updatedAt});
async function library() {
  const db = await database();
  migrationPromise ??= new Promise((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite'), store = tx.objectStore('workspace');
    const catalog = store.get('catalog');
    catalog.onsuccess = () => {
      if (catalog.result !== undefined) return;
      const old = store.get('current');
      old.onsuccess = () => {
        const p = old.result;
        if (p && (!p.id || !Array.isArray(p.drawings) || !Array.isArray(p.defects))) { tx.abort(); return; }
        store.put(p ? [summary(p)] : [], 'catalog');
        if (p) { store.put(p, `project:${p.id}`); store.put(p.id, 'activeProjectId'); }
      };
    };
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Не удалось перенести объекты. Исходные данные сохранены.'));
  });
  await migrationPromise;
  return db;
}
export async function loadProject(id) {
  const db = await library();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspace'), store = tx.objectStore('workspace');
    let result = null;
    const read = key => { if (!key) return; const r = store.get(`project:${key}`); r.onsuccess = () => { result = r.result ?? null; }; };
    if (id) read(id);
    else { const r = store.get('activeProjectId'); r.onsuccess = () => read(r.result); }
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export async function listProjects(includeDeleted = false) {
  const db = await library();
  return new Promise((resolve, reject) => {
    const r = db.transaction('workspace').objectStore('workspace').get('catalog');
    r.onsuccess = () => resolve((r.result ?? []).filter(item => includeDeleted || !item.deleted));
    r.onerror = () => reject(r.error);
  });
}
export async function storeProject(project, withSnapshot=true) {
  const db = await library();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('workspace', 'readwrite');
    const store = transaction.objectStore('workspace');
    const request = store.get('catalog');
    request.onsuccess = () => {
      if ((request.result ?? []).some(item => item.id === project.id && item.deleted)) { transaction.abort(); return; }
      const items = (request.result ?? []).filter(item => item.id !== project.id);
      store.put([...items, summary(project)], 'catalog');
      const old=store.get(`project:${project.id}`), history=store.get(`snapshots:${project.id}`);
      history.onsuccess=()=>{
        const entries=history.result??[], now=Date.now();
        if(withSnapshot && old.result && (!entries.length || now-entries[0].time>=300000)){
          const key=`snapshot:${project.id}:${now}`;
          store.put(old.result,key);entries.unshift({key,time:now});
          for(const stale of entries.splice(3))store.delete(stale.key);
          store.put(entries,`snapshots:${project.id}`);
        }
      };
      store.put(project, `project:${project.id}`);
      store.put(project.id, 'activeProjectId');
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {};
    transaction.onabort = () => {if(withSnapshot&&transaction.error?.name==='QuotaExceededError')storeProject(project,false).then(resolve,reject);else reject(transaction.error ?? new Error('Сохранение прервано.'));};
  });
}

// Move to the recoverable trash and select a remaining object in one transaction.
export async function deleteProject(id, emptyProject) {
  const db = await library();
  return new Promise((resolve, reject) => {
    const tx=db.transaction('workspace','readwrite'), store=tx.objectStore('workspace');
    let activeId;
    const active=store.get('activeProjectId');active.onsuccess=()=>{activeId=active.result;};
    const request=store.get('catalog');
    request.onsuccess=()=>{
      const items=request.result ?? [], target=items.find(item=>item.id===id);
      if(!target || target.deleted){tx.abort();return;}
      target.deleted=true;
      if(activeId===id){
        const remaining=items.find(item=>!item.deleted);
        if(remaining) activeId=remaining.id;
        else {store.put(emptyProject,`project:${emptyProject.id}`);items.push(summary(emptyProject));activeId=emptyProject.id;}
        store.put(activeId,'activeProjectId');
      }
      store.put(items,'catalog');
    };
    tx.oncomplete=()=>resolve(activeId);
    tx.onerror=tx.onabort=()=>reject(tx.error ?? new Error('Не удалось удалить объект.'));
  });
}
export async function restoreProject(id) {
  const db=await library();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('workspace','readwrite'), store=tx.objectStore('workspace'), request=store.get('catalog');
    request.onsuccess=()=>{const items=request.result ?? [];const target=items.find(item=>item.id===id);if(!target){tx.abort();return;}delete target.deleted;store.put(items,'catalog');};
    tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error ?? new Error('Не удалось восстановить объект.'));
  });
}

export async function listSnapshots(id){const db=await library();return new Promise((resolve,reject)=>{const r=db.transaction('workspace').objectStore('workspace').get(`snapshots:${id}`);r.onsuccess=()=>resolve(r.result??[]);r.onerror=()=>reject(r.error);});}
export async function loadSnapshot(key){if(!key.startsWith('snapshot:'))throw new Error('Неверный ключ копии.');const db=await library();return new Promise((resolve,reject)=>{const r=db.transaction('workspace').objectStore('workspace').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
